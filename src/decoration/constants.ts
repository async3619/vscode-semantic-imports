import { SymbolKind } from '../symbol'

// Colors from VS Code Light theme
// Keys match TypeScript semantic token types
export const KIND_COLORS: Record<SymbolKind, string> = {
  [SymbolKind.Function]: '#800000',
  [SymbolKind.Class]: '#008080',
  [SymbolKind.Interface]: '#008080',
  [SymbolKind.Type]: '#008080',
  [SymbolKind.Enum]: '#008080',
  [SymbolKind.Namespace]: '#008080',
  [SymbolKind.Variable]: '#000080',
}

export const DEFAULT_COLOR = '#000000'
