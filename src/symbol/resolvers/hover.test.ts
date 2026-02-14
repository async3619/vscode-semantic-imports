import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { TsServerLoadingError } from '../errors'
import { HoverSymbolResolver } from './hover'
import { SymbolKind } from '../types'
import { loadTypeScript } from '../utils/loadTypeScript'

vi.mock('../utils/loadTypeScript', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loadTypeScript: vi.fn(() => require('typescript')),
}))

type ResolverInternals = {
  output: vscode.OutputChannel
}

function internals(resolver: HoverSymbolResolver) {
  return resolver as unknown as ResolverInternals
}

function createMockDocument(uri = 'file:///test.ts') {
  return { uri: vscode.Uri.parse(uri) } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0) {
  return new vscode.Position(line, character)
}

describe('HoverSymbolResolver', () => {
  let resolver: HoverSymbolResolver

  beforeEach(() => {
    resolver = new HoverSymbolResolver(vscode.window.createOutputChannel('test'))
    vi.mocked(vscode.commands.executeCommand).mockReset()
  })

  it('should return undefined when hover result is null', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when hover result is empty array', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  describe('alias kind extraction', () => {
    const directMappings: Array<[string, SymbolKind]> = [
      ['function', SymbolKind.Function],
      ['class', SymbolKind.Class],
      ['interface', SymbolKind.Interface],
      ['type', SymbolKind.Type],
      ['enum', SymbolKind.Enum],
      ['namespace', SymbolKind.Namespace],
    ]

    for (const [alias, expected] of directMappings) {
      it(`should resolve "${alias}" alias to ${expected}`, async () => {
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) ${alias} Foo`)] },
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(expected)
      })
    }

    const variableAliases = ['const', 'let', 'var']

    for (const alias of variableAliases) {
      it(`should resolve "${alias}" alias to Variable`, async () => {
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) ${alias} Foo`)] },
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(SymbolKind.Variable)
      })
    }

    it('should resolve "module" alias to Namespace', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) module Foo')] },
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBe(SymbolKind.Namespace)
    })
  })

  it('should return undefined when hover has no alias pattern', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [new vscode.MarkdownString('(method) Array<T>.map(...)')] },
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should check all contents in a hover until finding a match', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      {
        contents: [new vscode.MarkdownString('no match here'), new vscode.MarkdownString('(alias) class MyClass')],
      },
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Class)
  })

  it('should check all hovers until finding a match', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [new vscode.MarkdownString('no match')] },
      { contents: [new vscode.MarkdownString('(alias) interface IFoo')] },
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Interface)
  })

  it('should call executeCommand with correct arguments', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
    const doc = createMockDocument('file:///my-file.ts')
    const pos = createMockPosition(5, 10)

    await resolver.resolve(doc, pos)

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.executeHoverProvider', doc.uri, pos)
  })

  it('should log hover content to output channel', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [new vscode.MarkdownString('(alias) function foo(): void')] },
    ])

    await resolver.resolve(createMockDocument(), createMockPosition(3, 7))

    expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[hover] 3:7'))
  })

  it('should handle MarkedString object with language and value', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      { contents: [{ language: 'typescript', value: '(alias) function foo(): void' }] },
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should handle plain string content', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([{ contents: ['(alias) const X: number'] }])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Variable)
  })

  describe('const function type detection', () => {
    const functionTypes: Array<[string, string]> = [
      ['() => void', 'arrow function'],
      ['(x: string) => number', 'arrow function with params'],
      ['<T>(arg: T) => T', 'generic arrow function'],
      ['() => Promise<void>', 'async arrow function'],
      ['new () => Foo', 'constructor type'],
      ['{ (): void }', 'callable object'],
    ]

    for (const [typeText, description] of functionTypes) {
      it(`should resolve const with ${description} type to Function: "${typeText}"`, async () => {
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) const foo: ${typeText}`)] },
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(SymbolKind.Function)
      })
    }

    it('should resolve let with function type to Function', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) let handler: () => void')] },
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBe(SymbolKind.Function)
    })

    it('should resolve var with function type to Function', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) var handler: () => void')] },
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBe(SymbolKind.Function)
    })

    const nonFunctionTypes: Array<[string, string]> = [
      ['number', 'primitive'],
      ['string[]', 'array'],
      ['{ bar: number }', 'object literal'],
      ['42', 'literal type'],
    ]

    for (const [typeText, description] of nonFunctionTypes) {
      it(`should resolve const with ${description} type to Variable: "${typeText}"`, async () => {
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) const foo: ${typeText}`)] },
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(SymbolKind.Variable)
      })
    }

    it('should return undefined for type alias (fallback to next resolver)', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const handler: MyCallback')] },
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined for typeof (fallback to next resolver)', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const foo: typeof someFunc')] },
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return Variable when const has no type annotation', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const FOO')] },
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBe(SymbolKind.Variable)
    })
  })

  describe('const function detection when TypeScript is unavailable', () => {
    it('should return undefined when loadTypeScript returns undefined', async () => {
      vi.mocked(loadTypeScript).mockReturnValueOnce(undefined as never)

      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const foo: () => void')] },
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })
  })

  describe('tsserver loading detection', () => {
    it('should throw TsServerLoadingError when hover text contains loading placeholder', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(loading...)')] },
      ])
      await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(TsServerLoadingError)
    })

    it('should throw TsServerLoadingError when hover text contains loading in markdown', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(loading...)')] },
      ])
      await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(TsServerLoadingError)
    })

    it('should log loading detection to output channel', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(loading...)')] },
      ])
      await resolver.resolve(createMockDocument(), createMockPosition(2, 5)).catch(() => {})
      expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('[hover] loading detected'),
      )
    })
  })
})
