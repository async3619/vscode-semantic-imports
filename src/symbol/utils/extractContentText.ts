import * as vscode from 'vscode'

export function extractContentText(content: vscode.MarkedString | vscode.MarkdownString) {
  if (content instanceof vscode.MarkdownString) {
    return content.value
  }
  if (typeof content === 'string') {
    return content
  }
  return content.value
}
