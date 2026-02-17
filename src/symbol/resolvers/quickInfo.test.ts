import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { QuickInfoSymbolResolver } from './quickInfo'
import { SymbolKind } from '../types'
import type { TypeScriptLanguageService, DefinitionResult } from '../../tsServer'

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

describe('QuickInfoSymbolResolver', () => {
  let resolver: QuickInfoSymbolResolver
  let languageService: TypeScriptLanguageService

  beforeEach(() => {
    languageService = createMockLanguageService()
    resolver = new QuickInfoSymbolResolver(languageService)
  })

  it('should return undefined when definition provider returns null', async () => {
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return kind from quickinfo at definition site', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 5, 0, 3))
    vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
      kind: 'function',
      kindModifiers: '',
      displayString: 'function foo(): void',
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should return class kind from definition site', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 10, 0, 8))
    vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
      kind: 'class',
      kindModifiers: '',
      displayString: 'class Foo',
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Class)
  })

  it('should call requestQuickInfo with 1-based definition position', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 5, 4, 10))
    vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
      kind: 'function',
      kindModifiers: '',
      displayString: '',
    })

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(languageService.requestQuickInfo).toHaveBeenCalledWith('/def.ts', 6, 5)
  })

  it('should return undefined when quickinfo returns undefined', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when quickinfo kind is empty string', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
      kind: '',
      kindModifiers: '',
      displayString: '',
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when quickinfo kind is not a recognized SymbolKind', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
    vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
      kind: 'method',
      kindModifiers: '',
      displayString: '',
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when definition target is not a file URI', async () => {
    vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('git:///def.ts', 0, 0, 3))

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })
})
