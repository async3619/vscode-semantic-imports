import { SymbolKind } from '../../symbol'
import type { ResolvedThemeData, SymbolColorMap } from '../types'
import { findSemanticTokenColor } from './findSemanticTokenColor'
import { findTextMateColor } from './findTextMateColor'

export function extractSymbolColors(theme: ResolvedThemeData): SymbolColorMap {
  const colors: SymbolColorMap = {}

  for (const kind of Object.values(SymbolKind)) {
    const semanticColor = findSemanticTokenColor(kind, theme.semanticTokenColors)
    const textmateColor = findTextMateColor(kind, theme.tokenColors)

    const color = theme.semanticHighlighting ? (semanticColor ?? textmateColor) : (textmateColor ?? semanticColor)
    if (color) {
      colors[kind] = color
    }
  }

  return colors
}
