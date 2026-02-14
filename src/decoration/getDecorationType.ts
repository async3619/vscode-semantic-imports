import * as vscode from 'vscode'
import { decorationTypes } from './state'

export function getDecorationType(color: string): vscode.TextEditorDecorationType {
  let type = decorationTypes.get(color)
  if (!type) {
    type = vscode.window.createTextEditorDecorationType({ color })
    decorationTypes.set(color, type)
  }
  return type
}
