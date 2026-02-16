import * as vscode from 'vscode'
import { DecorationService } from './decoration'
import { Logger } from './logger'
import { ThemeColorResolver } from './theme'
import { debounce } from './utils/debounce'

const SUPPORTED_LANGUAGES = new Set(['typescript', 'typescriptreact'])
const DEBOUNCE_DELAY_MS = 300

function isSupported(document: vscode.TextDocument) {
  return document.uri.scheme === 'file' && SUPPORTED_LANGUAGES.has(document.languageId)
}

class Extension implements vscode.Disposable {
  private readonly service = new DecorationService()
  private readonly themeResolver = new ThemeColorResolver()
  private readonly debouncedTriggerDecoration = debounce((editor: vscode.TextEditor) => {
    if (!editor.document.isClosed) {
      this.triggerDecoration(editor)
    }
  }, DEBOUNCE_DELAY_MS)

  activate(context: vscode.ExtensionContext) {
    this.refreshColors()

    context.subscriptions.push(
      this,
      this.service,
      vscode.window.onDidChangeActiveColorTheme(() => this.refreshColors()),
      vscode.extensions.onDidChange(() => this.refreshColors()),
      vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration),
      vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor),
      vscode.workspace.onDidChangeTextDocument(this.onDidChangeTextDocument),
      vscode.workspace.onDidCloseTextDocument(this.onDidCloseTextDocument),
    )
  }

  dispose() {
    this.debouncedTriggerDecoration.cancel()
  }

  private onDidChangeConfiguration = (e: vscode.ConfigurationChangeEvent) => {
    if (
      e.affectsConfiguration('editor.semanticTokenColorCustomizations') ||
      e.affectsConfiguration('editor.tokenColorCustomizations')
    ) {
      this.refreshColors()
    }
  }

  private onDidChangeActiveTextEditor = (editor: vscode.TextEditor | undefined) => {
    if (editor && isSupported(editor.document)) {
      this.triggerDecoration(editor)
    }
  }

  private onDidChangeTextDocument = (e: vscode.TextDocumentChangeEvent) => {
    const editor = vscode.window.activeTextEditor
    if (editor && editor.document === e.document && isSupported(e.document)) {
      this.debouncedTriggerDecoration(editor)
    }
  }

  private onDidCloseTextDocument = (document: vscode.TextDocument) => {
    if (isSupported(document)) {
      this.service.clearDocumentCache(document.uri.toString())
    }
  }

  private triggerDecoration(editor: vscode.TextEditor) {
    this.service.applyImportDecorations(editor).catch(() => {
      // TS language service may not be ready yet; silently ignore
    })
  }

  private triggerAllVisible() {
    for (const editor of vscode.window.visibleTextEditors) {
      if (isSupported(editor.document)) {
        this.triggerDecoration(editor)
      }
    }
  }

  private async refreshColors() {
    const colors = await this.themeResolver.loadColors()
    this.service.setColors(colors)
    this.triggerAllVisible()
  }
}

export function activate(context: vscode.ExtensionContext) {
  const extension = new Extension()
  extension.activate(context)
}

export function deactivate() {
  Logger.dispose()
}
