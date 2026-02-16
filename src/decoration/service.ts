import PQueue from 'p-queue'
import * as vscode from 'vscode'
import { TypeScriptParser } from '../parser'
import type { BaseSymbolResolver, SymbolKind } from '../symbol'
import { HoverSymbolResolver, PluginSymbolResolver, SemanticTokenSymbolResolver, TsServerLoadingError } from '../symbol'
import { Logger } from '../logger'
import type { SymbolColorMap } from '../theme'
import { TypeScriptServerProbe } from '../tsServer'
import type { DocumentCache, SymbolOccurrence } from './types'

const MAX_RETRIES = 5
const RETRY_DELAY_MS = 500
const CONCURRENCY_LIMIT = 5

interface ResolverPhase {
  resolver: BaseSymbolResolver
}

export class DecorationService implements vscode.Disposable {
  private readonly logger = Logger.create(DecorationService)
  private readonly phases: ResolverPhase[]
  private readonly probe: TypeScriptServerProbe
  private readonly decorationTypes = new Map<string, vscode.TextEditorDecorationType>()
  private readonly documentCaches = new Map<string, DocumentCache>()
  private readonly retryTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly probeControllers = new Map<string, AbortController>()
  private readonly parser = new TypeScriptParser()
  private colors: SymbolColorMap

  constructor(colors: SymbolColorMap = {}, probe?: TypeScriptServerProbe) {
    this.colors = colors
    this.probe = probe ?? new TypeScriptServerProbe()
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

    // Cancel any pending retry and probe for this document
    this.cancelRetry(docUri)
    this.cancelProbe(docUri)

    const text = document.getText()
    const statements = this.parser.parseImports(text)

    // Clear all existing decorations
    for (const type of this.decorationTypes.values()) {
      editor.setDecorations(type, [])
    }

    if (statements.length === 0) {
      return
    }

    // Build occurrences and source map from parsed statements
    const occurrences = statements.map(
      (s): SymbolOccurrence => ({
        symbol: s.localName,
        range: new vscode.Range(s.startLine, s.startColumn, s.endLine, s.endColumn),
      }),
    )
    const symbolSources: Record<string, string> = {}
    for (const { localName, source } of statements) {
      symbolSources[localName] ??= source
    }

    // Precompute first occurrence of each symbol for O(1) lookup
    const occurrenceBySymbol = new Map<string, SymbolOccurrence>()
    for (const occurrence of occurrences) {
      if (!occurrenceBySymbol.has(occurrence.symbol)) {
        occurrenceBySymbol.set(occurrence.symbol, occurrence)
      }
    }

    // Resolve kind for each unique symbol, using cache when possible
    const importEndLine = Math.max(...statements.map((s) => s.endLine)) + 1
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
      this.logger.info(`resolving ${symbolsToResolve.length} symbols, ${symbolKinds.size} from cache`)

      // Probe tsserver readiness before entering resolve pipeline
      const probeTarget = occurrenceBySymbol.get(symbolsToResolve[0])
      if (probeTarget) {
        const controller = new AbortController()
        this.probeControllers.set(docUri, controller)

        const ready = await this.probe.waitForReady(document, probeTarget.range.start, controller.signal)
        if (this.probeControllers.get(docUri) === controller) {
          this.probeControllers.delete(docUri)
        }

        if (controller.signal.aborted) {
          return
        }
        if (!ready) {
          this.logger.warn('tsserver probe not ready, proceeding with resolve pipeline')
        }
      }

      for (const { resolver } of this.phases) {
        const targets = symbolsToResolve.filter((s) => !symbolKinds.has(s))
        if (targets.length === 0) {
          continue
        }

        const previousSize = symbolKinds.size
        const loading = await this.resolveSymbols(
          resolver,
          targets,
          occurrenceBySymbol,
          document,
          symbolKinds,
          symbolSources,
        )
        if (loading) {
          tsServerLoading = true
        }
        if (symbolKinds.size !== previousSize) {
          this.applyDecorationsToEditor(editor, occurrences, symbolKinds)
        }
      }

      const unresolved = symbolsToResolve.filter((s) => !symbolKinds.has(s))
      if (unresolved.length > 0) {
        this.logger.info(`could not resolve: ${unresolved.map((s) => `'${s}'`).join(', ')}`)
      }

      // Post-resolve fallback: if ALL symbols to resolve failed, treat as tsserver not ready
      if (unresolved.length === symbolsToResolve.length && !tsServerLoading) {
        this.logger.info('all symbols unresolved, treating as tsserver not ready')
        tsServerLoading = true
      }

      this.applyDecorationsToEditor(editor, occurrences, symbolKinds)
      this.documentCaches.set(docUri, { importSectionText, symbolKinds: new Map(symbolKinds) })
    } else {
      this.logger.debug(`all ${uniqueSymbols.length} symbols resolved from cache`)
      this.applyDecorationsToEditor(editor, occurrences, symbolKinds)
    }

    if (tsServerLoading && retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * (retryCount + 1)
      this.logger.warn(`waiting for tsserver, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
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
    this.cancelProbe(uri)
    this.documentCaches.delete(uri)
  }

  dispose() {
    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.retryTimeouts.clear()
    for (const controller of this.probeControllers.values()) {
      controller.abort()
    }
    this.probeControllers.clear()
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
    symbolSources: Record<string, string>,
  ) {
    let tsServerLoading = false

    const queue = new PQueue({ concurrency: CONCURRENCY_LIMIT })
    await queue.addAll(
      symbols.map((symbol) => async () => {
        const label = symbolSources[symbol] ? `'${symbol}' from '${symbolSources[symbol]}'` : `'${symbol}'`
        try {
          const occurrence = occurrenceBySymbol.get(symbol)
          if (!occurrence) {
            return
          }
          this.logger.debug(`resolving ${label} via '${resolver.name}' resolver`)
          const start = performance.now()
          const kind = await resolver.resolve(document, occurrence.range.start)
          if (kind && !symbolKinds.has(symbol)) {
            symbolKinds.set(symbol, kind)
            const elapsed = Math.round(performance.now() - start)
            this.logger.info(`resolved ${label} → '${kind}' via '${resolver.name}' resolver (in ${elapsed}ms)`)
          }
        } catch (error) {
          if (error instanceof TsServerLoadingError) {
            this.logger.warn(`tsserver is still loading, skipping ${label}`)
            tsServerLoading = true
          } else {
            this.logger.warn(
              `failed to resolve ${label} via '${resolver.name}' resolver:`,
              error instanceof Error ? error.message : String(error),
            )
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

  private cancelProbe(docUri: string) {
    const existing = this.probeControllers.get(docUri)
    if (existing) {
      existing.abort()
      this.probeControllers.delete(docUri)
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
