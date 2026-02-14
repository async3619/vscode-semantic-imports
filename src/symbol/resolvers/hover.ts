import * as vscode from 'vscode'
import { TsServerLoadingError } from '../errors'
import { BaseSymbolResolver } from '../types'
import { extractContentText } from '../utils/extractContentText'
import { toSymbolKind } from '../utils/toSymbolKind'

export class HoverSymbolResolver extends BaseSymbolResolver {
  async resolve(document: vscode.TextDocument, position: vscode.Position) {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      position,
    )

    if (!hovers || hovers.length === 0) {
      return undefined
    }

    for (const hover of hovers) {
      for (const content of hover.contents) {
        const text = extractContentText(content)
        this.output.appendLine(`[hover] ${position.line}:${position.character} → ${text.slice(0, 200)}`)

        if (/\(loading\.\.\.\)/i.test(text)) {
          this.output.appendLine(`[hover] loading detected, tsserver may not be ready`)
          throw new TsServerLoadingError()
        }

        const match = text.match(/\(alias\)\s+(function|class|interface|type|enum|namespace|const|let|var|module)\b/)
        if (match) {
          return toSymbolKind(match[1])
        }
      }
    }

    return undefined
  }
}
