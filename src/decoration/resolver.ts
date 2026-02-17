import PQueue from 'p-queue'
import * as vscode from 'vscode'
import { Logger } from '../logger'
import type { TypeScriptLanguageService } from '../tsServer'
import { stopwatch } from '../utils/stopwatch'
import type { BaseSymbolResolver, SymbolKind } from '../symbol'
import { HoverSymbolResolver, PluginSymbolResolver, SemanticTokenSymbolResolver } from '../symbol'

const CONCURRENCY_LIMIT = 5

export interface ResolveTarget {
  source: string
  range: { start: vscode.Position }
}

export class SymbolResolver {
  private readonly logger = Logger.create(SymbolResolver)
  private readonly resolvers: BaseSymbolResolver[]
  private readonly _onPhase = new vscode.EventEmitter<Map<string, SymbolKind>>()
  readonly onPhase = this._onPhase.event

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly targets: Map<string, ResolveTarget>,
    languageService: TypeScriptLanguageService,
  ) {
    this.resolvers = [
      new PluginSymbolResolver(languageService),
      new HoverSymbolResolver(languageService),
      new SemanticTokenSymbolResolver(languageService),
    ]
  }

  async resolve() {
    const symbolKinds = new Map<string, SymbolKind>()

    for (const resolver of this.resolvers) {
      const remaining = [...this.targets.keys()].filter((s) => !symbolKinds.has(s))
      if (remaining.length === 0) {
        continue
      }

      const resolved = await this.resolveSymbols(resolver, remaining)
      for (const [symbol, kind] of resolved) {
        symbolKinds.set(symbol, kind)
      }

      if (resolved.size > 0) {
        this._onPhase.fire(symbolKinds)
      }
    }

    this._onPhase.dispose()
    return symbolKinds
  }

  private async resolveSymbols(resolver: BaseSymbolResolver, symbols: string[]) {
    const queue = new PQueue({ concurrency: CONCURRENCY_LIMIT })
    const promises: Promise<readonly [string, SymbolKind] | null | void>[] = []
    for (const symbol of symbols) {
      const target = this.targets.get(symbol)
      if (!target) {
        continue
      }

      const label = target.source ? `'${symbol}' from '${target.source}'` : `'${symbol}'`

      const promise = queue.add(() => {
        return this.resolveSymbol(resolver, symbol, target.range.start, label)
      })

      promises.push(promise)
    }

    const results = await Promise.allSettled(promises)
    return new Map(
      results
        .filter(
          (r): r is PromiseFulfilledResult<readonly [string, SymbolKind]> =>
            r.status === 'fulfilled' && r.value != null,
        )
        .map((r) => r.value),
    )
  }

  private async resolveSymbol(resolver: BaseSymbolResolver, symbol: string, position: vscode.Position, label: string) {
    this.logger.debug(`resolving ${label} via '${resolver.name}' resolver`)

    const [kind, elapsed] = await stopwatch(() => resolver.resolve(this.document, position))
    if (!kind) {
      return null
    }

    this.logger.info(`resolved ${label} → '${kind}' via '${resolver.name}' resolver (in ${elapsed}ms)`)
    return [symbol, kind] as const
  }
}
