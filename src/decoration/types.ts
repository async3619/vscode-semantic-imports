import type * as vscode from 'vscode'
import type { SymbolKind } from '../symbol'

export interface DocumentCache {
  importSectionText: string
  symbolKinds: Map<string, SymbolKind>
}

export interface SymbolOccurrence {
  symbol: string
  range: vscode.Range
}
