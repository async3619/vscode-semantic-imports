import { injectable } from 'inversify'
import * as vscode from 'vscode'
import { Logger } from '@/logger'
import { isJavaScriptFile } from '@/utils/isJavaScriptFile'
import { TypeScriptLanguageService } from './languageService'

const DEFAULT_TIMEOUT_MS = 10_000
const PROBE_INTERVAL_MS = 500

export interface ProbeOptions {
  timeout?: number
}

@injectable()
export class TypeScriptServerProbe implements vscode.Disposable {
  private readonly logger = Logger.create(TypeScriptServerProbe)
  private readonly controllers = new Map<string, AbortController>()

  constructor(private readonly languageService: TypeScriptLanguageService) {}

  async waitForReady(key: string, document: vscode.TextDocument, position: vscode.Position, options?: ProbeOptions) {
    this.cancel(key)

    const controller = new AbortController()
    this.controllers.set(key, controller)
    const signal = controller.signal

    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS
    const maxAttempts = Math.max(1, Math.ceil(timeout / PROBE_INTERVAL_MS))

    try {
      signal.throwIfAborted()

      this.logger.info(`starting probe for ${document.uri.toString()}`)
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
    const definition = await this.languageService.getDefinition(document.uri, position)
    this.logger.debug('probe: got definition:', definition)
    if (!definition) {
      this.logger.debug('probe: empty definitions')
      return false
    }

    if (definition.targetUri.scheme !== 'file') {
      return true
    }

    if (isJavaScriptFile(definition.targetUri.fsPath)) {
      this.logger.debug('probe: skipping quickinfo for JS target:', definition.targetUri.fsPath)
      return true
    }

    try {
      const body = await this.languageService.requestQuickInfo(
        definition.targetUri.fsPath,
        definition.targetRange.start.line + 1,
        definition.targetRange.start.character + 1,
      )

      if (body?.kind) {
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
