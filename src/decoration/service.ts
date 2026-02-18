import { inject, injectable } from 'inversify'
import * as vscode from 'vscode'
import { TOKENS } from '@/di/tokens'
import { Logger } from '@/logger'
import { TypeScriptParser } from '@/parser'
import { SymbolConfidence, type SymbolKind } from '@/symbol'
import type { SymbolColorMap } from '@/theme'
import { TypeScriptLanguageService, TypeScriptServerProbe } from '@/typescript/language'
import type { ResolveTarget } from './resolver'
import { SymbolResolver } from './resolver'
import type { DocumentCache, SymbolOccurrence } from './types'

interface DecorationContext {
  occurrences: Map<string, SymbolOccurrence>
  importSectionText: string
}

export type SymbolResolverFactory = (
  document: vscode.TextDocument,
  targets: Map<string, ResolveTarget>,
  languageService: TypeScriptLanguageService,
) => SymbolResolver

@injectable()
export class DecorationService implements vscode.Disposable {
  private readonly logger = Logger.create(DecorationService)
  private readonly decorationTypes = new Map<string, vscode.TextEditorDecorationType>()
  private readonly documentCaches = new Map<string, DocumentCache>()
  private readonly activeResolvers = new Map<string, SymbolResolver>()
  private colors: SymbolColorMap = {}

  constructor(
    private readonly languageService: TypeScriptLanguageService,
    private readonly probe: TypeScriptServerProbe,
    private readonly parser: TypeScriptParser,
    @inject(TOKENS.SymbolResolverFactory) private readonly createSymbolResolver: SymbolResolverFactory,
  ) {}

  setColors(colors: SymbolColorMap) {
    this.colors = colors
    for (const type of this.decorationTypes.values()) {
      type.dispose()
    }
    this.decorationTypes.clear()
  }

  async applyImportDecorations(editor: vscode.TextEditor) {
    const document = editor.document
    const docUri = document.uri.toString()

    this.probe.cancel(docUri)
    this.clearDecorations(editor)

    const context = this.buildContext(document)
    if (!context) {
      return
    }

    const { symbolKinds, targetsToResolve } = this.loadCachedKinds(docUri, context)

    if (targetsToResolve.size === 0) {
      this.logger.debug(`all ${symbolKinds.size} symbols resolved from cache`)
      this.applyDecorationsToEditor(editor, context.occurrences, symbolKinds)
      return
    }

    this.logger.info(`resolving ${targetsToResolve.size} symbols, ${symbolKinds.size} from cache`)

    const [, firstTarget] = targetsToResolve.entries().next().value!
    const proceed = await this.probe.waitForReady(docUri, document, firstTarget.range.start)
    if (!proceed) {
      return
    }

    const resolver = this.createSymbolResolver(document, targetsToResolve, this.languageService)
    this.activeResolvers.set(docUri, resolver)

    const isStale = () => this.activeResolvers.get(docUri) !== resolver

    resolver.onPhase((phaseKinds) => {
      if (isStale()) {
        return
      }
      for (const [symbol, kind] of phaseKinds) {
        const existing = symbolKinds.get(symbol)
        if (!existing || SymbolConfidence[kind] >= SymbolConfidence[existing]) {
          symbolKinds.set(symbol, kind)
        }
      }
      this.applyDecorationsToEditor(editor, context.occurrences, symbolKinds)
    })

    const resolved = await resolver.resolve()

    if (isStale()) {
      return
    }

    for (const [symbol, kind] of resolved) {
      const existing = symbolKinds.get(symbol)
      if (!existing || SymbolConfidence[kind] >= SymbolConfidence[existing]) {
        symbolKinds.set(symbol, kind)
      }
    }

    const unresolved = [...targetsToResolve.keys()].filter((s) => !symbolKinds.has(s))
    if (unresolved.length > 0) {
      this.logger.info(`could not resolve: ${unresolved.map((s) => `'${s}'`).join(', ')}`)
    }

    this.applyDecorationsToEditor(editor, context.occurrences, symbolKinds)
    this.documentCaches.set(docUri, { importSectionText: context.importSectionText, symbolKinds: new Map(symbolKinds) })

    if (!isStale()) {
      this.activeResolvers.delete(docUri)
    }
  }

  clearDocumentCache(uri: string) {
    this.probe.cancel(uri)
    this.activeResolvers.delete(uri)
    this.documentCaches.delete(uri)
  }

  dispose() {
    this.probe.dispose()
    this.activeResolvers.clear()
    for (const type of this.decorationTypes.values()) {
      type.dispose()
    }
    this.decorationTypes.clear()
    this.documentCaches.clear()
  }

  private buildContext(document: vscode.TextDocument): DecorationContext | null {
    const text = document.getText()
    const statements = this.parser.parseImports(text)

    if (statements.length === 0) {
      return null
    }

    const occurrences = new Map<string, SymbolOccurrence>()
    for (const s of statements) {
      if (!occurrences.has(s.localName)) {
        occurrences.set(s.localName, {
          source: s.source,
          range: new vscode.Range(s.startLine, s.startColumn, s.endLine, s.endColumn),
        })
      }
    }

    const importEndLine = Math.max(...statements.map((s) => s.endLine)) + 1
    const importSectionText = text.split('\n').slice(0, importEndLine).join('\n')

    return { occurrences, importSectionText }
  }

  private loadCachedKinds(docUri: string, context: DecorationContext) {
    const cached = this.documentCaches.get(docUri)
    const reusableCache = cached && cached.importSectionText === context.importSectionText ? cached.symbolKinds : null

    const symbolKinds = new Map<string, SymbolKind>()
    const targetsToResolve = new Map<string, SymbolOccurrence>()

    for (const [symbol, occurrence] of context.occurrences) {
      const kind = reusableCache?.get(symbol)
      if (kind) {
        symbolKinds.set(symbol, kind)
      } else {
        targetsToResolve.set(symbol, occurrence)
      }
    }

    return { symbolKinds, targetsToResolve }
  }

  private clearDecorations(editor: vscode.TextEditor) {
    for (const type of this.decorationTypes.values()) {
      editor.setDecorations(type, [])
    }
  }

  private applyDecorationsToEditor(
    editor: vscode.TextEditor,
    occurrences: Map<string, SymbolOccurrence>,
    symbolKinds: Map<string, SymbolKind>,
  ) {
    const rangesByColor = new Map<string, vscode.Range[]>()

    for (const [symbol, { range }] of occurrences) {
      const kind = symbolKinds.get(symbol)
      const color = kind ? this.colors[kind] : undefined
      if (!color) {
        continue
      }

      const ranges = rangesByColor.get(color) ?? []
      ranges.push(range)
      rangesByColor.set(color, ranges)
    }

    // Clear decorations for colors no longer in use, then apply current
    for (const [color, type] of this.decorationTypes) {
      if (!rangesByColor.has(color)) {
        editor.setDecorations(type, [])
      }
    }

    for (const [color, ranges] of rangesByColor) {
      editor.setDecorations(this.getDecorationType(color), ranges)
    }
  }

  private getDecorationType(color: string) {
    let type = this.decorationTypes.get(color)
    if (!type) {
      type = vscode.window.createTextEditorDecorationType({ color })
      this.decorationTypes.set(color, type)
    }
    return type
  }
}
