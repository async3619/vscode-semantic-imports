import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { output } from './state'
import { resolveSymbolKind } from './resolveSymbolKind'

function createMockDocument(uri = 'file:///test.ts'): vscode.TextDocument {
  return {
    uri: vscode.Uri.parse(uri),
  } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0): vscode.Position {
  return new vscode.Position(line, character)
}

describe('resolveSymbolKind', () => {
  beforeEach(() => {
    vi.mocked(vscode.commands.executeCommand).mockReset()
    vi.mocked(output.appendLine).mockClear()
  })

  it('should return undefined when hover result is null', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)
    const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when hover result is empty array', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
    const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  describe('alias kind extraction', () => {
    const kinds = ['function', 'class', 'interface', 'type', 'enum', 'namespace', 'const', 'let', 'var', 'module']

    for (const kind of kinds) {
      it(`should extract "${kind}" from alias hover text`, async () => {
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) ${kind} Foo`)] },
        ])
        const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
        expect(result).toBe(kind)
      })
    }
  })

  it('should return undefined when hover has no alias pattern', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [new vscode.MarkdownString('(method) Array<T>.map(...)')] },
    ])
    const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should check all contents in a hover until finding a match', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      {
        contents: [new vscode.MarkdownString('no match here'), new vscode.MarkdownString('(alias) class MyClass')],
      },
    ])
    const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
    expect(result).toBe('class')
  })

  it('should check all hovers until finding a match', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [new vscode.MarkdownString('no match')] },
      { contents: [new vscode.MarkdownString('(alias) interface IFoo')] },
    ])
    const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
    expect(result).toBe('interface')
  })

  it('should call executeCommand with correct arguments', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
    const doc = createMockDocument('file:///my-file.ts')
    const pos = createMockPosition(5, 10)

    await resolveSymbolKind(doc, pos)

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.executeHoverProvider', doc.uri, pos)
  })

  it('should log hover content to output channel', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [new vscode.MarkdownString('(alias) function foo(): void')] },
    ])

    await resolveSymbolKind(createMockDocument(), createMockPosition(3, 7))

    expect(output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[hover] 3:7'))
  })

  it('should handle MarkedString object with language and value', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [{ language: 'typescript', value: '(alias) function foo(): void' }] },
    ])
    const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
    expect(result).toBe('function')
  })

  it('should handle plain string content', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([{ contents: ['(alias) const X: number'] }])
    const result = await resolveSymbolKind(createMockDocument(), createMockPosition())
    expect(result).toBe('const')
  })
})
