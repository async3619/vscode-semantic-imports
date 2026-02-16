import * as vscode from 'vscode'
import { Logger } from '../../logger'
import { RESPONSE_KEY, type PluginResponse } from '../../tsPlugin/protocol'
import { SymbolKind, BaseSymbolResolver } from '../types'

interface CompletionInfoResponse {
  body?: Record<string, unknown>
}

export class PluginSymbolResolver extends BaseSymbolResolver {
  private readonly logger = Logger.create(PluginSymbolResolver)
  readonly name = 'plugin'

  async resolve(document: vscode.TextDocument, position: vscode.Position) {
    const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider',
      document.uri,
      position,
    )

    if (!definitions || definitions.length === 0) {
      return undefined
    }

    const def = definitions[0]
    const targetUri = 'targetUri' in def ? def.targetUri : def.uri
    const targetRange = 'targetUri' in def ? (def.targetSelectionRange ?? def.targetRange) : def.range
    const targetPos = targetRange.start

    if (targetUri.scheme !== 'file') {
      return undefined
    }

    let result: CompletionInfoResponse | undefined
    try {
      result = await vscode.commands.executeCommand<CompletionInfoResponse>(
        'typescript.tsserverRequest',
        'completionInfo',
        {
          file: targetUri.fsPath,
          line: targetPos.line + 1,
          offset: targetPos.character + 1,
          triggerCharacter: { id: 'resolve' },
        },
      )
    } catch (error) {
      this.logger.debug('tsserver request failed:', error instanceof Error ? error.message : String(error))
      return undefined
    }

    const response = result?.body?.[RESPONSE_KEY] as PluginResponse | undefined
    if (!response) {
      return undefined
    }

    if (response.id === 'error') {
      this.logger.debug('plugin responded with error')
      return undefined
    }

    if (response.isFunction) {
      return SymbolKind.Function
    }

    return undefined
  }
}
