import { describe, it, expect } from 'vitest'
import { SymbolKind } from '@/symbol'
import { findSemanticTokenColor } from './findSemanticTokenColor'

describe('findSemanticTokenColor', () => {
  it('should return color for matching key', () => {
    const semanticTokenColors = { function: '#DCDCAA' }
    expect(findSemanticTokenColor(SymbolKind.Function, semanticTokenColors)).toBe('#DCDCAA')
  })

  it('should return undefined when key is not present', () => {
    const semanticTokenColors = { function: '#DCDCAA' }
    expect(findSemanticTokenColor(SymbolKind.Class, semanticTokenColors)).toBeUndefined()
  })

  it('should return undefined for empty map', () => {
    expect(findSemanticTokenColor(SymbolKind.Variable, {})).toBeUndefined()
  })

  it('should map each SymbolKind to the correct semantic token key', () => {
    const semanticTokenColors: Record<string, string> = {
      function: '#FF0001',
      class: '#FF0002',
      interface: '#FF0003',
      type: '#FF0004',
      enum: '#FF0005',
      namespace: '#FF0006',
      variable: '#FF0007',
    }

    expect(findSemanticTokenColor(SymbolKind.Function, semanticTokenColors)).toBe('#FF0001')
    expect(findSemanticTokenColor(SymbolKind.Class, semanticTokenColors)).toBe('#FF0002')
    expect(findSemanticTokenColor(SymbolKind.Interface, semanticTokenColors)).toBe('#FF0003')
    expect(findSemanticTokenColor(SymbolKind.Type, semanticTokenColors)).toBe('#FF0004')
    expect(findSemanticTokenColor(SymbolKind.Enum, semanticTokenColors)).toBe('#FF0005')
    expect(findSemanticTokenColor(SymbolKind.Namespace, semanticTokenColors)).toBe('#FF0006')
    expect(findSemanticTokenColor(SymbolKind.Variable, semanticTokenColors)).toBe('#FF0007')
  })

  it('should not match unrelated keys', () => {
    const semanticTokenColors = { keyword: '#C586C0', string: '#CE9178' }
    expect(findSemanticTokenColor(SymbolKind.Function, semanticTokenColors)).toBeUndefined()
  })
})
