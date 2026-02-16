import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { DecorationService } from './service'
import type { DocumentCache } from './types'
import type { BaseSymbolResolver } from '../symbol'
import { SymbolKind, TsServerLoadingError } from '../symbol'
import type { SymbolColorMap } from '../theme'
import { TypeScriptServerProbe } from '../tsServer'
import type { ImportStatement } from '../parser'
import { TypeScriptParser } from '../parser'

type ServiceInternals = {
  phases: { resolver: BaseSymbolResolver }[]
  probe: TypeScriptServerProbe
  parser: TypeScriptParser
  decorationTypes: Map<string, vscode.TextEditorDecorationType>
  documentCaches: Map<string, DocumentCache>
  retryTimeouts: Map<string, ReturnType<typeof setTimeout>>
  probeControllers: Map<string, AbortController>
  colors: SymbolColorMap
  getDecorationType: (color: string) => vscode.TextEditorDecorationType
}

function internals(service: DecorationService) {
  return service as unknown as ServiceInternals
}

function stmt(overrides: Partial<ImportStatement> & Pick<ImportStatement, 'localName'>): ImportStatement {
  return {
    importedName: overrides.localName,
    source: 'mod',
    kind: 'named',
    isTypeOnly: false,
    startLine: 0,
    startColumn: 0,
    endLine: 0,
    endColumn: 0,
    ...overrides,
  }
}

function mockParserReturn(service: DecorationService, statements: ImportStatement[]) {
  vi.spyOn(internals(service).parser, 'parseImports').mockReturnValue(statements)
}

const TEST_COLORS: SymbolColorMap = {
  [SymbolKind.Function]: '#DCDCAA',
  [SymbolKind.Class]: '#4EC9B0',
  [SymbolKind.Interface]: '#4EC9B0',
  [SymbolKind.Type]: '#4EC9B0',
  [SymbolKind.Enum]: '#4EC9B0',
  [SymbolKind.Namespace]: '#4EC9B0',
  [SymbolKind.Variable]: '#9CDCFE',
}

function createMockEditor(lines: string[]) {
  const text = lines.join('\n')
  return {
    document: {
      getText: () => text,
      uri: vscode.Uri.parse('file:///test.ts'),
    },
    setDecorations: vi.fn(),
  } as unknown as vscode.TextEditor
}

function pluginResolver(service: DecorationService) {
  return internals(service).phases[0].resolver
}

function hoverResolver(service: DecorationService) {
  return internals(service).phases[1].resolver
}

function semanticTokenResolver(service: DecorationService) {
  return internals(service).phases[2].resolver
}

function stubAllResolvers(service: DecorationService) {
  for (const { resolver } of internals(service).phases) {
    vi.spyOn(resolver, 'resolve').mockResolvedValue(undefined)
  }
}

function createMockProbe() {
  const probe = new TypeScriptServerProbe()
  vi.spyOn(probe, 'waitForReady').mockResolvedValue(true)
  return probe
}

