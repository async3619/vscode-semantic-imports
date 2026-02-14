import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { SymbolResolver } from './resolver'

type ResolverInternals = {
  output: vscode.OutputChannel
}

function internals(resolver: SymbolResolver): ResolverInternals {
  return resolver as unknown as ResolverInternals
}

function createMockDocument(uri = 'file:///test.ts'): vscode.TextDocument {
  return { uri: vscode.Uri.parse(uri) } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0): vscode.Position {
  return new vscode.Position(line, character)
}

function createMockLocation(uri = 'file:///def.ts', line = 0, character = 0, endCharacter = 3): vscode.Location {
  return {
    uri: vscode.Uri.parse(uri),
    range: new vscode.Range(new vscode.Position(line, character), new vscode.Position(line, endCharacter)),
  } as vscode.Location
}

const DEFAULT_LEGEND: vscode.SemanticTokensLegend = {
  tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'variable', 'function'],
  tokenModifiers: [],
} as unknown as vscode.SemanticTokensLegend

function createTokenData(tokens: Array<[line: number, char: number, length: number, typeIndex: number]>): Uint32Array {
  const data: number[] = []
  let prevLine = 0
  let prevChar = 0
  for (const [line, char, length, typeIndex] of tokens) {
    const deltaLine = line - prevLine
    const deltaChar = deltaLine === 0 ? char - prevChar : char
    data.push(deltaLine, deltaChar, length, typeIndex, 0)
    prevLine = line
    prevChar = char
  }
  return new Uint32Array(data)
}

function mockSemanticTokenResolution(options: {
  definitions?: vscode.Location[] | null
  legend?: vscode.SemanticTokensLegend | null
  tokens?: { data: Uint32Array } | null
}): void {
  vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
    if (command === 'vscode.executeDefinitionProvider') return options.definitions ?? null
    if (command === 'vscode.provideDocumentSemanticTokensLegend') return options.legend ?? null
    if (command === 'vscode.provideDocumentSemanticTokens') return options.tokens ?? null
    return null
  })
}

