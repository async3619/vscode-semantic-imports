import * as vscode from 'vscode'
import { BaseSymbolResolver } from '../types'
import { findTokenTypeAtPosition } from '../utils/findTokenTypeAtPosition'
import { toSymbolKind } from '../utils/toSymbolKind'

export class SemanticTokenSymbolResolver extends BaseSymbolResolver {
  readonly name = 'semanticToken'

  async resolve(document: vscode.TextDocument, position: vscode.Position) {
    const definition = await this.getDefinition(document, position)
    if (!definition) {
      return undefined
    }

    await this.languageService.openTextDocument(definition.targetUri)

    const result = await this.languageService.getSemanticTokens(definition.targetUri)
    if (!result) {
      return undefined
    }

    const tokenType = findTokenTypeAtPosition(
      result.tokens,
      result.legend,
      definition.targetPos.line,
      definition.targetPos.character,
    )
    return tokenType ? toSymbolKind(tokenType) : undefined
  }
}
