import * as vscode from 'vscode'
import { Logger } from '../logger'

const DEFAULT_TIMEOUT_MS = 10_000
const PROBE_INTERVAL_MS = 500

interface QuickInfoResponse {
  body?: {
    kind: string
  }
}

export interface ProbeOptions {
  timeout?: number
}

export class TypeScriptServerProbe implements vscode.Disposable {
  private readonly logger = Logger.create(TypeScriptServerProbe)
  private readonly controllers = new Map<string, AbortController>()

  async waitForReady(key: string, document: vscode.TextDocument, position: vscode.Position, options?: ProbeOptions) {
    this.cancel(key)

    const controller = new AbortController()
    this.controllers.set(key, controller)
    const signal = controller.signal

    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS
    const maxAttempts = Math.max(1, Math.ceil(timeout / PROBE_INTERVAL_MS))

    try {
      signal.throwIfAborted()

      const ready = await this.check(document, position)
      if (ready) {
        return true
      }

      this.logger.info('tsserver not ready, starting probe polling')

      for (let attempt = 1; attempt < maxAttempts; attempt++) {
        await this.delay(PROBE_INTERVAL_MS, signal)

        const ready = await this.check(document, position)
        signal.throwIfAborted()
        if (ready) {
          this.logger.info(`tsserver ready after ${attempt + 1} attempt(s)`)
          return true
        }

        this.logger.debug(`probe attempt ${attempt + 1}/${maxAttempts}: not ready`)
      }

      this.logger.warn(`tsserver not ready after ${maxAttempts} attempts, proceeding anyway`)
      return true
    } catch (error) {
      if (signal.aborted) {
        this.logger.info('probe cancelled')
        return false
      }
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn('probe failed:', message)
      return true
    } finally {
      if (this.controllers.get(key) === controller) {
        this.controllers.delete(key)
      }
    }
  }

  cancel(key: string) {
    const existing = this.controllers.get(key)
    if (existing) {
      existing.abort()
      this.controllers.delete(key)
    }
  }

  dispose() {
    for (const controller of this.controllers.values()) {
      controller.abort()
    }
    this.controllers.clear()
  }

  private async check(document: vscode.TextDocument, position: vscode.Position) {
    const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider',
      document.uri,
      position,
    )

    if (!definitions || definitions.length === 0) {
      this.logger.debug('probe: empty definitions')
      return false
    }

    const def = definitions[0]
    const targetUri = 'targetUri' in def ? def.targetUri : def.uri
    const targetRange = 'targetUri' in def ? (def.targetSelectionRange ?? def.targetRange) : def.range

    if (targetUri.scheme !== 'file') {
      return true
    }

    try {
      const result = await vscode.commands.executeCommand<QuickInfoResponse>(
        'typescript.tsserverRequest',
        'quickinfo',
        {
          file: targetUri.fsPath,
          line: targetRange.start.line + 1,
          offset: targetRange.start.character + 1,
        },
      )

      if (result?.body?.kind) {
        return true
      }

      this.logger.debug('probe: quickinfo returned empty body')
      return false
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.debug('probe: quickinfo error:', message)
      return false
    }
  }

  private delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }

      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}
