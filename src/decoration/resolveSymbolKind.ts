import * as vscode from 'vscode'
import { extractContentText } from './extractContentText'
import { output } from './state'

export async function resolveSymbolKind(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<string | undefined> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    document.uri,
    position,
  )

  if (!hovers || hovers.length === 0) return undefined

  for (const hover of hovers) {
    for (const content of hover.contents) {
      const text = extractContentText(content)
      output.appendLine(`[hover] ${position.line}:${position.character} → ${text.slice(0, 200)}`)
      const match = text.match(/\(alias\)\s+(function|class|interface|type|enum|namespace|const|let|var|module)\b/)
      if (match) return match[1]
    }
  }

  return undefined
}
