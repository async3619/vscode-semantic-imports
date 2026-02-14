import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { SymbolKind } from '../../symbol'
import { readUserColorCustomizations } from './readUserColorCustomizations'

function mockEditorConfig(settings: Record<string, unknown>) {
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation((section?: string) => {
    if (section === 'editor') {
      return {
        get: vi.fn((key: string) => settings[key]),
      } as unknown as vscode.WorkspaceConfiguration
    }
    return { get: vi.fn() } as unknown as vscode.WorkspaceConfiguration
  })
}

describe('readUserColorCustomizations', () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReset()
  })

  it('should return empty map when no customizations exist', () => {
    mockEditorConfig({})
    expect(readUserColorCustomizations('My Theme')).toEqual({})
  })

  it('should read global semantic token rules', () => {
    mockEditorConfig({
      semanticTokenColorCustomizations: {
        rules: { function: '#FF0000', class: '#00FF00' },
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBe('#FF0000')
    expect(result[SymbolKind.Class]).toBe('#00FF00')
  })

  it('should read semantic rules with foreground object format', () => {
    mockEditorConfig({
      semanticTokenColorCustomizations: {
        rules: { function: { foreground: '#FF0000' } },
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBe('#FF0000')
  })

  it('should read global textMateRules', () => {
    mockEditorConfig({
      tokenColorCustomizations: {
        textMateRules: [{ scope: 'entity.name.function', settings: { foreground: '#AABBCC' } }],
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBe('#AABBCC')
  })

  it('should prefer semantic rules over textMateRules', () => {
    mockEditorConfig({
      semanticTokenColorCustomizations: {
        rules: { function: '#SEMANTIC' },
      },
      tokenColorCustomizations: {
        textMateRules: [{ scope: 'entity.name.function', settings: { foreground: '#TEXTMATE' } }],
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBe('#SEMANTIC')
  })

  it('should fall back to textMateRules when semantic rule is absent', () => {
    mockEditorConfig({
      semanticTokenColorCustomizations: {
        rules: { class: '#CLASS_COLOR' },
      },
      tokenColorCustomizations: {
        textMateRules: [{ scope: 'entity.name.function', settings: { foreground: '#FUNC_TM' } }],
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBe('#FUNC_TM')
    expect(result[SymbolKind.Class]).toBe('#CLASS_COLOR')
  })

  it('should apply theme-specific semantic rules over global ones', () => {
    mockEditorConfig({
      semanticTokenColorCustomizations: {
        rules: { function: '#GLOBAL' },
        '[My Theme]': {
          rules: { function: '#THEME_SPECIFIC' },
        },
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBe('#THEME_SPECIFIC')
  })

  it('should apply theme-specific textMateRules over global ones', () => {
    mockEditorConfig({
      tokenColorCustomizations: {
        textMateRules: [{ scope: 'entity.name.function', settings: { foreground: '#GLOBAL' } }],
        '[My Theme]': {
          textMateRules: [{ scope: 'entity.name.function', settings: { foreground: '#THEME_SPECIFIC' } }],
        },
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBe('#THEME_SPECIFIC')
  })

  it('should not apply theme-specific rules for a different theme', () => {
    mockEditorConfig({
      semanticTokenColorCustomizations: {
        '[Other Theme]': {
          rules: { function: '#OTHER' },
        },
      },
    })
    const result = readUserColorCustomizations('My Theme')
    expect(result[SymbolKind.Function]).toBeUndefined()
  })
})
