import * as vscode from 'vscode'
import { Logger } from '../logger'

const MAX_PROBE_ATTEMPTS = 20
const PROBE_INTERVAL_MS = 500

interface QuickInfoResponse {
  body?: {
    kind: string
  }
}

export class TypeScriptServerProbe {
  private readonly logger = Logger.create(TypeScriptServerProbe)

  async waitForReady(document: vscode.TextDocument, position: vscode.Position, signal: AbortSignal) {
    try {
      signal.throwIfAborted()

      const ready = await this.check(document, position)
      if (ready) {
        return true
      }

      this.logger.info('tsserver not ready, starting probe polling')

      for (let attempt = 1; attempt < MAX_PROBE_ATTEMPTS; attempt++) {
        await this.delay(PROBE_INTERVAL_MS, signal)

        const ready = await this.check(document, position)
        signal.throwIfAborted()
        if (ready) {
          this.logger.info(`tsserver ready after ${attempt + 1} attempt(s)`)
          return true
        }

        this.logger.debug(`probe attempt ${attempt + 1}/${MAX_PROBE_ATTEMPTS}: not ready`)
      }

      this.logger.warn(`tsserver not ready after ${MAX_PROBE_ATTEMPTS} attempts`)
      return false
    } catch {
      this.logger.info('probe cancelled')
      return false
    }
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
      const timer = setTimeout(resolve, ms)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(signal.reason)
        },
        { once: true },
      )
    })
  }
}
