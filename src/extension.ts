import * as vscode from 'vscode'
import { DecorationService } from './decoration'
import { Logger } from './logger'
import { ThemeColorResolver } from './theme'

const SUPPORTED_LANGUAGES = new Set(['typescript', 'typescriptreact'])

function isSupported(document: vscode.TextDocument) {
  return document.uri.scheme === 'file' && SUPPORTED_LANGUAGES.has(document.languageId)
}

export function activate(context: vscode.ExtensionContext) {
  const themeResolver = new ThemeColorResolver()
  const service = new DecorationService()

  function triggerDecoration(editor: vscode.TextEditor) {
    service.applyImportDecorations(editor).catch(() => {
      // TS language service may not be ready yet; silently ignore
    })
  }

  function triggerAllVisible() {
    for (const editor of vscode.window.visibleTextEditors) {
      if (isSupported(editor.document)) {
        triggerDecoration(editor)
      }
    }
  }

  async function refreshColors() {
    const colors = await themeResolver.loadColors()
    service.setColors(colors)
    triggerAllVisible()
  }

  // Initialize theme colors, then apply decorations
  refreshColors()

  context.subscriptions.push(
    service,
    vscode.window.onDidChangeActiveColorTheme(() => {
      refreshColors()
    }),
    vscode.extensions.onDidChange(() => {
      refreshColors()
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('editor.semanticTokenColorCustomizations') ||
        e.affectsConfiguration('editor.tokenColorCustomizations')
      ) {
        refreshColors()
      }
    }),
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

export function deactivate() {
  Logger.dispose()
}
