import * as vscode from 'vscode'
import type { DocumentCache } from './types'

export const output = vscode.window.createOutputChannel('Semantic Imports')

export const decorationTypes = new Map<string, vscode.TextEditorDecorationType>()

export const documentCaches = new Map<string, DocumentCache>()
