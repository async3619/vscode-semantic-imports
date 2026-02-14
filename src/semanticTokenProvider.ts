import * as vscode from 'vscode'
import { parseImports } from './importParser'

export const TOKEN_TYPES = ['importedSymbol'] as const
export const TOKEN_MODIFIERS: string[] = []

export const legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES], TOKEN_MODIFIERS)

export class ImportedSymbolTokenProvider implements vscode.DocumentSemanticTokensProvider {
  private _onDidChangeSemanticTokens = new vscode.EventEmitter<void>()
  readonly onDidChangeSemanticTokens = this._onDidChangeSemanticTokens.event

  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.SemanticTokens {
    const text = document.getText()
    const { symbols, importEndLine } = parseImports(text)

    if (symbols.length === 0) {
      return new vscode.SemanticTokens(new Uint32Array(0))
    }

    const builder = new vscode.SemanticTokensBuilder(legend)
    const escapedSymbols = symbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`\\b(${escapedSymbols.join('|')})\\b`, 'g')

    const lineCount = document.lineCount
    for (let lineIndex = importEndLine; lineIndex < lineCount; lineIndex++) {
      const lineText = document.lineAt(lineIndex).text
      let match: RegExpExecArray | null

      pattern.lastIndex = 0
      while ((match = pattern.exec(lineText)) !== null) {
        builder.push(lineIndex, match.index, match[0].length, 0)
      }
    }

    return builder.build()
  }

  notifyChanged(): void {
    this._onDidChangeSemanticTokens.fire()
  }

  dispose(): void {
    this._onDidChangeSemanticTokens.dispose()
  }
}
