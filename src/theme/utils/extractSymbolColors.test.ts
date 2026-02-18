import { describe, expect, it } from 'vitest'
import { SymbolKind } from '@/symbol'
import type { ResolvedThemeData } from '@/theme/types'
import { extractSymbolColors } from './extractSymbolColors'

describe('extractSymbolColors', () => {
  describe('semanticHighlighting: true', () => {
    it('should prefer semanticTokenColors over tokenColors', () => {
      const theme: ResolvedThemeData = {
        semanticHighlighting: true,
        semanticTokenColors: { function: '#DCDCAA' },
        tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#FF0000' } }],
      }
      const colors = extractSymbolColors(theme)
      expect(colors[SymbolKind.Function]).toBe('#DCDCAA')
    })

    it('should fall back to tokenColors when semantic color is missing', () => {
      const theme: ResolvedThemeData = {
        semanticHighlighting: true,
        semanticTokenColors: {},
        tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#FF0000' } }],
      }
      const colors = extractSymbolColors(theme)
      expect(colors[SymbolKind.Function]).toBe('#FF0000')
    })
  })

  describe('semanticHighlighting: false', () => {
    it('should prefer tokenColors over semanticTokenColors', () => {
      const theme: ResolvedThemeData = {
        semanticHighlighting: false,
        semanticTokenColors: { function: '#DCDCAA' },
        tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#FF0000' } }],
      }
      const colors = extractSymbolColors(theme)
      expect(colors[SymbolKind.Function]).toBe('#FF0000')
    })

    it('should fall back to semanticTokenColors when tokenColors is missing', () => {
      const theme: ResolvedThemeData = {
        semanticHighlighting: false,
        semanticTokenColors: { function: '#DCDCAA' },
        tokenColors: [],
      }
      const colors = extractSymbolColors(theme)
      expect(colors[SymbolKind.Function]).toBe('#DCDCAA')
    })
  })

  it('should return empty map when no colors available', () => {
    const theme: ResolvedThemeData = {
      semanticHighlighting: false,
      semanticTokenColors: {},
      tokenColors: [],
    }
    expect(extractSymbolColors(theme)).toEqual({})
  })

  it('should extract colors for all symbol kinds from semanticTokenColors', () => {
    const theme: ResolvedThemeData = {
      semanticHighlighting: true,
      semanticTokenColors: {
        function: '#DCDCAA',
        class: '#4EC9B0',
        interface: '#4EC9B0',
        type: '#4EC9B0',
        enum: '#4EC9B0',
        namespace: '#4EC9B0',
        variable: '#9CDCFE',
      },
      tokenColors: [],
    }
    const colors = extractSymbolColors(theme)
    expect(colors[SymbolKind.Function]).toBe('#DCDCAA')
    expect(colors[SymbolKind.Class]).toBe('#4EC9B0')
    expect(colors[SymbolKind.Interface]).toBe('#4EC9B0')
    expect(colors[SymbolKind.Type]).toBe('#4EC9B0')
    expect(colors[SymbolKind.Enum]).toBe('#4EC9B0')
    expect(colors[SymbolKind.Namespace]).toBe('#4EC9B0')
    expect(colors[SymbolKind.Variable]).toBe('#9CDCFE')
  })

  it('should only include kinds that have colors', () => {
    const theme: ResolvedThemeData = {
      semanticHighlighting: true,
      semanticTokenColors: { function: '#DCDCAA' },
      tokenColors: [],
    }
    const colors = extractSymbolColors(theme)
    expect(colors[SymbolKind.Function]).toBe('#DCDCAA')
    expect(colors[SymbolKind.Class]).toBeUndefined()
    expect(colors[SymbolKind.Variable]).toBeUndefined()
  })
})