describe('SymbolResolver', () => {
  let resolver: SymbolResolver

  beforeEach(() => {
    resolver = new SymbolResolver(vscode.window.createOutputChannel('test'))
    vi.mocked(vscode.commands.executeCommand).mockReset()
  })

  describe('resolveByHover', () => {
    it('should return undefined when hover result is null', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)
      const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined when hover result is empty array', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
      const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    describe('alias kind extraction', () => {
      const kinds = ['function', 'class', 'interface', 'type', 'enum', 'namespace', 'const', 'let', 'var', 'module']

      for (const kind of kinds) {
        it(`should extract "${kind}" from alias hover text`, async () => {
          vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
            { contents: [new vscode.MarkdownString(`(alias) ${kind} Foo`)] },
          ])
          const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
          expect(result).toBe(kind)
        })
      }
    })

    it('should return undefined when hover has no alias pattern', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(method) Array<T>.map(...)')] },
      ])
      const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should check all contents in a hover until finding a match', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        {
          contents: [new vscode.MarkdownString('no match here'), new vscode.MarkdownString('(alias) class MyClass')],
        },
      ])
      const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
      expect(result).toBe('class')
    })

    it('should check all hovers until finding a match', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('no match')] },
        { contents: [new vscode.MarkdownString('(alias) interface IFoo')] },
      ])
      const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
      expect(result).toBe('interface')
    })

    it('should call executeCommand with correct arguments', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
      const doc = createMockDocument('file:///my-file.ts')
      const pos = createMockPosition(5, 10)

      await resolver.resolveByHover(doc, pos)

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.executeHoverProvider', doc.uri, pos)
    })

    it('should log hover content to output channel', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) function foo(): void')] },
      ])

      await resolver.resolveByHover(createMockDocument(), createMockPosition(3, 7))

      expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[hover] 3:7'))
    })

    it('should handle MarkedString object with language and value', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        { contents: [{ language: 'typescript', value: '(alias) function foo(): void' }] },
      ])
      const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
      expect(result).toBe('function')
    })

    it('should handle plain string content', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([{ contents: ['(alias) const X: number'] }])
      const result = await resolver.resolveByHover(createMockDocument(), createMockPosition())
      expect(result).toBe('const')
    })
  })

  describe('resolveBySemanticToken', () => {
    it('should return undefined when definition provider returns null', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)
      const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined when definition provider returns empty array', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
      const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined when semantic tokens legend is null', async () => {
      mockSemanticTokenResolution({
        definitions: [createMockLocation()],
        legend: null,
        tokens: { data: new Uint32Array([0, 0, 3, 0, 0]) },
      })
      const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined when semantic tokens data is null', async () => {
      mockSemanticTokenResolution({
        definitions: [createMockLocation()],
        legend: DEFAULT_LEGEND,
        tokens: null,
      })
      const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    describe('semantic token kind extraction', () => {
      const kinds = ['function', 'class', 'interface', 'type', 'enum', 'namespace', 'variable'] as const

      for (const kind of kinds) {
        it(`should extract "${kind}" from semantic token at definition`, async () => {
          const typeIndex = DEFAULT_LEGEND.tokenTypes.indexOf(kind)
          mockSemanticTokenResolution({
            definitions: [createMockLocation('file:///def.ts', 0, 0, 3)],
            legend: DEFAULT_LEGEND,
            tokens: { data: new Uint32Array([0, 0, 3, typeIndex, 0]) },
          })
          const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
          expect(result).toBe(kind)
        })
      }
    })

    it('should call executeDefinitionProvider with correct arguments', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
      const doc = createMockDocument('file:///my-file.ts')
      const pos = createMockPosition(5, 10)

      await resolver.resolveBySemanticToken(doc, pos)

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.executeDefinitionProvider', doc.uri, pos)
    })

    it('should handle Location with uri and range', async () => {
      const defUri = vscode.Uri.parse('file:///def.ts')
      const defRange = new vscode.Range(new vscode.Position(5, 4), new vscode.Position(5, 10))

      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') return [{ uri: defUri, range: defRange }]
        if (command === 'vscode.provideDocumentSemanticTokensLegend') return DEFAULT_LEGEND
        if (command === 'vscode.provideDocumentSemanticTokens') {
          return { data: createTokenData([[5, 4, 6, 6]]) }
        }
        return null
      })

      const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
      expect(result).toBe('function')
    })

    it('should handle LocationLink with targetUri and targetSelectionRange', async () => {
      const targetUri = vscode.Uri.parse('file:///linked.ts')
      const targetRange = new vscode.Range(new vscode.Position(10, 0), new vscode.Position(10, 20))
      const targetSelectionRange = new vscode.Range(new vscode.Position(10, 7), new vscode.Position(10, 12))

      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') {
          return [{ targetUri, targetRange, targetSelectionRange }]
        }
        if (command === 'vscode.provideDocumentSemanticTokensLegend') return DEFAULT_LEGEND
        if (command === 'vscode.provideDocumentSemanticTokens') {
          return { data: createTokenData([[10, 7, 5, 2]]) }
        }
        return null
      })

      const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
      expect(result).toBe('class')
    })

    it('should fall back to targetRange when targetSelectionRange is absent', async () => {
      const targetUri = vscode.Uri.parse('file:///linked.ts')
      const targetRange = new vscode.Range(new vscode.Position(3, 0), new vscode.Position(3, 8))

      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') {
          return [{ targetUri, targetRange }]
        }
        if (command === 'vscode.provideDocumentSemanticTokensLegend') return DEFAULT_LEGEND
        if (command === 'vscode.provideDocumentSemanticTokens') {
          return { data: createTokenData([[3, 0, 8, 4]]) }
        }
        return null
      })

      const result = await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())
      expect(result).toBe('interface')
    })

    it('should log definition location to output channel', async () => {
      mockSemanticTokenResolution({
        definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
        legend: DEFAULT_LEGEND,
        tokens: { data: createTokenData([[5, 4, 6, 6]]) },
      })

      await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition(3, 7))

      expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[definition] 3:7'))
    })

    it('should log resolved semantic token type to output channel', async () => {
      mockSemanticTokenResolution({
        definitions: [createMockLocation('file:///def.ts', 0, 0, 3)],
        legend: DEFAULT_LEGEND,
        tokens: { data: new Uint32Array([0, 0, 3, 6, 0]) },
      })

      await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())

      expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[semantic]'))
      expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('function'))
    })

    it('should open target document before querying semantic tokens', async () => {
      mockSemanticTokenResolution({
        definitions: [createMockLocation('file:///def.ts', 0, 0, 3)],
        legend: DEFAULT_LEGEND,
        tokens: { data: new Uint32Array([0, 0, 3, 6, 0]) },
      })

      await resolver.resolveBySemanticToken(createMockDocument(), createMockPosition())

      expect(vscode.workspace.openTextDocument).toHaveBeenCalled()
    })
  })

  describe('resolveByQuickInfo', () => {
    function mockQuickInfoResolution(options: {
      definitions?: vscode.Location[] | null
      quickinfo?: { body?: { kind: string; kindModifiers: string; displayString: string } } | null
    }): void {
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') return options.definitions ?? null
        if (command === 'typescript.tsserverRequest') return options.quickinfo ?? null
        return null
      })
    }

    it('should return undefined when definition provider returns null', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)
      const result = await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined when definition provider returns empty array', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
      const result = await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return kind from quickinfo at definition site', async () => {
      mockQuickInfoResolution({
        definitions: [createMockLocation('file:///def.ts', 5, 0, 3)],
        quickinfo: { body: { kind: 'function', kindModifiers: '', displayString: 'function foo(): void' } },
      })
      const result = await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())
      expect(result).toBe('function')
    })

    it('should return class kind from definition site', async () => {
      mockQuickInfoResolution({
        definitions: [createMockLocation('file:///def.ts', 10, 0, 8)],
        quickinfo: { body: { kind: 'class', kindModifiers: '', displayString: 'class Foo' } },
      })
      const result = await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())
      expect(result).toBe('class')
    })

    it('should call tsserverRequest with 1-based definition position', async () => {
      mockQuickInfoResolution({
        definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
        quickinfo: { body: { kind: 'function', kindModifiers: '', displayString: '' } },
      })

      await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.tsserverRequest', 'quickinfo', {
        file: '/def.ts',
        line: 6,
        offset: 5,
      })
    })

    it('should return undefined when quickinfo has no body', async () => {
      mockQuickInfoResolution({
        definitions: [createMockLocation()],
        quickinfo: {},
      })
      const result = await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should return undefined when quickinfo kind is empty string', async () => {
      mockQuickInfoResolution({
        definitions: [createMockLocation()],
        quickinfo: { body: { kind: '', kindModifiers: '', displayString: '' } },
      })
      const result = await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })

    it('should handle LocationLink with targetSelectionRange', async () => {
      const targetUri = vscode.Uri.parse('file:///linked.ts')
      const targetRange = new vscode.Range(new vscode.Position(10, 0), new vscode.Position(10, 20))
      const targetSelectionRange = new vscode.Range(new vscode.Position(10, 7), new vscode.Position(10, 12))

      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') {
          return [{ targetUri, targetRange, targetSelectionRange }]
        }
        if (command === 'typescript.tsserverRequest') {
          return { body: { kind: 'interface', kindModifiers: '', displayString: 'interface IFoo' } }
        }
        return null
      })

      const result = await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition())
      expect(result).toBe('interface')
    })

    it('should log definition and kind to output channel', async () => {
      mockQuickInfoResolution({
        definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
        quickinfo: { body: { kind: 'enum', kindModifiers: '', displayString: 'enum Direction' } },
      })

      await resolver.resolveByQuickInfo(createMockDocument(), createMockPosition(3, 7))

      expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[quickinfo] 3:7'))
      expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('enum'))
    })
  })
})
