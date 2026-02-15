import * as vscode from 'vscode'
import { BaseSymbolResolver } from '../types'
import { findTokenTypeAtPosition } from '../utils/findTokenTypeAtPosition'
import { toSymbolKind } from '../utils/toSymbolKind'

export class SemanticTokenSymbolResolver extends BaseSymbolResolver {
  readonly name = 'semanticToken'

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

    this.output.appendLine(
      `[definition] ${position.line}:${position.character} → ${targetUri.toString()}:${targetPos.line}:${targetPos.character}`,
    )

    await vscode.workspace.openTextDocument(targetUri)

    const [legend, tokens] = await Promise.all([
      vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
        'vscode.provideDocumentSemanticTokensLegend',
        targetUri,
      ),
      vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentSemanticTokens', targetUri),
    ])

    if (!legend || !tokens) {
      return undefined
    }

    const tokenType = findTokenTypeAtPosition(tokens, legend, targetPos.line, targetPos.character)
    this.output.appendLine(`[semantic] ${targetPos.line}:${targetPos.character} → ${tokenType ?? 'unknown'}`)

    return tokenType ? toSymbolKind(tokenType) : undefined
  }
}
