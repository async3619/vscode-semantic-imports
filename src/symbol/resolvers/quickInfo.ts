import * as vscode from 'vscode'
import { BaseSymbolResolver } from '../types'
import { toSymbolKind } from '../utils/toSymbolKind'

export class QuickInfoSymbolResolver extends BaseSymbolResolver {
  readonly name = 'quickInfo'

  async resolve(document: vscode.TextDocument, position: vscode.Position) {
    const definition = await this.getDefinition(document, position)
    if (!definition) {
      return undefined
    }

    if (definition.targetUri.scheme !== 'file') {
      return undefined
    }

    const body = await this.languageService.requestQuickInfo(
      definition.targetUri.fsPath,
      definition.targetPos.line + 1,
      definition.targetPos.character + 1,
    )

    if (!body?.kind) {
      return undefined
    }

    return toSymbolKind(body.kind)
  }
}
