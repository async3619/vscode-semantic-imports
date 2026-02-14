import * as vscode from 'vscode'
import { ImportedSymbolTokenProvider, legend } from './semanticTokenProvider'

const selector: vscode.DocumentSelector = [
  { language: 'typescript', scheme: 'file' },
  { language: 'typescriptreact', scheme: 'file' },
]

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ImportedSymbolTokenProvider()

  const registration = vscode.languages.registerDocumentSemanticTokensProvider(selector, provider, legend)

  const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
    if (vscode.languages.match(selector, e.document)) {
      provider.notifyChanged()
    }
  })

  context.subscriptions.push(registration, changeSubscription, provider)
}

export function deactivate(): void {
  // cleanup handled by disposables
}
