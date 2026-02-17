import { SymbolKind } from '@/symbol'
import type { TokenColorRule } from '@/theme/types'

const TEXTMATE_SCOPES: Record<SymbolKind, string[]> = {
  [SymbolKind.Function]: ['entity.name.function'],
  [SymbolKind.Class]: ['entity.name.type.class', 'entity.name.type'],
  [SymbolKind.Interface]: ['entity.name.type.interface', 'entity.name.type'],
  [SymbolKind.Type]: ['entity.name.type'],
  [SymbolKind.Enum]: ['entity.name.type.enum', 'entity.name.type'],
  [SymbolKind.Namespace]: ['entity.name.type.namespace', 'entity.name.type.module', 'entity.name.type'],
  [SymbolKind.Variable]: ['variable.other.readwrite', 'variable'],
}

export function findTextMateColor(kind: SymbolKind, tokenColors: TokenColorRule[]): string | undefined {
  const targetScopes = TEXTMATE_SCOPES[kind]

  for (const targetScope of targetScopes) {
    // Later rules have higher priority in TextMate, so iterate in reverse
    for (let i = tokenColors.length - 1; i >= 0; i--) {
      const rule = tokenColors[i]
      if (!rule.settings?.foreground || !rule.scope) {
        continue
      }
      const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope]
      for (const scope of scopes) {
        const trimmed = scope.trim()
        if (targetScope === trimmed || targetScope.startsWith(trimmed + '.')) {
          return rule.settings.foreground
        }
      }
    }
  }

  return undefined
}
