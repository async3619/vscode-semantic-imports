import * as vscode from 'vscode'
import { DecorationService } from './decoration'

const SUPPORTED_LANGUAGES = new Set(['typescript', 'typescriptreact'])

function isSupported(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && SUPPORTED_LANGUAGES.has(document.languageId)
}

export function activate(context: vscode.ExtensionContext): void {
  const service = new DecorationService()

  function triggerDecoration(editor: vscode.TextEditor): void {
    service.applyImportDecorations(editor).catch(() => {
      // TS language service may not be ready yet; silently ignore
    })
  }

  for (const editor of vscode.window.visibleTextEditors) {
    if (isSupported(editor.document)) {
      triggerDecoration(editor)
    }
  }

  context.subscriptions.push(
    service,
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
        service.clearDocumentCache(document.uri.toString())
      }
    }),
  )
}

export function deactivate(): void {
  // Service is disposed automatically via context.subscriptions
}
