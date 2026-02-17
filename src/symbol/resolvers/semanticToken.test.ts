import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { SemanticTokenSymbolResolver } from './semanticToken'
import { SymbolKind } from '@/symbol/types'
import type { TypeScriptLanguageService, DefinitionResult } from '@/typescript/language'

function createMockDocument(uri = 'file:///test.ts') {
  return { uri: vscode.Uri.parse(uri) } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0) {
  return new vscode.Position(line, character)
}

function createDefinitionResult(uri = 'file:///def.ts', line = 0, character = 0, endCharacter = 3): DefinitionResult {
  const targetUri = vscode.Uri.parse(uri)
  const targetRange = new vscode.Range(new vscode.Position(line, character), new vscode.Position(line, endCharacter))
  return { targetUri, targetRange, targetPos: targetRange.start }
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

describe('SemanticTokenSymbolResolver', () => {
  let resolver: SemanticTokenSymbolResolver
  let languageService: TypeScriptLanguageService

  beforeEach(() => {
    languageService = createMockLanguageService()
    resolver = new SemanticTokenSymbolResolver(languageService)
  })

  it('should return undefined when definition provider returns null', async () => {
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when semantic tokens are null', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())

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
        vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 0, 0, 3))
        vi.mocked(languageService.getSemanticTokens).mockResolvedValue({
          legend: DEFAULT_LEGEND,
          tokens: { data: new Uint32Array([0, 0, 3, typeIndex, 0]) } as vscode.SemanticTokens,
        })

        const result = await resolver.resolve(createMockDocument(), createMockPosition())
        expect(result).toBe(expected)
      })
    }
  })

  it('should call getDefinition with correct arguments', async () => {
    const doc = createMockDocument('file:///my-file.ts')
    const pos = createMockPosition(5, 10)

    await resolver.resolve(doc, pos)

    expect(languageService.getDefinition).toHaveBeenCalledWith(doc.uri, pos)
  })

  it('should handle definition at specific position', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 5, 4, 10))
    vi.mocked(languageService.getSemanticTokens).mockResolvedValue({
      legend: DEFAULT_LEGEND,
      tokens: { data: createTokenData([[5, 4, 6, 6]]) } as vscode.SemanticTokens,
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should open target document before querying semantic tokens', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 0, 0, 3))
    vi.mocked(languageService.getSemanticTokens).mockResolvedValue({
      legend: DEFAULT_LEGEND,
      tokens: { data: new Uint32Array([0, 0, 3, 6, 0]) } as vscode.SemanticTokens,
    })

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(languageService.openTextDocument).toHaveBeenCalled()
  })
})
