import * as vscode from 'vscode'
import { applyImportDecorations, disposeDecorations } from './decorationProvider'

const SUPPORTED_LANGUAGES = new Set(['typescript', 'typescriptreact'])

function isSupported(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && SUPPORTED_LANGUAGES.has(document.languageId)
}

export function activate(context: vscode.ExtensionContext): void {
  // Apply to already visible editors
  for (const editor of vscode.window.visibleTextEditors) {
    if (isSupported(editor.document)) {
      applyImportDecorations(editor)
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isSupported(editor.document)) {
        applyImportDecorations(editor)
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor
      if (editor && editor.document === e.document && isSupported(e.document)) {
        applyImportDecorations(editor)
      }
    }),
  )
}

export function deactivate(): void {
  disposeDecorations()
}
