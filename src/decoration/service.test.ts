import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { DecorationService } from './service'
import type { DocumentCache } from './types'
import type { BaseSymbolResolver } from '../symbol'
import { SymbolKind, TsServerLoadingError } from '../symbol'
import type { SymbolColorMap } from '../theme'

vi.mock('../importParser', () => ({
  parseImports: vi.fn(),
}))

import { parseImports } from '../importParser'

type ServiceInternals = {
  phases: { resolver: BaseSymbolResolver }[]
  decorationTypes: Map<string, vscode.TextEditorDecorationType>
  documentCaches: Map<string, DocumentCache>
  retryTimeouts: Map<string, ReturnType<typeof setTimeout>>
  colors: SymbolColorMap
  getDecorationType: (color: string) => vscode.TextEditorDecorationType
}

function internals(service: DecorationService) {
  return service as unknown as ServiceInternals
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
      lineAt: (index: number) => ({ text: lines[index] ?? '' }),
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

describe('DecorationService', () => {
  let service: DecorationService

  beforeEach(() => {
    vi.useFakeTimers()
    service = new DecorationService(TEST_COLORS)
    vi.mocked(parseImports).mockReset()
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

        vi.mocked(parseImports).mockReturnValue({ symbols: [], importEndLine: 0 })

        const editor = createMockEditor([])
        await service.applyImportDecorations(editor)

        expect(vi.mocked(editor.setDecorations)).toHaveBeenCalledWith(existingType, [])
      })

      it('should return early if no symbols are found', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: [], importEndLine: 0 })

        const editor = createMockEditor([])
        await service.applyImportDecorations(editor)

        expect(vscode.commands.executeCommand).not.toHaveBeenCalled()
      })

      it('should find symbol occurrences and apply decorations', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(vi.mocked(editor.setDecorations)).toHaveBeenCalledWith(
          expect.objectContaining({ dispose: expect.any(Function) }),
          [expect.objectContaining({ start: expect.objectContaining({ line: 0, character: 9 }) })],
        )
      })
    })

    describe('symbol occurrence regex', () => {
      it('should exclude the module specifier part after from', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['react', 'useState'], importEndLine: 1 })
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        // Only 'useState' should be found as occurrence (react is after `from`)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should escape special regex characters in symbol names without throwing', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['$special'], importEndLine: 1 })
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Variable)

        const editor = createMockEditor(["import { $special } from 'mod'"])

        // Should not throw a regex syntax error due to unescaped $
        await expect(service.applyImportDecorations(editor)).resolves.toBeUndefined()
      })

      it('should find same symbol on multiple lines', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['Foo'], importEndLine: 2 })
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Class)

        const editor = createMockEditor(["import { Foo } from 'a'", "import { Foo } from 'b'"])
        await service.applyImportDecorations(editor)

        // Should find Foo on both lines
        const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
        const decorationCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decorationCall).toBeDefined()
        expect(decorationCall![1]).toHaveLength(2)
      })

      it('should use word boundary matching', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['use'], importEndLine: 1 })
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { use, useState } from 'react'"])
        await service.applyImportDecorations(editor)

        // Only 'use' should match, not 'use' within 'useState'
        const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
        const decorationCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decorationCall).toBeDefined()
        expect(decorationCall![1]).toHaveLength(1)
      })
    })

    describe('symbol kind resolution', () => {
      it('should call resolve for each unique symbol', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState, useEffect } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should skip decoration when all resolvers return undefined', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['unknown'], importEndLine: 1 })

        const editor = createMockEditor(["import { unknown } from 'mod'"])
        await service.applyImportDecorations(editor)

        // No decoration type should be created for unresolved symbols
        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })

      it('should skip decoration when resolver throws', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['failing'], importEndLine: 1 })
        vi.spyOn(pluginResolver(service), 'resolve').mockRejectedValue(new Error('resolution failed'))

        const editor = createMockEditor(["import { failing } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Should not throw, and should not apply any decoration
        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })

      it('should preserve earlier resolver result when later resolver also resolves', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['mySymbol'], importEndLine: 1 })
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
        vi.mocked(parseImports).mockReturnValue({ symbols: ['resolved', 'unresolved'], importEndLine: 1 })
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
        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn'], importEndLine: 1 })
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Function],
        })
      })

      it('should group symbols with same color into a single setDecorations call', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['ClassA', 'ClassB'], importEndLine: 1 })
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Class)

        const editor = createMockEditor(["import { ClassA, ClassB } from 'mod'"])
        await service.applyImportDecorations(editor)

        const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
        const applyCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length === 2)
        expect(applyCall).toBeDefined()
      })

      it('should create separate setDecorations calls for different colors', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn', 'MyClass'], importEndLine: 1 })
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
        service = new DecorationService(partialColors)
        stubAllResolvers(service)

        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn', 'MyClass'], importEndLine: 1 })
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
        service = new DecorationService({})
        stubAllResolvers(service)

        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn'], importEndLine: 1 })
        vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })
    })

    describe('caching', () => {
      it('should store resolved kinds in documentCaches', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
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

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
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

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useEffect'], importEndLine: 1 })
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

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
        const spy = vi.spyOn(pluginResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

        // Only useEffect should be resolved, not useState
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should update cache after resolving new symbols', async () => {
        const importText = "import { useState, useEffect } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importText,
          symbolKinds: new Map([['useState', SymbolKind.Function]]),
        })

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
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
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
        vi.spyOn(hoverResolver(service), 'resolve').mockRejectedValue(new TsServerLoadingError())

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(true)
      })

      it('should not schedule retry when max retries exceeded', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
        vi.spyOn(hoverResolver(service), 'resolve').mockRejectedValue(new TsServerLoadingError())

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor, 5)

        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(false)
      })

      it('should cancel pending retry when new decoration is requested', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
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
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
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

      it('should not schedule retry for non-TsServerLoadingError', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
        vi.spyOn(hoverResolver(service), 'resolve').mockRejectedValue(new Error('other error'))

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(internals(service).retryTimeouts.has(editor.document.uri.toString())).toBe(false)
      })

      it('should still apply partial decorations when some symbols resolve and others are loading', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'MyClass'], importEndLine: 1 })
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

    describe('progressive enhancement', () => {
      it('should apply decorations progressively as phases complete', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn', 'MyClass'], importEndLine: 1 })

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
        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn'], importEndLine: 1 })
        vi.spyOn(hoverResolver(service), 'resolve').mockResolvedValue(SymbolKind.Function)
        const semanticSpy = vi.spyOn(semanticTokenResolver(service), 'resolve')

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(semanticSpy).not.toHaveBeenCalled()
      })

      it('should call semanticToken only for symbols unresolved after hover', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['resolved', 'unresolved'], importEndLine: 1 })
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