describe('DecorationService', () => {
  let service: DecorationService
  let mockProbe: TypeScriptServerProbe

  beforeEach(() => {
    vi.useFakeTimers()
    mockProbe = createMockProbe()
    service = new DecorationService(TEST_COLORS, mockProbe)
    vi.mocked(vscode.commands.executeCommand).mockReset()
    vi.mocked(vscode.window.createTextEditorDecorationType).mockClear()

    // Explicitly stub all resolver methods to undefined by default.
    // Tests that need a specific resolver to return a value will override the relevant spy.
    stubAllResolvers(service)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('applyImportDecorations', () => {
    describe('basic flow', () => {
      it('should clear existing decorations before applying new ones', async () => {
        const disposeFn = vi.fn()
        const existingType = { key: 'existing', dispose: disposeFn } as unknown as vscode.TextEditorDecorationType
        internals(service).decorationTypes.set('#ff0000', existingType)

        mockParserReturn(service, [])

        const editor = createMockEditor([])
        await service.applyImportDecorations(editor)

        expect(vi.mocked(editor.setDecorations)).toHaveBeenCalledWith(existingType, [])
      })

      it('should return early if no symbols are found', async () => {
        mockParserReturn(service, [])

        const editor = createMockEditor([])
        await service.applyImportDecorations(editor)

        expect(vscode.commands.executeCommand).not.toHaveBeenCalled()
      })

      it('should find symbol occurrences and apply decorations', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(vi.mocked(editor.setDecorations)).toHaveBeenCalledWith(
          expect.objectContaining({ dispose: expect.any(Function) }),
          [expect.objectContaining({ start: expect.objectContaining({ line: 0, character: 9 }) })],
        )
      })
    })

    describe('symbol occurrences', () => {
      it('should find same symbol on multiple lines', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'Foo', source: 'a', startLine: 0, startColumn: 9, endLine: 0, endColumn: 12 }),
          stmt({ localName: 'Foo', source: 'b', startLine: 1, startColumn: 9, endLine: 1, endColumn: 12 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Class)

        const editor = createMockEditor(["import { Foo } from 'a'", "import { Foo } from 'b'"])
        await service.applyImportDecorations(editor)

        // Should find Foo on both lines
        const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
        const decorationCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decorationCall).toBeDefined()
        expect(decorationCall![1]).toHaveLength(2)
      })
    })

    describe('symbol kind resolution', () => {
      it('should call resolve for each unique symbol', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'useEffect', source: 'react', startLine: 0, startColumn: 19, endLine: 0, endColumn: 28 }),
        ])
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState, useEffect } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should skip decoration when all resolvers return undefined', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'unknown', startLine: 0, startColumn: 9, endLine: 0, endColumn: 16 }),
        ])

        const editor = createMockEditor(["import { unknown } from 'mod'"])
        await service.applyImportDecorations(editor)

        // No decoration type should be created for unresolved symbols
        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })

      it('should limit concurrent resolve calls', async () => {
        vi.useRealTimers()

        const symbolCount = 10
        const symbols = Array.from({ length: symbolCount }, (_, i) => `sym${i}`)
        const importLine = `import { ${symbols.join(', ')} } from 'mod'`

        let col = 9
        const statements = symbols.map((name) => {
          const s = stmt({ localName: name, startLine: 0, startColumn: col, endLine: 0, endColumn: col + name.length })
          col += name.length + 2
          return s
        })
        mockParserReturn(service, statements)

        let concurrent = 0
        let maxConcurrent = 0
        vi.spyOn(pluginResolver(service), 'resolve').mockImplementation(async () => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await new Promise((r) => setTimeout(r, 10))
          concurrent--
          return SymbolKind.Function
        })

        const editor = createMockEditor([importLine])
        await service.applyImportDecorations(editor)

        expect(maxConcurrent).toBeLessThanOrEqual(5)
        expect(maxConcurrent).toBeGreaterThan(1)
      })

      it('should skip decoration when resolver throws', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'failing', startLine: 0, startColumn: 9, endLine: 0, endColumn: 16 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockRejectedValue(new Error('resolution failed'))

        const editor = createMockEditor(["import { failing } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Should not throw, and should not apply any decoration
        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })

      it('should preserve earlier resolver result when later resolver also resolves', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'mySymbol', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)
        vi.spyOn(hoverResolver(service), 'resolve').mockResolvedValue(SymbolKind.Class)

        const editor = createMockEditor(["import { mySymbol } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Plugin (Phase 1) result should be preserved, not overwritten by Hover (Phase 2)
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Function],
        })
      })

      it('should use semanticToken as fallback only when hover returns undefined', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'resolved', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'unresolved', startLine: 0, startColumn: 19, endLine: 0, endColumn: 29 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          return pos.character === 9 ? SymbolKind.Function : undefined
        })
        vi.spyOn(semanticTokenResolver(service), 'resolve').mockResolvedValue(SymbolKind.Variable)

        const editor = createMockEditor(["import { resolved, unresolved } from 'mod'"])
        await service.applyImportDecorations(editor)

        const semanticSpy = vi.mocked(semanticTokenResolver(service).resolve)
        // SemanticToken should only be called for 'unresolved' (hover returned undefined)
        expect(semanticSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('color mapping', () => {
      it('should map function kind to the injected function color', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Function],
        })
      })

      it('should group symbols with same color into a single setDecorations call', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'ClassA', startLine: 0, startColumn: 9, endLine: 0, endColumn: 15 }),
          stmt({ localName: 'ClassB', startLine: 0, startColumn: 17, endLine: 0, endColumn: 23 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Class)

        const editor = createMockEditor(["import { ClassA, ClassB } from 'mod'"])
        await service.applyImportDecorations(editor)

        const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
        const applyCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length === 2)
        expect(applyCall).toBeDefined()
      })

      it('should create separate setDecorations calls for different colors', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
          stmt({ localName: 'MyClass', startLine: 0, startColumn: 15, endLine: 0, endColumn: 22 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          // myFn at char 9, MyClass at char 15
          return pos.character < 14 ? SymbolKind.Function : SymbolKind.Class
        })

        const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Two different decoration types should be created (Function color + Class color)
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Function],
        })
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Class],
        })
      })

      it('should skip symbols whose kind has no color in the map', async () => {
        const partialColors: SymbolColorMap = { [SymbolKind.Function]: '#DCDCAA' }
        service = new DecorationService(partialColors, mockProbe)
        stubAllResolvers(service)

        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
          stmt({ localName: 'MyClass', startLine: 0, startColumn: 15, endLine: 0, endColumn: 22 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          return pos.character < 14 ? SymbolKind.Function : SymbolKind.Class
        })

        const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Only Function color should be created (Class has no color in partialColors)
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(1)
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: '#DCDCAA',
        })
      })

      it('should not apply any decorations when colors map is empty', async () => {
        service = new DecorationService({}, mockProbe)
        stubAllResolvers(service)

        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })
    })

    describe('caching', () => {
      it('should store resolved kinds in documentCaches', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        const cached = internals(service).documentCaches.get(editor.document.uri.toString())
        expect(cached).toBeDefined()
        expect(cached!.symbolKinds.get('useState')).toBe(SymbolKind.Function)
      })

      it('should reuse cache when importSectionText is unchanged', async () => {
        const importLine = "import { useState } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importLine,
          symbolKinds: new Map([['useState', SymbolKind.Function]]),
        })

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        const spy = vi.spyOn(pluginResolver(service), 'resolve')

        const editor = createMockEditor([importLine])
        await service.applyImportDecorations(editor)

        expect(spy).not.toHaveBeenCalled()
      })

      it('should invalidate cache when importSectionText changes', async () => {
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: "import { useState } from 'react'",
          symbolKinds: new Map([['useState', SymbolKind.Function]]),
        })

        mockParserReturn(service, [
          stmt({ localName: 'useEffect', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 18 }),
        ])
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useEffect } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(spy).toHaveBeenCalled()
      })

      it('should resolve only uncached symbols on partial cache hit', async () => {
        const importText = "import { useState, useEffect } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importText,
          symbolKinds: new Map([['useState', SymbolKind.Function]]),
        })

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'useEffect', source: 'react', startLine: 0, startColumn: 19, endLine: 0, endColumn: 28 }),
        ])
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

        // Only useEffect should be resolved, not useState
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should apply cached decorations even when new symbols fail to resolve', async () => {
        const importText = "import { useState, useEffect } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importText,
          symbolKinds: new Map([['useState', SymbolKind.Function]]),
        })

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'useEffect', source: 'react', startLine: 0, startColumn: 19, endLine: 0, endColumn: 28 }),
        ])
        // All resolvers fail for useEffect (return undefined by default from stubAllResolvers)

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

        // Cached useState should still be decorated despite useEffect failing
        const calls = vi.mocked(editor.setDecorations).mock.calls
        const decoratedCall = calls.find((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decoratedCall).toBeDefined()
        expect(decoratedCall![1]).toHaveLength(1)
      })

      it('should update cache after resolving new symbols', async () => {
        const importText = "import { useState, useEffect } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importText,
          symbolKinds: new Map([['useState', SymbolKind.Function]]),
        })

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'useEffect', source: 'react', startLine: 0, startColumn: 19, endLine: 0, endColumn: 28 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

        const cached = internals(service).documentCaches.get(docUri)
        expect(cached!.symbolKinds.get('useState')).toBe(SymbolKind.Function)
        expect(cached!.symbolKinds.get('useEffect')).toBe(SymbolKind.Function)
      })
    })

    describe('tsserver loading retry', () => {
      it('should schedule a retry when hover resolver throws TsServerLoadingError', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockRejectedValue(new TsServerLoadingError())

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(true)
      })

      it('should not schedule retry when max retries exceeded', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockRejectedValue(new TsServerLoadingError())

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor, 5)

        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(false)
      })

      it('should cancel pending retry when new decoration is requested', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockRejectedValue(new TsServerLoadingError())

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        const firstTimeout = internals(service).retryTimeouts.get(editor.document.uri.toString())
        expect(firstTimeout).toBeDefined()

        // Trigger new decoration request — should cancel the pending retry
        await service.applyImportDecorations(editor)

        const secondTimeout = internals(service).retryTimeouts.get(editor.document.uri.toString())
        expect(secondTimeout).not.toBe(firstTimeout)
      })

      it('should execute retry after timeout fires', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        const resolveSpy = vi
          .spyOn(hoverResolver(service), 'resolve')
          .mockRejectedValueOnce(new TsServerLoadingError())
          .mockResolvedValueOnce(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        // Fast-forward timer to trigger the retry
        await vi.advanceTimersByTimeAsync(500)

        // Resolver should have been called twice (initial + retry)
        expect(resolveSpy).toHaveBeenCalledTimes(2)
      })

      it('should not schedule retry for non-TsServerLoadingError when some symbols resolve', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'broken', startLine: 0, startColumn: 19, endLine: 0, endColumn: 25 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          if (pos.character === 9) {
            return SymbolKind.Function
          }
          throw new Error('other error')
        })

        const editor = createMockEditor(["import { useState, broken } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(false)
      })

      it('should still apply partial decorations when some symbols resolve and others are loading', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'MyClass', startLine: 0, startColumn: 19, endLine: 0, endColumn: 26 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          if (pos.character === 9) {
            return SymbolKind.Function
          }
          throw new TsServerLoadingError()
        })

        const editor = createMockEditor(["import { useState, MyClass } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Partial decoration should be applied for useState
        const calls = vi.mocked(editor.setDecorations).mock.calls
        const decoratedCall = calls.find((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decoratedCall).toBeDefined()

        // Retry should be scheduled for MyClass
        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(true)
      })
    })

    describe('tsserver probe', () => {
      it('should call probe.waitForReady before resolver pipeline when symbols need resolving', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(mockProbe.waitForReady).toHaveBeenCalledOnce()
        expect(mockProbe.waitForReady).toHaveBeenCalledWith(
          editor.document,
          expect.objectContaining({ line: 0, character: 9 }),
          expect.any(AbortSignal),
        )
      })

      it('should not call probe when all symbols are cached', async () => {
        const importLine = "import { useState } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importLine,
          symbolKinds: new Map([['useState', SymbolKind.Function]]),
        })

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])

        const editor = createMockEditor([importLine])
        await service.applyImportDecorations(editor)

        expect(mockProbe.waitForReady).not.toHaveBeenCalled()
      })

      it('should abort previous probe when new decoration request arrives', async () => {
        vi.mocked(mockProbe.waitForReady)
          .mockImplementationOnce(
            (_doc, _pos, signal) =>
              new Promise<boolean>((resolve) => {
                signal.addEventListener('abort', () => resolve(false), { once: true })
              }),
          )
          .mockResolvedValueOnce(true)

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])

        // First call starts probe (blocks on promise)
        const firstPromise = service.applyImportDecorations(editor)
        await vi.advanceTimersByTimeAsync(0)

        // Second call should abort the first probe
        const secondPromise = service.applyImportDecorations(editor)
        await vi.advanceTimersByTimeAsync(0)

        await Promise.all([firstPromise, secondPromise])

        // First probe should have been aborted, second should proceed
        expect(mockProbe.waitForReady).toHaveBeenCalledTimes(2)
      })

      it('should return early when probe is cancelled (signal aborted)', async () => {
        vi.mocked(mockProbe.waitForReady).mockImplementation(async (_doc, _pos, signal) => {
          // Simulate abort during wait
          return !signal.aborted
        })

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])

        // Manually abort before probe completes
        const firstPromise = service.applyImportDecorations(editor)
        internals(service).probeControllers.get(editor.document.uri.toString())?.abort()
        await firstPromise

        // Resolver should not have been called since probe was aborted
        expect(spy).not.toHaveBeenCalled()
      })

      it('should proceed with resolvers even when probe times out', async () => {
        vi.mocked(mockProbe.waitForReady).mockResolvedValue(false)
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(spy).toHaveBeenCalled()
      })

      it('should clean up probe controllers on dispose', () => {
        const controller = new AbortController()
        const abortSpy = vi.spyOn(controller, 'abort')
        internals(service).probeControllers.set('file:///a.ts', controller)

        service.dispose()

        expect(abortSpy).toHaveBeenCalledOnce()
        expect(internals(service).probeControllers.size).toBe(0)
      })
    })

    describe('post-resolve fallback', () => {
      it('should schedule retry when all symbols remain unresolved', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'unknown', startLine: 0, startColumn: 9, endLine: 0, endColumn: 16 }),
        ])
        // All resolvers return undefined (from stubAllResolvers)

        const editor = createMockEditor(["import { unknown } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Should schedule retry because all symbols are unresolved
        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(true)
      })

      it('should not schedule fallback retry when at least one symbol was resolved', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'resolved', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'unresolved', startLine: 0, startColumn: 19, endLine: 0, endColumn: 29 }),
        ])
        vi.spyOn(pluginResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          return pos.character === 9 ? SymbolKind.Function : undefined
        })

        const editor = createMockEditor(["import { resolved, unresolved } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Should NOT schedule retry because 'resolved' was resolved
        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(false)
      })

      it('should not double-schedule retry when TsServerLoadingError already triggered retry', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'loading', startLine: 0, startColumn: 9, endLine: 0, endColumn: 16 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockRejectedValue(new TsServerLoadingError())

        const editor = createMockEditor(["import { loading } from 'mod'"])
        await service.applyImportDecorations(editor)

        // tsServerLoading is already true from TsServerLoadingError, fallback should not override
        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(true)
      })
    })

    describe('progressive enhancement', () => {
      it('should apply decorations progressively as phases complete', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
          stmt({ localName: 'MyClass', startLine: 0, startColumn: 15, endLine: 0, endColumn: 22 }),
        ])

        // Plugin resolves myFn immediately, leaves MyClass unresolved
        vi.spyOn(pluginResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          return pos.character === 9 ? SymbolKind.Function : undefined
        })

        // Block Hover with a deferred promise
        let resolveHover!: (value: SymbolKind | undefined) => void
        const hoverPromise = new Promise<SymbolKind | undefined>((resolve) => {
          resolveHover = resolve
        })
        vi.spyOn(hoverResolver(service), 'resolve').mockImplementation(async () => hoverPromise)

        const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
        const applyPromise = service.applyImportDecorations(editor)

        // Flush microtasks to let Plugin phase complete and decorations to be applied
        await vi.advanceTimersByTimeAsync(0)

        // Plugin resolved myFn, decorations should already be applied before Hover completes
        const callsBefore = vi.mocked(editor.setDecorations).mock.calls
        const decoratedBefore = callsBefore.filter((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decoratedBefore.length).toBeGreaterThanOrEqual(1)

        // Resolve Hover for MyClass and wait for all phases to complete
        resolveHover(SymbolKind.Class)
        await applyPromise

        // After all phases, additional decoration updates should have been made
        const callsAfter = vi.mocked(editor.setDecorations).mock.calls
        const decoratedAfter = callsAfter.filter((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decoratedAfter.length).toBeGreaterThan(decoratedBefore.length)
      })

      it('should not call semanticToken for symbols already resolved by hover', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)
        const semanticSpy = vi.spyOn(semanticTokenResolver(service), 'resolve')

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(semanticSpy).not.toHaveBeenCalled()
      })

      it('should call semanticToken only for symbols unresolved after hover', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'resolved', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'unresolved', startLine: 0, startColumn: 19, endLine: 0, endColumn: 29 }),
        ])
        vi.spyOn(hoverResolver(service), 'resolve').mockImplementation(async (_doc, pos) => {
          return pos.character === 9 ? SymbolKind.Function : undefined
        })
        const semanticSpy = vi.spyOn(semanticTokenResolver(service), 'resolve').mockResolvedValue(SymbolKind.Variable)

        const editor = createMockEditor(["import { resolved, unresolved } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(semanticSpy).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('setColors', () => {
    it('should update the colors map', () => {
      const newColors: SymbolColorMap = { [SymbolKind.Function]: '#FF0000' }
      service.setColors(newColors)
      expect(internals(service).colors).toBe(newColors)
    })

    it('should dispose existing decoration types', () => {
      const dispose1 = vi.fn()
      const dispose2 = vi.fn()
      internals(service).decorationTypes.set('#aaa', {
        dispose: dispose1,
      } as unknown as vscode.TextEditorDecorationType)
      internals(service).decorationTypes.set('#bbb', {
        dispose: dispose2,
      } as unknown as vscode.TextEditorDecorationType)

      service.setColors({})

      expect(dispose1).toHaveBeenCalledOnce()
      expect(dispose2).toHaveBeenCalledOnce()
    })

    it('should clear the decoration types map', () => {
      internals(service).decorationTypes.set('#aaa', {
        dispose: vi.fn(),
      } as unknown as vscode.TextEditorDecorationType)

      service.setColors({})

      expect(internals(service).decorationTypes.size).toBe(0)
    })
  })

  describe('clearDocumentCache', () => {
    it('should delete the cache entry for the given uri', () => {
      internals(service).documentCaches.set('file:///test.ts', {
        importSectionText: 'import {}',
        symbolKinds: new Map(),
      })
      service.clearDocumentCache('file:///test.ts')
      expect(internals(service).documentCaches.has('file:///test.ts')).toBe(false)
    })

    it('should not affect other cache entries', () => {
      internals(service).documentCaches.set('file:///a.ts', { importSectionText: '', symbolKinds: new Map() })
      internals(service).documentCaches.set('file:///b.ts', { importSectionText: '', symbolKinds: new Map() })
      service.clearDocumentCache('file:///a.ts')
      expect(internals(service).documentCaches.has('file:///a.ts')).toBe(false)
      expect(internals(service).documentCaches.has('file:///b.ts')).toBe(true)
    })

    it('should be a no-op if uri does not exist in cache', () => {
      expect(internals(service).documentCaches.size).toBe(0)
      service.clearDocumentCache('file:///nonexistent.ts')
      expect(internals(service).documentCaches.size).toBe(0)
    })
  })

  describe('dispose', () => {
    it('should call dispose() on all decoration types', () => {
      const dispose1 = vi.fn()
      const dispose2 = vi.fn()
      internals(service).decorationTypes.set('#ff0000', {
        dispose: dispose1,
      } as unknown as vscode.TextEditorDecorationType)
      internals(service).decorationTypes.set('#00ff00', {
        dispose: dispose2,
      } as unknown as vscode.TextEditorDecorationType)

      service.dispose()

      expect(dispose1).toHaveBeenCalledOnce()
      expect(dispose2).toHaveBeenCalledOnce()
    })

    it('should clear the decorationTypes map', () => {
      internals(service).decorationTypes.set('#ff0000', {
        dispose: vi.fn(),
      } as unknown as vscode.TextEditorDecorationType)

      service.dispose()

      expect(internals(service).decorationTypes.size).toBe(0)
    })

    it('should clear the documentCaches map', () => {
      internals(service).documentCaches.set('file:///test.ts', { importSectionText: '', symbolKinds: new Map() })

      service.dispose()

      expect(internals(service).documentCaches.size).toBe(0)
    })

    it('should handle empty state gracefully', () => {
      expect(() => service.dispose()).not.toThrow()
      expect(internals(service).decorationTypes.size).toBe(0)
      expect(internals(service).documentCaches.size).toBe(0)
    })

    it('should clear all pending retry timeouts', () => {
      const timeout1 = setTimeout(() => {}, 1000)
      const timeout2 = setTimeout(() => {}, 2000)
      internals(service).retryTimeouts.set('file:///a.ts', timeout1)
      internals(service).retryTimeouts.set('file:///b.ts', timeout2)

      service.dispose()

      expect(internals(service).retryTimeouts.size).toBe(0)
    })
  })

  describe('getDecorationType', () => {
    it('should create a new decoration type for an unseen color', () => {
      const result = internals(service).getDecorationType('#ff0000')

      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: '#ff0000' })
      expect(result).toBeDefined()
      expect(result.dispose).toBeDefined()
    })

    it('should return cached decoration type for previously seen color', () => {
      const first = internals(service).getDecorationType('#ff0000')
      const second = internals(service).getDecorationType('#ff0000')

      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(1)
      expect(first).toBe(second)
    })

    it('should create separate decoration types for different colors', () => {
      const red = internals(service).getDecorationType('#ff0000')
      const green = internals(service).getDecorationType('#00ff00')

      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(2)
      expect(red).not.toBe(green)
    })

    it('should store the decoration type in the decorationTypes map', () => {
      const result = internals(service).getDecorationType('#ff0000')

      expect(internals(service).decorationTypes.get('#ff0000')).toBe(result)
    })
  })
})
