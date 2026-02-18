import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { SymbolKind } from '@/symbol'
import { ThemeColorResolver } from './themeResolver'

function mockReadFile(pathToContent: Record<string, string>) {
  vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: vscode.Uri) => {
    const content = Object.entries(pathToContent).find(([p]) => uri.path.endsWith(p))?.[1]
    if (!content) {
      throw new Error(`File not found: ${uri.path}`)
    }
    return new TextEncoder().encode(content)
  })
}

function mockConfiguration(options: {
  colorTheme?: string
  semanticTokenColorCustomizations?: Record<string, unknown>
  tokenColorCustomizations?: Record<string, unknown>
}) {
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation((section?: string) => {
    if (section === 'workbench') {
      return { get: vi.fn(() => options.colorTheme ?? '') } as unknown as vscode.WorkspaceConfiguration
    }
    if (section === 'editor') {
      return {
        get: vi.fn((key: string) => {
          if (key === 'semanticTokenColorCustomizations') {
            return options.semanticTokenColorCustomizations
          }
          if (key === 'tokenColorCustomizations') {
            return options.tokenColorCustomizations
          }
          return undefined
        }),
      } as unknown as vscode.WorkspaceConfiguration
    }
    return { get: vi.fn() } as unknown as vscode.WorkspaceConfiguration
  })
}

describe('ThemeColorResolver', () => {
  let resolver: ThemeColorResolver

  beforeEach(() => {
    resolver = new ThemeColorResolver()
    vi.mocked(vscode.workspace.getConfiguration).mockReset()
    vi.mocked(vscode.workspace.fs.readFile).mockReset()
    ;(vscode.extensions as { all: unknown[] }).all = []
  })

  describe('loadColors', () => {
    it('should return empty map when colorTheme setting is empty', async () => {
      mockConfiguration({ colorTheme: '' })

      const colors = await resolver.loadColors()
      expect(colors).toEqual({})
    })

    it('should return empty map when no matching theme is found', async () => {
      mockConfiguration({ colorTheme: 'Nonexistent Theme' })
      ;(vscode.extensions as { all: unknown[] }).all = [
        {
          extensionUri: vscode.Uri.file('/ext/theme-a'),
          packageJSON: { contributes: { themes: [{ id: 'other-theme', path: './theme.json' }] } },
        },
      ]

      const colors = await resolver.loadColors()
      expect(colors).toEqual({})
    })

    it('should match theme by id and extract colors', async () => {
      mockConfiguration({ colorTheme: 'my-dark-theme' })
      ;(vscode.extensions as { all: unknown[] }).all = [
        {
          extensionUri: vscode.Uri.file('/ext/my-theme'),
          packageJSON: {
            contributes: {
              themes: [{ id: 'my-dark-theme', label: 'My Dark Theme', path: './themes/dark.json' }],
            },
          },
        },
      ]
      mockReadFile({
        'dark.json': JSON.stringify({
          semanticHighlighting: true,
          semanticTokenColors: { function: '#DCDCAA', class: '#4EC9B0' },
          tokenColors: [],
        }),
      })

      const colors = await resolver.loadColors()
      expect(colors[SymbolKind.Function]).toBe('#DCDCAA')
      expect(colors[SymbolKind.Class]).toBe('#4EC9B0')
    })

    it('should match theme by label when id does not match', async () => {
      mockConfiguration({ colorTheme: 'My Dark Theme' })
      ;(vscode.extensions as { all: unknown[] }).all = [
        {
          extensionUri: vscode.Uri.file('/ext/my-theme'),
          packageJSON: {
            contributes: {
              themes: [{ id: 'my-dark-theme', label: 'My Dark Theme', path: './themes/dark.json' }],
            },
          },
        },
      ]
      mockReadFile({
        'dark.json': JSON.stringify({
          semanticTokenColors: { function: '#DCDCAA' },
          tokenColors: [],
        }),
      })

      const colors = await resolver.loadColors()
      expect(colors[SymbolKind.Function]).toBe('#DCDCAA')
    })

    it('should prefer id match over label match', async () => {
      mockConfiguration({ colorTheme: 'theme-b' })
      ;(vscode.extensions as { all: unknown[] }).all = [
        {
          extensionUri: vscode.Uri.file('/ext/themes'),
          packageJSON: {
            contributes: {
              themes: [
                { id: 'theme-a', label: 'theme-b', path: './a.json' },
                { id: 'theme-b', label: 'Theme B', path: './b.json' },
              ],
            },
          },
        },
      ]
      mockReadFile({
        'b.json': JSON.stringify({
          semanticTokenColors: { variable: '#9CDCFE' },
          tokenColors: [],
        }),
      })

      const colors = await resolver.loadColors()
      expect(colors[SymbolKind.Variable]).toBe('#9CDCFE')
    })

    it('should skip extensions without contributes.themes', async () => {
      mockConfiguration({ colorTheme: 'my-theme' })
      ;(vscode.extensions as { all: unknown[] }).all = [
        { extensionUri: vscode.Uri.file('/ext/no-themes'), packageJSON: { contributes: {} } },
        { extensionUri: vscode.Uri.file('/ext/no-contributes'), packageJSON: {} },
        {
          extensionUri: vscode.Uri.file('/ext/has-theme'),
          packageJSON: { contributes: { themes: [{ id: 'my-theme', path: './theme.json' }] } },
        },
      ]
      mockReadFile({
        'theme.json': JSON.stringify({
          semanticTokenColors: { function: '#DCDCAA' },
          tokenColors: [],
        }),
      })

      const colors = await resolver.loadColors()
      expect(colors[SymbolKind.Function]).toBe('#DCDCAA')
    })

    it('should return empty map when theme file reading fails', async () => {
      mockConfiguration({ colorTheme: 'my-theme' })
      ;(vscode.extensions as { all: unknown[] }).all = [
        {
          extensionUri: vscode.Uri.file('/ext'),
          packageJSON: { contributes: { themes: [{ id: 'my-theme', path: './theme.json' }] } },
        },
      ]
      vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('File not found'))

      const colors = await resolver.loadColors()
      expect(colors).toEqual({})
    })

    it('should merge user color customizations on top of theme colors', async () => {
      mockConfiguration({
        colorTheme: 'my-theme',
        semanticTokenColorCustomizations: {
          rules: { function: '#USER_FUNC' },
        },
      })
      ;(vscode.extensions as { all: unknown[] }).all = [
        {
          extensionUri: vscode.Uri.file('/ext'),
          packageJSON: { contributes: { themes: [{ id: 'my-theme', path: './theme.json' }] } },
        },
      ]
      mockReadFile({
        'theme.json': JSON.stringify({
          semanticHighlighting: true,
          semanticTokenColors: { function: '#THEME_FUNC', class: '#THEME_CLASS' },
          tokenColors: [],
        }),
      })

      const colors = await resolver.loadColors()
      expect(colors[SymbolKind.Function]).toBe('#USER_FUNC')
      expect(colors[SymbolKind.Class]).toBe('#THEME_CLASS')
    })
  })
})
