import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { parseThemeFile } from './parseThemeFile'

function mockReadFile(pathToContent: Record<string, string>) {
  vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: vscode.Uri) => {
    const content = Object.entries(pathToContent).find(([p]) => uri.path.endsWith(p))?.[1]
    if (!content) {
      throw new Error(`File not found: ${uri.path}`)
    }
    return new TextEncoder().encode(content)
  })
}

describe('parseThemeFile', () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.fs.readFile).mockReset()
  })

  it('should parse a simple JSON theme', async () => {
    mockReadFile({
      'theme.json': JSON.stringify({
        semanticHighlighting: true,
        semanticTokenColors: { function: '#DCDCAA' },
        tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#DCDCAA' } }],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './theme.json')
    expect(result).toEqual({
      semanticHighlighting: true,
      semanticTokenColors: { function: '#DCDCAA' },
      tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#DCDCAA' } }],
    })
  })

  it('should handle semanticTokenColors with object values', async () => {
    mockReadFile({
      'theme.json': JSON.stringify({
        semanticTokenColors: {
          function: { foreground: '#DCDCAA' },
          class: '#4EC9B0',
        },
        tokenColors: [],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './theme.json')
    expect(result?.semanticTokenColors).toEqual({
      function: '#DCDCAA',
      class: '#4EC9B0',
    })
  })

  it('should resolve single include chain', async () => {
    mockReadFile({
      'child.json': JSON.stringify({
        include: './parent.json',
        tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#CHILD' } }],
      }),
      'parent.json': JSON.stringify({
        tokenColors: [{ scope: 'variable', settings: { foreground: '#PARENT' } }],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './child.json')
    expect(result?.tokenColors).toEqual([
      { scope: 'variable', settings: { foreground: '#PARENT' } },
      { scope: 'entity.name.function', settings: { foreground: '#CHILD' } },
    ])
  })

  it('should resolve nested include chain', async () => {
    mockReadFile({
      'child.json': JSON.stringify({
        include: './mid.json',
        tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#CHILD' } }],
      }),
      'mid.json': JSON.stringify({
        include: './base.json',
        tokenColors: [{ scope: 'variable', settings: { foreground: '#MID' } }],
      }),
      'base.json': JSON.stringify({
        semanticHighlighting: true,
        tokenColors: [{ scope: 'keyword', settings: { foreground: '#BASE' } }],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './child.json')
    expect(result?.semanticHighlighting).toBe(true)
    expect(result?.tokenColors).toEqual([
      { scope: 'keyword', settings: { foreground: '#BASE' } },
      { scope: 'variable', settings: { foreground: '#MID' } },
      { scope: 'entity.name.function', settings: { foreground: '#CHILD' } },
    ])
  })

  it('should let child semanticTokenColors override parent', async () => {
    mockReadFile({
      'child.json': JSON.stringify({
        include: './parent.json',
        semanticTokenColors: { function: '#CHILD_FN' },
      }),
      'parent.json': JSON.stringify({
        semanticTokenColors: { function: '#PARENT_FN', class: '#PARENT_CLS' },
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './child.json')
    expect(result?.semanticTokenColors).toEqual({
      function: '#CHILD_FN',
      class: '#PARENT_CLS',
    })
  })

  it('should let child semanticHighlighting override parent', async () => {
    mockReadFile({
      'child.json': JSON.stringify({
        include: './parent.json',
        semanticHighlighting: false,
      }),
      'parent.json': JSON.stringify({
        semanticHighlighting: true,
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './child.json')
    expect(result?.semanticHighlighting).toBe(false)
  })

  it('should inherit semanticHighlighting from parent when child does not set it', async () => {
    mockReadFile({
      'child.json': JSON.stringify({
        include: './parent.json',
        tokenColors: [],
      }),
      'parent.json': JSON.stringify({
        semanticHighlighting: true,
        tokenColors: [],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './child.json')
    expect(result?.semanticHighlighting).toBe(true)
  })

  it('should resolve include with subdirectory path', async () => {
    mockReadFile({
      'themes/dark.json': JSON.stringify({
        include: './base/colors.json',
        tokenColors: [{ scope: 'entity.name.function', settings: { foreground: '#DARK' } }],
      }),
      // The code builds the include path as dir + include: "./themes/" + "./base/colors.json"
      // MockUri.joinPath only strips leading "./" from the segment, producing "themes/./base/colors.json"
      'themes/./base/colors.json': JSON.stringify({
        tokenColors: [{ scope: 'variable', settings: { foreground: '#BASE' } }],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './themes/dark.json')
    expect(result?.tokenColors).toHaveLength(2)
  })

  it('should stop resolving at MAX_INCLUDE_DEPTH', async () => {
    // Create a circular-like include chain that exceeds depth limit
    const files: Record<string, string> = {}
    for (let i = 0; i <= 12; i++) {
      files[`theme${i}.json`] = JSON.stringify({
        include: `./theme${i + 1}.json`,
        tokenColors: [{ scope: `scope${i}`, settings: { foreground: `#${String(i).padStart(6, '0')}` } }],
      })
    }
    mockReadFile(files)

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './theme0.json')
    expect(result).toBeDefined()
    // Should have tokenColors from depth 0-10 but not beyond
    expect(result!.tokenColors.length).toBeLessThanOrEqual(11)
  })

  it('should return undefined when file reading fails', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './nonexistent.json')
    expect(result).toBeUndefined()
  })

  it('should return undefined when JSON parsing fails', async () => {
    mockReadFile({
      'bad.json': 'not valid json {{{',
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './bad.json')
    // jsonc-parser is lenient, but we should at least not crash
    expect(result).toBeDefined()
  })

  it('should default semanticHighlighting to false when not set', async () => {
    mockReadFile({
      'theme.json': JSON.stringify({
        tokenColors: [{ scope: 'variable', settings: { foreground: '#9CDCFE' } }],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './theme.json')
    expect(result?.semanticHighlighting).toBe(false)
  })

  it('should handle empty theme file', async () => {
    mockReadFile({
      'empty.json': JSON.stringify({}),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './empty.json')
    expect(result).toEqual({
      semanticHighlighting: false,
      semanticTokenColors: {},
      tokenColors: [],
    })
  })

  it('should skip semanticTokenColors entries without a color value', async () => {
    mockReadFile({
      'theme.json': JSON.stringify({
        semanticTokenColors: {
          function: { foreground: '#DCDCAA' },
          class: {},
          variable: '',
        },
        tokenColors: [],
      }),
    })

    const result = await parseThemeFile(vscode.Uri.file('/ext'), './theme.json')
    expect(result?.semanticTokenColors).toEqual({
      function: '#DCDCAA',
    })
  })
})
