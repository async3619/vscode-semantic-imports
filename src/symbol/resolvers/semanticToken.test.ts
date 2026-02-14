import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { SemanticTokenSymbolResolver } from './semanticToken'
import { SymbolKind } from '../types'

type ResolverInternals = {
  output: vscode.OutputChannel
}

function internals(resolver: SemanticTokenSymbolResolver) {
  return resolver as unknown as ResolverInternals
}

function createMockDocument(uri = 'file:///test.ts') {
  return { uri: vscode.Uri.parse(uri) } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0) {
  return new vscode.Position(line, character)
}

function createMockLocation(uri = 'file:///def.ts', line = 0, character = 0, endCharacter = 3) {
  return {
    uri: vscode.Uri.parse(uri),
    range: new vscode.Range(new vscode.Position(line, character), new vscode.Position(line, endCharacter)),
  } as vscode.Location
}

const DEFAULT_LEGEND: vscode.SemanticTokensLegend = {
  tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'variable', 'function'],
  tokenModifiers: [],
} as unknown as vscode.SemanticTokensLegend

function createTokenData(tokens: Array<[line: number, char: number, length: number, typeIndex: number]>) {
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
}) {
  vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
    if (command === 'vscode.executeDefinitionProvider') {
      return options.definitions ?? null
    }
    if (command === 'vscode.provideDocumentSemanticTokensLegend') {
      return options.legend ?? null
    }
    if (command === 'vscode.provideDocumentSemanticTokens') {
      return options.tokens ?? null
    }
    return null
  })
}

describe('SemanticTokenSymbolResolver', () => {
  let resolver: SemanticTokenSymbolResolver

  beforeEach(() => {
    resolver = new SemanticTokenSymbolResolver(vscode.window.createOutputChannel('test'))
    vi.mocked(vscode.commands.executeCommand).mockReset()
    vi.mocked(vscode.workspace.openTextDocument).mockClear()
  })

  it('should return undefined when definition provider returns null', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when definition provider returns empty array', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when semantic tokens legend is null', async () => {
    mockSemanticTokenResolution({
      definitions: [createMockLocation()],
      legend: null,
      tokens: { data: new Uint32Array([0, 0, 3, 0, 0]) },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when semantic tokens data is null', async () => {
    mockSemanticTokenResolution({
      definitions: [createMockLocation()],
      legend: DEFAULT_LEGEND,
      tokens: null,
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  describe('semantic token kind extraction', () => {
    const kinds: Array<[string, SymbolKind]> = [
      ['function', SymbolKind.Function],
      ['class', SymbolKind.Class],
      ['interface', SymbolKind.Interface],
      ['type', SymbolKind.Type],
      ['enum', SymbolKind.Enum],
      ['namespace', SymbolKind.Namespace],
      ['variable', SymbolKind.Variable],
    ]

    for (const [tokenType, expected] of kinds) {
      it(`should resolve "${tokenType}" semantic token to ${expected}`, async () => {
        const typeIndex = DEFAULT_LEGEND.tokenTypes.indexOf(tokenType)
        mockSemanticTokenResolution({
          definitions: [createMockLocation('file:///def.ts', 0, 0, 3)],
          legend: DEFAULT_LEGEND,
          tokens: { data: new Uint32Array([0, 0, 3, typeIndex, 0]) },
        })
        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(expected)
      })
    }
  })

  it('should call executeDefinitionProvider with correct arguments', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
    const doc = createMockDocument('file:///my-file.ts')
    const pos = createMockPosition(5, 10)

    await resolver.resolve(doc, pos)

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.executeDefinitionProvider', doc.uri, pos)
  })

  it('should handle Location with uri and range', async () => {
    const defUri = vscode.Uri.parse('file:///def.ts')
    const defRange = new vscode.Range(new vscode.Position(5, 4), new vscode.Position(5, 10))

    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === 'vscode.executeDefinitionProvider') {
        return [{ uri: defUri, range: defRange }]
      }
      if (command === 'vscode.provideDocumentSemanticTokensLegend') {
        return DEFAULT_LEGEND
      }
      if (command === 'vscode.provideDocumentSemanticTokens') {
        return { data: createTokenData([[5, 4, 6, 6]]) }
      }
      return null
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should handle LocationLink with targetUri and targetSelectionRange', async () => {
    const targetUri = vscode.Uri.parse('file:///linked.ts')
    const targetRange = new vscode.Range(new vscode.Position(10, 0), new vscode.Position(10, 20))
    const targetSelectionRange = new vscode.Range(new vscode.Position(10, 7), new vscode.Position(10, 12))

    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === 'vscode.executeDefinitionProvider') {
        return [{ targetUri, targetRange, targetSelectionRange }]
      }
      if (command === 'vscode.provideDocumentSemanticTokensLegend') {
        return DEFAULT_LEGEND
      }
      if (command === 'vscode.provideDocumentSemanticTokens') {
        return { data: createTokenData([[10, 7, 5, 2]]) }
      }
      return null
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Class)
  })

  it('should fall back to targetRange when targetSelectionRange is absent', async () => {
    const targetUri = vscode.Uri.parse('file:///linked.ts')
    const targetRange = new vscode.Range(new vscode.Position(3, 0), new vscode.Position(3, 8))

    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === 'vscode.executeDefinitionProvider') {
        return [{ targetUri, targetRange }]
      }
      if (command === 'vscode.provideDocumentSemanticTokensLegend') {
        return DEFAULT_LEGEND
      }
      if (command === 'vscode.provideDocumentSemanticTokens') {
        return { data: createTokenData([[3, 0, 8, 4]]) }
      }
      return null
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Interface)
  })

  it('should log definition location to output channel', async () => {
    mockSemanticTokenResolution({
      definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
      legend: DEFAULT_LEGEND,
      tokens: { data: createTokenData([[5, 4, 6, 6]]) },
    })

    await resolver.resolve(createMockDocument(), createMockPosition(3, 7))

    expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[definition] 3:7'))
  })

  it('should log resolved semantic token type to output channel', async () => {
    mockSemanticTokenResolution({
      definitions: [createMockLocation('file:///def.ts', 0, 0, 3)],
      legend: DEFAULT_LEGEND,
      tokens: { data: new Uint32Array([0, 0, 3, 6, 0]) },
    })

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[semantic]'))
    expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('function'))
  })

  it('should open target document before querying semantic tokens', async () => {
    mockSemanticTokenResolution({
      definitions: [createMockLocation('file:///def.ts', 0, 0, 3)],
      legend: DEFAULT_LEGEND,
      tokens: { data: new Uint32Array([0, 0, 3, 6, 0]) },
    })

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(vscode.workspace.openTextDocument).toHaveBeenCalled()
  })
})
