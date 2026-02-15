import * as vscode from 'vscode'
import { TAG_NAME, type PluginTagData } from '../../tsPlugin/protocol'
import { SymbolKind, BaseSymbolResolver } from '../types'
import { toSymbolKind } from '../utils/toSymbolKind'

interface PluginQuickInfoResponse {
  body?: {
    kind: string
    kindModifiers: string
    displayString: string
    tags?: { name: string; text?: string }[]
  }
}

export class PluginSymbolResolver extends BaseSymbolResolver {
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

    const result = await vscode.commands.executeCommand<PluginQuickInfoResponse>(
      'typescript.tsserverRequest',
      'quickinfo',
      {
        file: targetUri.fsPath,
        line: targetPos.line + 1,
        offset: targetPos.character + 1,
      },
    )

    const tag = result?.body?.tags?.find((t) => t.name === TAG_NAME)
    if (!tag?.text) {
      return undefined
    }

    let data: PluginTagData
    try {
      data = JSON.parse(tag.text)
    } catch {
      return undefined
    }

    this.output.appendLine(`[plugin] ${position.line}:${position.character} → isFunction=${data.isFunction}`)

    if (data.isFunction) {
      return SymbolKind.Function
    }

    const kind = result?.body?.kind
    if (!kind) {
      return SymbolKind.Variable
    }

    return toSymbolKind(kind) ?? SymbolKind.Variable
  }
}
