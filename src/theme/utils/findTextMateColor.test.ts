import { describe, it, expect } from 'vitest'
import { SymbolKind } from '@/symbol'
import type { TokenColorRule } from '@/theme/types'
import { findTextMateColor } from './findTextMateColor'

describe('findTextMateColor', () => {
  it('should match exact scope', () => {
    const tokenColors: TokenColorRule[] = [{ scope: 'entity.name.function', settings: { foreground: '#DCDCAA' } }]
    expect(findTextMateColor(SymbolKind.Function, tokenColors)).toBe('#DCDCAA')
  })

  it('should match parent scope (entity.name.type matches entity.name.type.class)', () => {
    const tokenColors: TokenColorRule[] = [{ scope: 'entity.name.type', settings: { foreground: '#4EC9B0' } }]
    expect(findTextMateColor(SymbolKind.Class, tokenColors)).toBe('#4EC9B0')
    expect(findTextMateColor(SymbolKind.Interface, tokenColors)).toBe('#4EC9B0')
    expect(findTextMateColor(SymbolKind.Type, tokenColors)).toBe('#4EC9B0')
    expect(findTextMateColor(SymbolKind.Enum, tokenColors)).toBe('#4EC9B0')
  })

  it('should prefer more specific scope when available', () => {
    const tokenColors: TokenColorRule[] = [
      { scope: 'entity.name.type', settings: { foreground: '#4EC9B0' } },
      { scope: 'entity.name.type.class', settings: { foreground: '#FF0000' } },
    ]
    expect(findTextMateColor(SymbolKind.Class, tokenColors)).toBe('#FF0000')
    expect(findTextMateColor(SymbolKind.Type, tokenColors)).toBe('#4EC9B0')
  })

  it('should handle scope as array', () => {
    const tokenColors: TokenColorRule[] = [
      { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#DCDCAA' } },
    ]
    expect(findTextMateColor(SymbolKind.Function, tokenColors)).toBe('#DCDCAA')
  })

  it('should give later rules higher priority', () => {
    const tokenColors: TokenColorRule[] = [
      { scope: 'entity.name.function', settings: { foreground: '#111111' } },
      { scope: 'entity.name.function', settings: { foreground: '#222222' } },
    ]
    expect(findTextMateColor(SymbolKind.Function, tokenColors)).toBe('#222222')
  })

  it('should skip rules without foreground', () => {
    const tokenColors: TokenColorRule[] = [
      { scope: 'entity.name.function', settings: {} },
      { scope: 'entity.name.function', settings: { foreground: '#DCDCAA' } },
    ]
    expect(findTextMateColor(SymbolKind.Function, tokenColors)).toBe('#DCDCAA')
  })

  it('should skip rules without scope', () => {
    const tokenColors: TokenColorRule[] = [
      { settings: { foreground: '#000000' } },
      { scope: 'entity.name.function', settings: { foreground: '#DCDCAA' } },
    ]
    expect(findTextMateColor(SymbolKind.Function, tokenColors)).toBe('#DCDCAA')
  })

  it('should handle variable fallback from variable.other.readwrite to variable', () => {
    const tokenColors: TokenColorRule[] = [{ scope: 'variable', settings: { foreground: '#9CDCFE' } }]
    expect(findTextMateColor(SymbolKind.Variable, tokenColors)).toBe('#9CDCFE')
  })

  it('should trim whitespace from scope strings', () => {
    const tokenColors: TokenColorRule[] = [{ scope: ' entity.name.function ', settings: { foreground: '#DCDCAA' } }]
    expect(findTextMateColor(SymbolKind.Function, tokenColors)).toBe('#DCDCAA')
  })

  it('should return undefined when no matching scope is found', () => {
    const tokenColors: TokenColorRule[] = [{ scope: 'keyword.control', settings: { foreground: '#C586C0' } }]
    expect(findTextMateColor(SymbolKind.Function, tokenColors)).toBeUndefined()
  })
})
