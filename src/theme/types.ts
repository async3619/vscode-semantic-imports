import type { SymbolKind } from '../symbol'

export interface TokenColorRule {
  scope?: string | string[]
  settings?: {
    foreground?: string
  }
}

export interface RawThemeData {
  semanticHighlighting?: boolean
  semanticTokenColors?: Record<string, string | { foreground?: string }>
  tokenColors?: TokenColorRule[]
  include?: string
}

export interface ResolvedThemeData {
  semanticHighlighting: boolean
  semanticTokenColors: Record<string, string>
  tokenColors: TokenColorRule[]
}

export type SymbolColorMap = Partial<Record<SymbolKind, string>>
