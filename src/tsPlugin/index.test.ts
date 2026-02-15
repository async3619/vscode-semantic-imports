import { describe, it, expect, vi } from 'vitest'
import type tslib from 'typescript/lib/tsserverlibrary'
import init from './index'
import { RESPONSE_KEY, type PluginResponse } from './protocol'

function createMockLanguageService(overrides: Partial<tslib.LanguageService> = {}) {
  const ls: Partial<tslib.LanguageService> = {
    getCompletionsAtPosition: vi.fn(),
    getProgram: vi.fn(),
    ...overrides,
  }
  return ls as tslib.LanguageService
}

function createMockPluginCreateInfo(ls: tslib.LanguageService) {
  return { languageService: ls } as tslib.server.PluginCreateInfo
}

function createMockType(callSignatures = 0, constructSignatures = 0) {
  return {
    getCallSignatures: () => Array(callSignatures).fill({}),
    getConstructSignatures: () => Array(constructSignatures).fill({}),
  }
}

function getResponse(result: tslib.WithMetadata<tslib.CompletionInfo> | undefined) {
  return (result as unknown as Record<string, unknown>)?.[RESPONSE_KEY] as PluginResponse | undefined
}

describe('tsPlugin', () => {
  function setupPlugin(options: {
    completions?: tslib.WithMetadata<tslib.CompletionInfo> | undefined
    program?: {
      sourceFile?: { getStart: () => number; getEnd: () => number }
      type?: ReturnType<typeof createMockType>
      symbol?: object | undefined
    }
  }) {
    const mockSymbol = 'symbol' in (options.program ?? {}) ? options.program!.symbol : {}
    const mockType = options.program?.type ?? createMockType()

    const mockTypeChecker = {
      getSymbolAtLocation: vi.fn(() => mockSymbol),
      getTypeOfSymbolAtLocation: vi.fn(() => mockType),
    }

    const mockSourceFile = options.program?.sourceFile ?? {
      getStart: () => 0,
      getEnd: () => 100,
    }

    const mockProgram = {
      getSourceFile: vi.fn(() => mockSourceFile),
      getTypeChecker: vi.fn(() => mockTypeChecker),
    }

    const ls = createMockLanguageService({
      getCompletionsAtPosition: vi.fn(() => options.completions),
      getProgram: vi.fn(() =>
        options.program !== undefined ? mockProgram : undefined,
      ) as tslib.LanguageService['getProgram'],
    })

    const mockTs = {
      forEachChild: vi.fn((node: { children?: tslib.Node[] }, cb: (child: tslib.Node) => void) => {
        if (node.children) {
          for (const child of node.children) {
            cb(child)
          }
        }
      }),
    } as unknown as typeof tslib

    const plugin = init({ typescript: mockTs })
    const proxy = plugin.create(createMockPluginCreateInfo(ls))

    return { proxy, ls, mockTypeChecker }
  }

  it('should pass through when triggerCharacter is undefined', () => {
    const { proxy, ls } = setupPlugin({ completions: undefined })
    proxy.getCompletionsAtPosition('test.ts', 0, undefined)
    expect(ls.getCompletionsAtPosition).toHaveBeenCalledWith('test.ts', 0, undefined, undefined)
  })

  it('should pass through when triggerCharacter is a string', () => {
    const options = { triggerCharacter: '.' as tslib.CompletionsTriggerCharacter }
    const { proxy, ls } = setupPlugin({ completions: undefined })
    proxy.getCompletionsAtPosition('test.ts', 0, options)
    expect(ls.getCompletionsAtPosition).toHaveBeenCalledWith('test.ts', 0, options, undefined)
  })

  it('should return resolve response with isFunction=true when type has call signatures', () => {
    const { proxy } = setupPlugin({
      program: { type: createMockType(1, 0) },
    })

    const result = proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })

    const response = getResponse(result)
    expect(response).toEqual({ id: 'resolve', isFunction: true })
  })

  it('should return resolve response with isFunction=true when type has construct signatures', () => {
    const { proxy } = setupPlugin({
      program: { type: createMockType(0, 1) },
    })

    const result = proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })

    const response = getResponse(result)
    expect(response).toEqual({ id: 'resolve', isFunction: true })
  })

  it('should return resolve response with isFunction=false when type has no signatures', () => {
    const { proxy } = setupPlugin({
      program: { type: createMockType(0, 0) },
    })

    const result = proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })

    const response = getResponse(result)
    expect(response).toEqual({ id: 'resolve', isFunction: false })
  })

  it('should return error response when program is unavailable', () => {
    const { proxy } = setupPlugin({})

    const result = proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })

    const response = getResponse(result)
    expect(response).toMatchObject({ id: 'error', error: { message: 'no program' } })
  })

  it('should return error response when symbol is not found', () => {
    const { proxy } = setupPlugin({
      program: { symbol: undefined, type: createMockType(1, 0) },
    })

    const result = proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })

    const response = getResponse(result)
    expect(response).toMatchObject({ id: 'error', error: { message: 'no symbol' } })
  })

  it('should create fallback CompletionInfo when original returns undefined', () => {
    const { proxy } = setupPlugin({
      completions: undefined,
      program: { type: createMockType(1, 0) },
    })

    const result = proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })

    expect(result).toBeDefined()
    expect(result!.entries).toEqual([])
    expect(getResponse(result)).toEqual({ id: 'resolve', isFunction: true })
  })

  it('should catch exceptions and return error response', () => {
    const ls = createMockLanguageService({
      getCompletionsAtPosition: vi.fn(() => undefined),
      getProgram: vi.fn(() => {
        throw new Error('unexpected failure')
      }) as tslib.LanguageService['getProgram'],
    })

    const mockTs = { forEachChild: vi.fn() } as unknown as typeof tslib
    const plugin = init({ typescript: mockTs })
    const proxy = plugin.create(createMockPluginCreateInfo(ls))

    const result = proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })

    const response = getResponse(result)
    expect(response).toMatchObject({ id: 'error', error: { name: 'Error', message: 'unexpected failure' } })
  })

  it('should delegate non-overridden methods to original language service', () => {
    const mockGetDefinitionAtPosition = vi.fn(() => [])
    const ls = createMockLanguageService({
      getDefinitionAtPosition: mockGetDefinitionAtPosition as tslib.LanguageService['getDefinitionAtPosition'],
    })

    const mockTs = { forEachChild: vi.fn() } as unknown as typeof tslib
    const plugin = init({ typescript: mockTs })
    const proxy = plugin.create(createMockPluginCreateInfo(ls))

    proxy.getDefinitionAtPosition('test.ts', 0)
    expect(mockGetDefinitionAtPosition).toHaveBeenCalledWith('test.ts', 0)
  })
})
