import { describe, it, expect, vi } from 'vitest'
import type tslib from 'typescript/lib/tsserverlibrary'
import init from './index'
import { TAG_NAME, type PluginTagData } from './protocol'

function createMockLanguageService(overrides: Partial<tslib.LanguageService> = {}) {
  const ls: Partial<tslib.LanguageService> = {
    getQuickInfoAtPosition: vi.fn(),
    getProgram: vi.fn(),
    ...overrides,
  }
  return ls as tslib.LanguageService
}

function createMockPluginCreateInfo(ls: tslib.LanguageService) {
  return { languageService: ls } as tslib.server.PluginCreateInfo
}

function createMockQuickInfo(overrides: Partial<tslib.QuickInfo> = {}): tslib.QuickInfo {
  return {
    kind: '' as tslib.ScriptElementKind,
    kindModifiers: '',
    textSpan: { start: 0, length: 0 },
    tags: [],
    ...overrides,
  }
}

function createMockType(callSignatures = 0, constructSignatures = 0) {
  return {
    getCallSignatures: () => Array(callSignatures).fill({}),
    getConstructSignatures: () => Array(constructSignatures).fill({}),
  }
}

describe('tsPlugin', () => {
  function setupPlugin(options: {
    quickInfo?: tslib.QuickInfo | undefined
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
      getQuickInfoAtPosition: vi.fn(() => options.quickInfo),
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

  it('should return undefined when original quickinfo returns undefined', () => {
    const { proxy } = setupPlugin({ quickInfo: undefined })
    const result = proxy.getQuickInfoAtPosition('test.ts', 0)
    expect(result).toBeUndefined()
  })

  it('should return prior unchanged when program is unavailable', () => {
    const quickInfo = createMockQuickInfo()
    const { proxy } = setupPlugin({ quickInfo })

    const result = proxy.getQuickInfoAtPosition('test.ts', 0)
    expect(result).toBeDefined()
  })

  it('should inject isFunction=true tag when type has call signatures', () => {
    const quickInfo = createMockQuickInfo({ tags: [] })
    const { proxy } = setupPlugin({
      quickInfo,
      program: {
        type: createMockType(1, 0),
      },
    })

    const result = proxy.getQuickInfoAtPosition('test.ts', 0)!
    const tag = result.tags?.find((t) => t.name === TAG_NAME)

    expect(tag).toBeDefined()
    const data: PluginTagData = JSON.parse(tag!.text![0].text)
    expect(data.isFunction).toBe(true)
  })

  it('should inject isFunction=true tag when type has construct signatures', () => {
    const quickInfo = createMockQuickInfo({ tags: [] })
    const { proxy } = setupPlugin({
      quickInfo,
      program: {
        type: createMockType(0, 1),
      },
    })

    const result = proxy.getQuickInfoAtPosition('test.ts', 0)!
    const tag = result.tags?.find((t) => t.name === TAG_NAME)

    expect(tag).toBeDefined()
    const data: PluginTagData = JSON.parse(tag!.text![0].text)
    expect(data.isFunction).toBe(true)
  })

  it('should inject isFunction=false tag when type has no call or construct signatures', () => {
    const quickInfo = createMockQuickInfo({ tags: [] })
    const { proxy } = setupPlugin({
      quickInfo,
      program: {
        type: createMockType(0, 0),
      },
    })

    const result = proxy.getQuickInfoAtPosition('test.ts', 0)!
    const tag = result.tags?.find((t) => t.name === TAG_NAME)

    expect(tag).toBeDefined()
    const data: PluginTagData = JSON.parse(tag!.text![0].text)
    expect(data.isFunction).toBe(false)
  })

  it('should preserve existing tags when injecting', () => {
    const existingTag = { name: 'param', text: [{ kind: 'text' as const, text: 'x - value' }] }
    const quickInfo = createMockQuickInfo({ tags: [existingTag] })
    const { proxy } = setupPlugin({
      quickInfo,
      program: {
        type: createMockType(0, 0),
      },
    })

    const result = proxy.getQuickInfoAtPosition('test.ts', 0)!
    expect(result.tags).toHaveLength(2)
    expect(result.tags![0]).toEqual(existingTag)
    expect(result.tags![1].name).toBe(TAG_NAME)
  })

  it('should return prior unchanged when symbol is not found at node', () => {
    const quickInfo = createMockQuickInfo({ tags: [] })
    const { proxy } = setupPlugin({
      quickInfo,
      program: {
        symbol: undefined,
        type: createMockType(1, 0),
      },
    })

    const result = proxy.getQuickInfoAtPosition('test.ts', 0)!
    const tag = result.tags?.find((t) => t.name === TAG_NAME)
    expect(tag).toBeUndefined()
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
