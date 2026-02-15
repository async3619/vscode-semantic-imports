import { SymbolKind } from '../types'

const SYMBOL_KIND_MAP: Partial<Record<string, SymbolKind>> = {
  function: SymbolKind.Function,
  class: SymbolKind.Class,
  interface: SymbolKind.Interface,
  type: SymbolKind.Type,
  enum: SymbolKind.Enum,
  namespace: SymbolKind.Namespace,
  module: SymbolKind.Namespace,
  variable: SymbolKind.Variable,
  const: SymbolKind.Variable,
  let: SymbolKind.Variable,
  var: SymbolKind.Variable,
}

export function toSymbolKind(raw: string) {
  return SYMBOL_KIND_MAP[raw]
}
