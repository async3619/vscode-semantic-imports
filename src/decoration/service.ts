import * as vscode from 'vscode'
import { parseImports } from '../importParser'
import type { BaseSymbolResolver, SymbolKind } from '../symbol'
import { HoverSymbolResolver, PluginSymbolResolver, SemanticTokenSymbolResolver, TsServerLoadingError } from '../symbol'
import type { SymbolColorMap } from '../theme'
import type { DocumentCache, SymbolOccurrence } from './types'

const MAX_RETRIES = 5
const RETRY_DELAY_MS = 500

interface ResolverPhase {
  resolver: BaseSymbolResolver
}

export class DecorationService implements vscode.Disposable {
  private readonly phases: ResolverPhase[]
  private readonly decorationTypes = new Map<string, vscode.TextEditorDecorationType>()
  private readonly documentCaches = new Map<string, DocumentCache>()
  private readonly retryTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private colors: SymbolColorMap

  constructor(colors: SymbolColorMap = {}) {
    this.colors = colors
    this.phases = [
      { resolver: new PluginSymbolResolver() },
      { resolver: new HoverSymbolResolver() },
      { resolver: new SemanticTokenSymbolResolver() },
    ]
  }

  setColors(colors: SymbolColorMap) {
    this.colors = colors
    for (const type of this.decorationTypes.values()) {
      type.dispose()
    }
    this.decorationTypes.clear()
  }

  async applyImportDecorations(editor: vscode.TextEditor, retryCount = 0) {
    const document = editor.document
    const docUri = document.uri.toString()

    // Cancel any pending retry for this document
    this.cancelRetry(docUri)

    const text = document.getText()
    const { symbols, importEndLine } = parseImports(text)

    // Clear all existing decorations
    for (const type of this.decorationTypes.values()) {
      editor.setDecorations(type, [])
    }

    if (symbols.length === 0) {
      return
    }

    const escapedSymbols = symbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`\\b(${escapedSymbols.join('|')})\\b`, 'g')
    const occurrences: SymbolOccurrence[] = []

    for (let lineIndex = 0; lineIndex < importEndLine; lineIndex++) {
      const lineText = document.lineAt(lineIndex).text

      // Exclude the module specifier part (from '...' / from "...")
      const fromMatch = lineText.match(/\s+from\s+['"]/)
      const searchText = fromMatch ? lineText.slice(0, fromMatch.index) : lineText
      let match: RegExpExecArray | null

      pattern.lastIndex = 0
      while ((match = pattern.exec(searchText)) !== null) {
        const startPos = new vscode.Position(lineIndex, match.index)
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length)
        occurrences.push({ symbol: match[0], range: new vscode.Range(startPos, endPos) })
      }
    }

    // Precompute first occurrence of each symbol for O(1) lookup
    const occurrenceBySymbol = new Map<string, SymbolOccurrence>()
    for (const occurrence of occurrences) {
      if (!occurrenceBySymbol.has(occurrence.symbol)) {
        occurrenceBySymbol.set(occurrence.symbol, occurrence)
      }
    }

    // Resolve kind for each unique symbol, using cache when possible
    const importSectionText = text.split('\n').slice(0, importEndLine).join('\n')
    const cached = this.documentCaches.get(docUri)
    const symbolKinds = new Map<string, SymbolKind>()
    const uniqueSymbols = [...occurrenceBySymbol.keys()]

    // Reuse cached kinds only if import section is unchanged
    const reusableCache = cached && cached.importSectionText === importSectionText ? cached.symbolKinds : null
    const symbolsToResolve: string[] = []

    for (const symbol of uniqueSymbols) {
      const kind = reusableCache?.get(symbol)
      if (kind) {
        symbolKinds.set(symbol, kind)
      } else {
        symbolsToResolve.push(symbol)
      }
    }

    let tsServerLoading = false

    if (symbolsToResolve.length > 0) {
      for (const { resolver } of this.phases) {
        const targets = symbolsToResolve.filter((s) => !symbolKinds.has(s))
        if (targets.length === 0) {
          continue
        }

        const previousSize = symbolKinds.size
        const loading = await this.resolveSymbols(resolver, targets, occurrenceBySymbol, document, symbolKinds)
        if (loading) {
          tsServerLoading = true
        }
        if (symbolKinds.size !== previousSize) {
          this.applyDecorationsToEditor(editor, occurrences, symbolKinds)
        }
      }

      this.documentCaches.set(docUri, { importSectionText, symbolKinds: new Map(symbolKinds) })
    } else {
      this.applyDecorationsToEditor(editor, occurrences, symbolKinds)
    }

    // Schedule retry if tsserver was loading and retries remain
    if (tsServerLoading && retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * (retryCount + 1)
      const timeout = setTimeout(() => {
        this.retryTimeouts.delete(docUri)
        this.applyImportDecorations(editor, retryCount + 1).catch(() => {
          // Retry may fail; silently ignore
        })
      }, delay)
      this.retryTimeouts.set(docUri, timeout)
    }
  }

  clearDocumentCache(uri: string) {
    this.cancelRetry(uri)
    this.documentCaches.delete(uri)
  }

  dispose() {
    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.retryTimeouts.clear()
    for (const type of this.decorationTypes.values()) {
      type.dispose()
    }
    this.decorationTypes.clear()
    this.documentCaches.clear()
  }

  private async resolveSymbols(
    resolver: BaseSymbolResolver,
    symbols: string[],
    occurrenceBySymbol: Map<string, SymbolOccurrence>,
    document: vscode.TextDocument,
    symbolKinds: Map<string, SymbolKind>,
  ) {
    let tsServerLoading = false

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const occurrence = occurrenceBySymbol.get(symbol)
          if (!occurrence) {
            return
          }

          const kind = await resolver.resolve(document, occurrence.range.start)
          if (kind && !symbolKinds.has(symbol)) {
            symbolKinds.set(symbol, kind)
          }
        } catch (error) {
          if (error instanceof TsServerLoadingError) {
            tsServerLoading = true
          }
        }
      }),
    )

    return tsServerLoading
  }

  private applyDecorationsToEditor(
    editor: vscode.TextEditor,
    occurrences: SymbolOccurrence[],
    symbolKinds: Map<string, SymbolKind>,
  ) {
    const rangesByColor = new Map<string, vscode.Range[]>()

    for (const { symbol, range } of occurrences) {
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

  private cancelRetry(docUri: string) {
    const existing = this.retryTimeouts.get(docUri)
    if (existing) {
      clearTimeout(existing)
      this.retryTimeouts.delete(docUri)
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
