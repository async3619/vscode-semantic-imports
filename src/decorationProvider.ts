import * as vscode from 'vscode'
import { parseImports } from './importParser'

const decorationType = vscode.window.createTextEditorDecorationType({
  color: '#000000',
})

export function applyImportDecorations(editor: vscode.TextEditor): void {
  const document = editor.document
  const text = document.getText()
  const { symbols, importEndLine } = parseImports(text)

  if (symbols.length === 0) {
    editor.setDecorations(decorationType, [])
    return
  }

  const escapedSymbols = symbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`\\b(${escapedSymbols.join('|')})\\b`, 'g')
  const ranges: vscode.Range[] = []

  for (let lineIndex = 0; lineIndex < importEndLine; lineIndex++) {
    const lineText = document.lineAt(lineIndex).text
    let match: RegExpExecArray | null

    pattern.lastIndex = 0
    while ((match = pattern.exec(lineText)) !== null) {
      const startPos = new vscode.Position(lineIndex, match.index)
      const endPos = new vscode.Position(lineIndex, match.index + match[0].length)
      ranges.push(new vscode.Range(startPos, endPos))
    }
  }

  editor.setDecorations(decorationType, ranges)
}

export function clearImportDecorations(editor: vscode.TextEditor): void {
  editor.setDecorations(decorationType, [])
}

export function disposeDecorations(): void {
  decorationType.dispose()
}
