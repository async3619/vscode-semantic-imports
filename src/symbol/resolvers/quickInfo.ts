import * as vscode from 'vscode'
import { BaseSymbolResolver } from '../types'
import { toSymbolKind } from '../utils/toSymbolKind'

interface QuickInfoResponse {
  body?: {
    kind: string
    kindModifiers: string
    displayString: string
  }
}

export class QuickInfoSymbolResolver extends BaseSymbolResolver {
  readonly name = 'quickInfo'

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
      `[quickinfo] ${position.line}:${position.character} → def ${targetUri.fsPath}:${targetPos.line}:${targetPos.character}`,
    )

    const result = await vscode.commands.executeCommand<QuickInfoResponse>('typescript.tsserverRequest', 'quickinfo', {
      file: targetUri.fsPath,
      line: targetPos.line + 1,
      offset: targetPos.character + 1,
    })

    const kind = result?.body?.kind
    if (!kind) {
      return undefined
    }

    this.output.appendLine(`[quickinfo] ${position.line}:${position.character} → ${kind}`)
    return toSymbolKind(kind)
  }
}
