import type * as vscode from 'vscode'

export interface DocumentCache {
  importSectionText: string
  symbolKinds: Map<string, string>
}

export interface SymbolOccurrence {
  symbol: string
  range: vscode.Range
}
