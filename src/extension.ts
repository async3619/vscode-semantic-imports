import * as vscode from 'vscode'
import { applyImportDecorations, clearDocumentCache, disposeDecorations } from './decorationProvider'

const SUPPORTED_LANGUAGES = new Set(['typescript', 'typescriptreact'])

function isSupported(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && SUPPORTED_LANGUAGES.has(document.languageId)
}

function triggerDecoration(editor: vscode.TextEditor): void {
  applyImportDecorations(editor).catch(() => {
    // TS language service may not be ready yet; silently ignore
  })
}

export function activate(context: vscode.ExtensionContext): void {
  for (const editor of vscode.window.visibleTextEditors) {
    if (isSupported(editor.document)) {
      triggerDecoration(editor)
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isSupported(editor.document)) {
        triggerDecoration(editor)
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor
      if (editor && editor.document === e.document && isSupported(e.document)) {
        triggerDecoration(editor)
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isSupported(document)) {
        clearDocumentCache(document.uri.toString())
      }
    }),
  )
}

export function deactivate(): void {
  disposeDecorations()
}
