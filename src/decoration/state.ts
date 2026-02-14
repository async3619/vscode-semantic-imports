import * as vscode from 'vscode'

export const output = vscode.window.createOutputChannel('Semantic Imports')

export const decorationTypes = new Map<string, vscode.TextEditorDecorationType>()
