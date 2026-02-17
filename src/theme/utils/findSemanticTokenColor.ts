import { SymbolKind } from '@/symbol'

const SEMANTIC_TOKEN_KEYS: Record<SymbolKind, string> = {
  [SymbolKind.Function]: 'function',
  [SymbolKind.Class]: 'class',
  [SymbolKind.Interface]: 'interface',
  [SymbolKind.Type]: 'type',
  [SymbolKind.Enum]: 'enum',
  [SymbolKind.Namespace]: 'namespace',
  [SymbolKind.Variable]: 'variable',
}

export function findSemanticTokenColor(
  kind: SymbolKind,
  semanticTokenColors: Record<string, string>,
): string | undefined {
  return semanticTokenColors[SEMANTIC_TOKEN_KEYS[kind]]
}
