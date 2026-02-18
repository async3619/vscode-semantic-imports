import type tslib from 'typescript/lib/tsserverlibrary'
import { describe, expect, it, vi } from 'vitest'
import init from './index'
import { type PluginResponse, RESPONSE_KEY, type ResolveResponse } from './protocol'

const SymbolFlags = {
  Function: 1 << 4,
  Class: 1 << 5,
  Interface: 1 << 6,
  Enum: 1 << 8,
  TypeAlias: 1 << 17,
  Alias: 1 << 18,
  BlockScopedVariable: 1 << 1,
  FunctionScopedVariable: 1 << 0,
  NamespaceModule: 1 << 9,
}

const ALL_FALSE: Omit<ResolveResponse, 'id' | 'debug'> = {
  isFunction: false,
  isClass: false,
  isInterface: false,
  isType: false,
  isEnum: false,
  isNamespace: false,
  isVariable: false,
  isNotReady: false,
}

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

function createMockType(callSignatures = 0) {
  return {
    getCallSignatures: () => Array(callSignatures).fill({}),
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
      symbol?: { flags: number; getName?: () => string } | undefined
      aliasedSymbol?: { flags: number; getName?: () => string }
    }
  }) {
    const defaultGetName = () => 'testSymbol'
    const rawSymbol = 'symbol' in (options.program ?? {}) ? options.program!.symbol : { flags: 0 }
    const mockSymbol = rawSymbol ? { getName: defaultGetName, ...rawSymbol } : rawSymbol
    const rawAliased = options.program?.aliasedSymbol
    const mockAliasedSymbol = rawAliased ? { getName: defaultGetName, ...rawAliased } : rawAliased
    const mockType = options.program?.type ?? createMockType()

    const mockTypeChecker = {
      getSymbolAtLocation: vi.fn(() => mockSymbol),
      getTypeOfSymbolAtLocation: vi.fn(() => mockType),
      getAliasedSymbol: vi.fn(() => mockAliasedSymbol),
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
      SymbolFlags,
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

  function resolve(proxy: tslib.LanguageService) {
    return proxy.getCompletionsAtPosition('test.ts', 0, {
      triggerCharacter: { id: 'resolve' } as unknown as tslib.CompletionsTriggerCharacter,
    })
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

  describe('symbol kind resolution', () => {
    it('should resolve Function symbol', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.Function } },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isFunction: true })
    })

    it('should resolve Class symbol', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.Class } },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isClass: true })
    })

    it('should resolve Interface symbol', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.Interface } },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isInterface: true })
    })

    it('should resolve TypeAlias symbol', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.TypeAlias } },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isType: true })
    })

    it('should resolve Enum symbol', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.Enum } },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isEnum: true })
    })

    it('should resolve NamespaceModule symbol', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.NamespaceModule } },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isNamespace: true })
    })

    it('should resolve BlockScopedVariable with call signatures as function', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.BlockScopedVariable }, type: createMockType(1) },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isFunction: true })
    })

    it('should resolve BlockScopedVariable without call signatures as variable', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.BlockScopedVariable }, type: createMockType(0) },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isVariable: true })
    })

    it('should resolve FunctionScopedVariable with call signatures as function', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.FunctionScopedVariable }, type: createMockType(1) },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isFunction: true })
    })

    it('should return all false for unrecognized symbol flags', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: 0 } },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE })
    })
  })

  describe('alias resolution', () => {
    it('should resolve alias to the aliased symbol', () => {
      const { proxy, mockTypeChecker } = setupPlugin({
        program: {
          symbol: { flags: SymbolFlags.Alias },
          aliasedSymbol: { flags: SymbolFlags.Function },
        },
      })
      const response = getResponse(resolve(proxy))
      expect(mockTypeChecker.getAliasedSymbol).toHaveBeenCalled()
      expect(response).toMatchObject({ id: 'resolve', ...ALL_FALSE, isFunction: true })
    })

    it('should resolve alias to class', () => {
      const { proxy } = setupPlugin({
        program: {
          symbol: { flags: SymbolFlags.Alias },
          aliasedSymbol: { flags: SymbolFlags.Class },
        },
      })
      expect(getResponse(resolve(proxy))).toMatchObject({ id: 'resolve', ...ALL_FALSE, isClass: true })
    })

    it('should not call getAliasedSymbol when symbol is not an alias', () => {
      const { proxy, mockTypeChecker } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.Function } },
      })
      resolve(proxy)
      expect(mockTypeChecker.getAliasedSymbol).not.toHaveBeenCalled()
    })
  })

  describe('debug info', () => {
    it('should include debug info with symbol flags and name', () => {
      const { proxy } = setupPlugin({
        program: { symbol: { flags: SymbolFlags.Function, getName: () => 'myFunc' } },
      })
      const response = getResponse(resolve(proxy))
      expect(response).toMatchObject({
        debug: { symbolFlags: SymbolFlags.Function, symbolName: 'myFunc', wasAlias: false, aliasedFlags: null },
      })
    })

    it('should include alias debug info when symbol is aliased', () => {
      const { proxy } = setupPlugin({
        program: {
          symbol: { flags: SymbolFlags.Alias, getName: () => 'originalName' },
          aliasedSymbol: { flags: SymbolFlags.Class, getName: () => 'MyClass' },
        },
      })
      const response = getResponse(resolve(proxy))
      expect(response).toMatchObject({
        debug: {
          symbolFlags: SymbolFlags.Class,
          symbolName: 'MyClass',
          wasAlias: true,
          aliasedFlags: SymbolFlags.Class,
        },
      })
    })

    it('should set isNotReady when alias resolves to unknown', () => {
      const { proxy } = setupPlugin({
        program: {
          symbol: { flags: SymbolFlags.Alias },
          aliasedSymbol: { flags: 0, getName: () => 'unknown' },
        },
      })
      const response = getResponse(resolve(proxy))
      expect(response).toMatchObject({ isNotReady: true })
    })

    it('should not set isNotReady when alias resolves to a known symbol', () => {
      const { proxy } = setupPlugin({
        program: {
          symbol: { flags: SymbolFlags.Alias },
          aliasedSymbol: { flags: SymbolFlags.Function, getName: () => 'myFunc' },
        },
      })
      const response = getResponse(resolve(proxy))
      expect(response).toMatchObject({ isNotReady: false })
    })
  })

  describe('error handling', () => {
    it('should return error response when program is unavailable', () => {
      const { proxy } = setupPlugin({})
      const response = getResponse(resolve(proxy))
      expect(response).toMatchObject({ id: 'error', error: { message: 'no program' } })
    })

    it('should return error response when symbol is not found', () => {
      const { proxy } = setupPlugin({
        program: { symbol: undefined },
      })
      const response = getResponse(resolve(proxy))
      expect(response).toMatchObject({ id: 'error', error: { message: 'no symbol' } })
    })

    it('should catch exceptions and return error response', () => {
      const ls = createMockLanguageService({
        getCompletionsAtPosition: vi.fn(() => undefined),
        getProgram: vi.fn(() => {
          throw new Error('unexpected failure')
        }) as tslib.LanguageService['getProgram'],
      })

      const mockTs = { forEachChild: vi.fn(), SymbolFlags } as unknown as typeof tslib
      const plugin = init({ typescript: mockTs })
      const proxy = plugin.create(createMockPluginCreateInfo(ls))

      const response = getResponse(resolve(proxy))
      expect(response).toMatchObject({ id: 'error', error: { name: 'Error', message: 'unexpected failure' } })
    })
  })

  it('should create fallback CompletionInfo when original returns undefined', () => {
    const { proxy } = setupPlugin({
      completions: undefined,
      program: { symbol: { flags: SymbolFlags.Function } },
    })

    const result = resolve(proxy)

    expect(result).toBeDefined()
    expect(result!.entries).toEqual([])
    expect(getResponse(result)).toMatchObject({ id: 'resolve', ...ALL_FALSE, isFunction: true })
  })

  it('should delegate non-overridden methods to original language service', () => {
    const mockGetDefinitionAtPosition = vi.fn(() => [])
    const ls = createMockLanguageService({
      getDefinitionAtPosition: mockGetDefinitionAtPosition as tslib.LanguageService['getDefinitionAtPosition'],
    })

    const mockTs = { forEachChild: vi.fn(), SymbolFlags } as unknown as typeof tslib
    const plugin = init({ typescript: mockTs })
    const proxy = plugin.create(createMockPluginCreateInfo(ls))

    proxy.getDefinitionAtPosition('test.ts', 0)
    expect(mockGetDefinitionAtPosition).toHaveBeenCalledWith('test.ts', 0)
  })
})
