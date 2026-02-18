import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { TypeScriptServerNotLoadedError } from '@/symbol/errors'
import { HoverSymbolResolver } from './hover'
import { SymbolKind } from '@/symbol/types'
import { loadTypeScript } from '@/symbol/utils/loadTypeScript'
import type { TypeScriptLanguageService } from '@/typescript/language'

vi.mock('@/symbol/utils/loadTypeScript', () => ({
  loadTypeScript: vi.fn(() => require('typescript')),
}))

function createMockDocument(uri = 'file:///test.ts') {
  return { uri: vscode.Uri.parse(uri) } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0) {
  return new vscode.Position(line, character)
}

function createMockLanguageService(overrides?: Partial<TypeScriptLanguageService>): TypeScriptLanguageService {
  return {
    getDefinition: vi.fn().mockResolvedValue(null),
    getHovers: vi.fn().mockResolvedValue([]),
    requestCompletionInfo: vi.fn().mockResolvedValue(undefined),
    requestQuickInfo: vi.fn().mockResolvedValue(undefined),
    getSemanticTokens: vi.fn().mockResolvedValue(null),
    openTextDocument: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as TypeScriptLanguageService
}

describe('HoverSymbolResolver', () => {
  let resolver: HoverSymbolResolver
  let languageService: TypeScriptLanguageService

  beforeEach(() => {
    languageService = createMockLanguageService()
    resolver = new HoverSymbolResolver(languageService)
  })

  it('should return undefined when hover result is empty array', async () => {
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
        vi.mocked(languageService.getHovers).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) ${alias} Foo`)] } as vscode.Hover,
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(expected)
      })
    }

    const variableAliases = ['const', 'let', 'var']

    for (const alias of variableAliases) {
      it(`should resolve "${alias}" alias to Variable`, async () => {
        vi.mocked(languageService.getHovers).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) ${alias} Foo`)] } as vscode.Hover,
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(SymbolKind.Variable)
      })
    }

    it('should resolve "module" alias to Namespace', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) module Foo')] } as vscode.Hover,
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBe(SymbolKind.Namespace)
    })
  })

  it('should return undefined when hover has no alias pattern', async () => {
    vi.mocked(languageService.getHovers).mockResolvedValue([
      { contents: [new vscode.MarkdownString('(method) Array<T>.map(...)')] } as vscode.Hover,
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should check all contents in a hover until finding a match', async () => {
    vi.mocked(languageService.getHovers).mockResolvedValue([
      {
        contents: [new vscode.MarkdownString('no match here'), new vscode.MarkdownString('(alias) class MyClass')],
      } as vscode.Hover,
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Class)
  })

  it('should check all hovers until finding a match', async () => {
    vi.mocked(languageService.getHovers).mockResolvedValue([
      { contents: [new vscode.MarkdownString('no match')] } as vscode.Hover,
      { contents: [new vscode.MarkdownString('(alias) interface IFoo')] } as vscode.Hover,
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Interface)
  })

  it('should call getHovers with correct arguments', async () => {
    const doc = createMockDocument('file:///my-file.ts')
    const pos = createMockPosition(5, 10)

    await resolver.resolve(doc, pos)

    expect(languageService.getHovers).toHaveBeenCalledWith(doc.uri, pos)
  })

  it('should handle MarkedString object with language and value', async () => {
    vi.mocked(languageService.getHovers).mockResolvedValue([
      { contents: [{ language: 'typescript', value: '(alias) function foo(): void' }] } as vscode.Hover,
    ])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should handle plain string content', async () => {
    vi.mocked(languageService.getHovers).mockResolvedValue([
      { contents: ['(alias) const X: number'] } as unknown as vscode.Hover,
    ])
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
        vi.mocked(languageService.getHovers).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) const foo: ${typeText}`)] } as vscode.Hover,
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(SymbolKind.Function)
      })
    }

    it('should resolve let with function type to Function', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) let handler: () => void')] } as vscode.Hover,
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBe(SymbolKind.Function)
    })

    it('should resolve var with function type to Function', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) var handler: () => void')] } as vscode.Hover,
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
        vi.mocked(languageService.getHovers).mockResolvedValue([
          { contents: [new vscode.MarkdownString(`(alias) const foo: ${typeText}`)] } as vscode.Hover,
        ])
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(SymbolKind.Variable)
      })
    }

    it('should return undefined for type alias (fallback to next resolver)', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const handler: MyCallback')] } as vscode.Hover,
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined for typeof (fallback to next resolver)', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const foo: typeof someFunc')] } as vscode.Hover,
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return Variable when const has no type annotation', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const FOO')] } as vscode.Hover,
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBe(SymbolKind.Variable)
    })
  })

  describe('const function detection when TypeScript is unavailable', () => {
    it('should return undefined when loadTypeScript returns undefined', async () => {
      vi.mocked(loadTypeScript).mockReturnValueOnce(undefined as never)

      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) const foo: () => void')] } as vscode.Hover,
      ])
      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })
  })

  describe('tsserver loading detection', () => {
    it('should throw TypeScriptServerNotLoadedError when hover text contains loading placeholder', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(loading...)')] } as vscode.Hover,
      ])
      await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(
        TypeScriptServerNotLoadedError,
      )
    })

    it('should throw TypeScriptServerNotLoadedError when hover text contains loading in markdown', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(loading...)')] } as vscode.Hover,
      ])
      await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(
        TypeScriptServerNotLoadedError,
      )
    })
  })
})
