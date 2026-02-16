import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { TsServerLoadingError } from '../errors'
import { PluginSymbolResolver } from './plugin'
import { SymbolKind } from '../types'
import { RESPONSE_KEY, type PluginResponse } from '../../tsPlugin/protocol'

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

function mockPluginResolution(options: {
  definitions?: vscode.Location[] | null
  completionInfo?: {
    body?: Record<string, unknown>
  } | null
}) {
  vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
    if (command === 'vscode.executeDefinitionProvider') {
      return options.definitions ?? null
    }
    if (command === 'typescript.tsserverRequest') {
      return options.completionInfo ?? null
    }
    return null
  })
}

function createCompletionInfoWithResponse(response: PluginResponse) {
  return { body: { [RESPONSE_KEY]: response } }
}

describe('PluginSymbolResolver', () => {
  let resolver: PluginSymbolResolver

  beforeEach(() => {
    resolver = new PluginSymbolResolver()
    vi.mocked(vscode.commands.executeCommand).mockReset()
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

  it('should return undefined when response key is not present (plugin not loaded)', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      completionInfo: { body: {} },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when completionInfo has no body', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      completionInfo: {},
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when completionInfo is null', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      completionInfo: null,
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return Function when response indicates isFunction=true', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      completionInfo: createCompletionInfoWithResponse({ id: 'resolve', isFunction: true }),
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should return undefined when response indicates isFunction=false', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      completionInfo: createCompletionInfoWithResponse({ id: 'resolve', isFunction: false }),
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when response is an error', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      completionInfo: createCompletionInfoWithResponse({
        id: 'error',
        error: { name: 'PluginError', message: 'no program' },
      }),
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should call tsserverRequest with completionInfo and triggerCharacter', async () => {
    mockPluginResolution({
      definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
      completionInfo: createCompletionInfoWithResponse({ id: 'resolve', isFunction: true }),
    })

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.tsserverRequest', 'completionInfo', {
      file: '/def.ts',
      line: 6,
      offset: 5,
      triggerCharacter: { id: 'resolve' },
    })
  })

  it('should return undefined when definition target is not a file URI', async () => {
    mockPluginResolution({
      definitions: [createMockLocation('git:///def.ts')],
      completionInfo: null,
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should throw TsServerLoadingError when tsserverRequest throws "No Project" error', async () => {
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === 'vscode.executeDefinitionProvider') {
        return [createMockLocation()]
      }
      if (command === 'typescript.tsserverRequest') {
        throw new Error('No Project.')
      }
      return null
    })

    await expect(resolver.resolve(createMockDocument(), createMockPosition())).rejects.toThrow(TsServerLoadingError)
  })

  it('should return undefined when tsserverRequest throws a non "No Project" error', async () => {
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === 'vscode.executeDefinitionProvider') {
        return [createMockLocation()]
      }
      if (command === 'typescript.tsserverRequest') {
        throw new Error('Some other error')
      }
      return null
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
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
        return createCompletionInfoWithResponse({ id: 'resolve', isFunction: false })
      }
      return null
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })
})
