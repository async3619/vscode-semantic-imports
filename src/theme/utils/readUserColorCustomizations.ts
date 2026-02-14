import * as vscode from 'vscode'
import { SymbolKind } from '../../symbol'
import type { SymbolColorMap, TokenColorRule } from '../types'
import { findSemanticTokenColor } from './findSemanticTokenColor'
import { findTextMateColor } from './findTextMateColor'

interface SemanticTokenCustomizations {
  rules?: Record<string, string | { foreground?: string }>
  [themeScope: string]: unknown
}

interface TokenColorCustomizations {
  textMateRules?: TokenColorRule[]
  [themeScope: string]: unknown
}

function resolveSemanticRules(rules: Record<string, string | { foreground?: string }>): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [key, value] of Object.entries(rules)) {
    if (typeof value === 'string') {
      resolved[key] = value
    } else if (value?.foreground) {
      resolved[key] = value.foreground
    }
  }
  return resolved
}

function getThemeSpecificEntry<T>(config: Record<string, unknown>, themeName: string): T | undefined {
  return config[`[${themeName}]`] as T | undefined
}

export function readUserColorCustomizations(themeName: string): SymbolColorMap {
  const colors: SymbolColorMap = {}

  const tokenColorConfig =
    vscode.workspace.getConfiguration('editor').get<TokenColorCustomizations>('tokenColorCustomizations') ?? {}
  const semanticTokenConfig =
    vscode.workspace.getConfiguration('editor').get<SemanticTokenCustomizations>('semanticTokenColorCustomizations') ??
    {}

  // TextMate: global rules, then theme-specific rules override
  const globalTextMateRules = tokenColorConfig.textMateRules ?? []
  const themeTextMateRules =
    getThemeSpecificEntry<{ textMateRules?: TokenColorRule[] }>(tokenColorConfig, themeName)?.textMateRules ?? []
  const mergedTextMateRules = [...globalTextMateRules, ...themeTextMateRules]

  // Semantic: global rules, then theme-specific rules override
  const globalSemanticRules = resolveSemanticRules(semanticTokenConfig.rules ?? {})
  const themeSemanticEntry = getThemeSpecificEntry<{ rules?: Record<string, string | { foreground?: string }> }>(
    semanticTokenConfig,
    themeName,
  )
  const themeSemanticRules = themeSemanticEntry ? resolveSemanticRules(themeSemanticEntry.rules ?? {}) : {}
  const mergedSemanticRules = { ...globalSemanticRules, ...themeSemanticRules }

  for (const kind of Object.values(SymbolKind)) {
    // Semantic overrides take priority over TextMate
    const semanticColor = findSemanticTokenColor(kind, mergedSemanticRules)
    const textmateColor = findTextMateColor(kind, mergedTextMateRules)
    const color = semanticColor ?? textmateColor
    if (color) {
      colors[kind] = color
    }
  }

  return colors
}
