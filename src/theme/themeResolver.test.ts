import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { SymbolKind } from '../symbol'
import { ThemeColorResolver } from './themeResolver'

function createMockOutput() {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  } as unknown as vscode.OutputChannel
}

function mockReadFile(pathToContent: Record<string, string>) {
  vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: vscode.Uri) => {
    const content = Object.entries(pathToContent).find(([p]) => uri.path.endsWith(p))?.[1]
    if (!content) {
      throw new Error(`File not found: ${uri.path}`)
    }
    return new TextEncoder().encode(content)
  })
}

describe('ThemeColorResolver', () => {
  let resolver: ThemeColorResolver
  let output: vscode.OutputChannel

  beforeEach(() => {
    output = createMockOutput()
    resolver = new ThemeColorResolver(output)
    vi.mocked(vscode.workspace.getConfiguration).mockReset()
    vi.mocked(vscode.workspace.fs.readFile).mockReset()
    ;(vscode.extensions as { all: unknown[] }).all = []
  })

  describe('loadColors', () => {
    it('should return empty map when colorTheme setting is empty', async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => ''),
      } as unknown as vscode.WorkspaceConfiguration)

      const colors = await resolver.loadColors()
      expect(colors).toEqual({})
      expect(output.appendLine).toHaveBeenCalledWith('[theme] active theme not found')
    })

    it('should return empty map when no matching theme is found', async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'Nonexistent Theme'),
      } as unknown as vscode.WorkspaceConfiguration)
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
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'my-dark-theme'),
      } as unknown as vscode.WorkspaceConfiguration)
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
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'My Dark Theme'),
      } as unknown as vscode.WorkspaceConfiguration)
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
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'theme-b'),
      } as unknown as vscode.WorkspaceConfiguration)
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
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'my-theme'),
      } as unknown as vscode.WorkspaceConfiguration)
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
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'my-theme'),
      } as unknown as vscode.WorkspaceConfiguration)
      ;(vscode.extensions as { all: unknown[] }).all = [
        {
          extensionUri: vscode.Uri.file('/ext'),
          packageJSON: { contributes: { themes: [{ id: 'my-theme', path: './theme.json' }] } },
        },
      ]
      vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('File not found'))

      const colors = await resolver.loadColors()
      expect(colors).toEqual({})
      expect(output.appendLine).toHaveBeenCalledWith('[theme] failed to parse theme file')
    })
  })
})
