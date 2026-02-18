import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { TypeScriptServerNotLoadedError } from '@/symbol/errors'
import { SymbolKind } from '@/symbol/types'
import type { DefinitionResult, TypeScriptLanguageService } from '@/typescript/language'
import { type PluginResponse, RESPONSE_KEY, type ResolveResponse } from '@/typescript/plugin/protocol'
import { PluginSymbolResolver } from './plugin'

const ALL_FALSE: Omit<ResolveResponse, 'id'> = {
  isFunction: false,
  isClass: false,
  isInterface: false,
  isType: false,
  isEnum: false,
  isNamespace: false,
  isVariable: false,
  isNotReady: false,
  debug: { symbolFlags: 0, symbolName: 'test', wasAlias: false, aliasedFlags: null },
}

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

function createCompletionInfoWithResponse(response: PluginResponse) {
  return { body: { [RESPONSE_KEY]: response } }
}

describe('PluginSymbolResolver', () => {
  let resolver: PluginSymbolResolver
  let languageService: TypeScriptLanguageService

  beforeEach(() => {
    languageService = createMockLanguageService()
    resolver = new PluginSymbolResolver(languageService)
  })

  it('should return undefined when definition provider returns null', async () => {
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when response key is not present (plugin not loaded)', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue({ body: {} })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when completionInfo has no body', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue({})

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when completionInfo is undefined', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return Function when isFunction is true', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isFunction: true }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should return Class when isClass is true', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isClass: true }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Class)
  })

  it('should return Interface when isInterface is true', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isInterface: true }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Interface)
  })

  it('should return Type when isType is true', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isType: true }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Type)
  })

  it('should return Enum when isEnum is true', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isEnum: true }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Enum)
  })

  it('should return Namespace when isNamespace is true', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isNamespace: true }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Namespace)
  })

  it('should return Variable when isVariable is true', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isVariable: true }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Variable)
  })

  it('should throw TypeScriptServerNotLoadedError when plugin reports not ready', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isNotReady: true }),
    )

    await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(
      TypeScriptServerNotLoadedError,
    )
  })

  it('should return undefined when all flags are false', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when response is an error', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({
        id: 'error',
        error: { name: 'PluginError', message: 'no program' },
      }),
    )

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should call requestCompletionInfo with correct arguments', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 5, 4, 10))
    vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(
      createCompletionInfoWithResponse({ id: 'resolve', ...ALL_FALSE, isFunction: true }),
    )

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(languageService.requestCompletionInfo).toHaveBeenCalledWith('/def.ts', 6, 5, { id: 'resolve' })
  })

  it.each([
    ['file:///node_modules/pkg/index.js', '.js'],
    ['file:///node_modules/pkg/index.mjs', '.mjs'],
    ['file:///node_modules/pkg/index.cjs', '.cjs'],
  ])('should return undefined for JS target %s without calling completionInfo', async (uri) => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult(uri))

    const result = await resolver.resolve(createMockDocument(), createMockPosition())

    expect(result).toBeUndefined()
    expect(languageService.requestCompletionInfo).not.toHaveBeenCalled()
  })

  it('should return undefined when definition target is not a file URI', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('git:///def.ts'))

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should throw TypeScriptServerNotLoadedError when requestCompletionInfo throws "No Project" error', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockRejectedValue(new Error('No Project.'))

    await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(
      TypeScriptServerNotLoadedError,
    )
  })

  it('should return undefined when requestCompletionInfo throws a non "No Project" error', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestCompletionInfo).mockRejectedValue(new Error('Some other error'))

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  describe('definition cross-verification via hover', () => {
    it('should call getHovers when getDefinition returns null', async () => {
      await resolver.resolve(createMockDocument(), createMockPosition())

      expect(languageService.getHovers).toHaveBeenCalled()
    })

    it('should not call getHovers when getDefinition returns a result', async () => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
      vi.mocked(languageService.requestCompletionInfo).mockResolvedValue(undefined)

      await resolver.resolve(createMockDocument(), createMockPosition())

      expect(languageService.getHovers).not.toHaveBeenCalled()
    })

    it('should throw TypeScriptServerNotLoadedError when definition is null and hover contains (loading...)', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(loading...)')] } as vscode.Hover,
      ])

      await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(
        TypeScriptServerNotLoadedError,
      )
    })

    it('should return undefined when definition is null and hover has no loading indicator', async () => {
      vi.mocked(languageService.getHovers).mockResolvedValue([
        { contents: [new vscode.MarkdownString('(alias) function foo(): void')] } as vscode.Hover,
      ])

      const result = await resolver.resolve(createMockDocument(), createMockPosition())
      expect(result).toBeUndefined()
    })
  })
})
