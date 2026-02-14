import type * as vscode from 'vscode'

export interface SymbolOccurrence {
  symbol: string
  range: vscode.Range
}
