import * as vscode from 'vscode'
import { RESPONSE_KEY, type PluginResponse } from '../../tsPlugin/protocol'
import { SymbolKind, BaseSymbolResolver } from '../types'

interface CompletionInfoResponse {
  body?: Record<string, unknown>
}

export class PluginSymbolResolver extends BaseSymbolResolver {
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

    this.output.appendLine(
      `[plugin] ${position.line}:${position.character} → def ${targetUri.fsPath}:${targetPos.line}:${targetPos.character}`,
    )

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
    } catch (e) {
      this.output.appendLine(`[plugin] completionInfo threw: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    }

    const response = result?.body?.[RESPONSE_KEY] as PluginResponse | undefined
    if (response) {
      this.output.appendLine(`[plugin] ${JSON.stringify(response)}`)
    }
    if (!response) {
      return undefined
    }

    if (response.id === 'error') {
      this.output.appendLine(`[plugin] error: ${response.error.message}`)
      return undefined
    }

    this.output.appendLine(`[plugin] ${position.line}:${position.character} → isFunction=${response.isFunction}`)

    if (response.isFunction) {
      return SymbolKind.Function
    }

    return undefined
  }
}
