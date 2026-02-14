import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { DecorationService } from './service'
import { DEFAULT_COLOR, KIND_COLORS } from './constants'
import type { DocumentCache } from './types'
import type { SymbolResolver } from '../symbol'

vi.mock('../importParser', () => ({
  parseImports: vi.fn(),
}))

import { parseImports } from '../importParser'

type ServiceInternals = {
  output: vscode.OutputChannel
  symbolResolver: SymbolResolver
  decorationTypes: Map<string, vscode.TextEditorDecorationType>
  documentCaches: Map<string, DocumentCache>
  getDecorationType: (color: string) => vscode.TextEditorDecorationType
}

function internals(service: DecorationService): ServiceInternals {
  return service as unknown as ServiceInternals
}

function createMockEditor(lines: string[]): vscode.TextEditor {
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

describe('DecorationService', () => {
  let service: DecorationService

  beforeEach(() => {
    service = new DecorationService()
    vi.mocked(parseImports).mockReset()
    vi.mocked(vscode.commands.executeCommand).mockReset()
    vi.mocked(vscode.window.createTextEditorDecorationType).mockClear()

    // Explicitly stub all resolver methods to undefined by default.
    // Tests that need a specific strategy to return a value will override the relevant spy.
    vi.spyOn(internals(service).symbolResolver, 'resolveByHover').mockResolvedValue(undefined)
    vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue(undefined)
    vi.spyOn(internals(service).symbolResolver, 'resolveByQuickInfo').mockResolvedValue(undefined)
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
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

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
        const spy = vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        // Only 'useState' should be found as occurrence (react is after `from`)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should escape special regex characters in symbol names without throwing', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['$special'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('variable')

        const editor = createMockEditor(["import { $special } from 'mod'"])

        // Should not throw a regex syntax error due to unescaped $
        await expect(service.applyImportDecorations(editor)).resolves.toBeUndefined()
      })

      it('should find same symbol on multiple lines', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['Foo'], importEndLine: 2 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('class')

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
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

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
      it('should call resolveBySemanticToken for each unique symbol', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
        const spy = vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

        const editor = createMockEditor(["import { useState, useEffect } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should use DEFAULT_COLOR when resolver returns undefined', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['unknown'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue(undefined)

        const editor = createMockEditor(["import { unknown } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: DEFAULT_COLOR })
      })

      it('should use DEFAULT_COLOR when resolver throws', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['failing'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockRejectedValue(
          new Error('resolution failed'),
        )

        const editor = createMockEditor(["import { failing } from 'mod'"])
        await service.applyImportDecorations(editor)

        // Should not throw, and should apply default color
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: DEFAULT_COLOR })
      })
    })

    describe('color mapping', () => {
      it('should map function kind to KIND_COLORS.function', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: KIND_COLORS.function })
      })

      it('should use DEFAULT_COLOR for unknown kind not in KIND_COLORS', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['myMethod'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('method')

        const editor = createMockEditor(["import { myMethod } from 'mod'"])
        await service.applyImportDecorations(editor)

        // 'method' is not in KIND_COLORS, so DEFAULT_COLOR is used
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: DEFAULT_COLOR })
      })

      it('should group symbols with same color into a single setDecorations call', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['ClassA', 'ClassB'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('class')

        const editor = createMockEditor(["import { ClassA, ClassB } from 'mod'"])
        await service.applyImportDecorations(editor)

        const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
        const applyCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length === 2)
        expect(applyCall).toBeDefined()
      })

      it('should create separate setDecorations calls for different colors', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn', 'MyClass'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockImplementation(async (_doc, pos) => {
          // myFn at char 9, MyClass at char 15
          return pos.character < 14 ? 'function' : 'class'
        })

        const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
        await service.applyImportDecorations(editor)

        const setDecorationsCalls = vi
          .mocked(editor.setDecorations)
          .mock.calls.filter((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(setDecorationsCalls.length).toBe(2)
      })
    })

    describe('caching', () => {
      it('should store resolved kinds in documentCaches', async () => {
        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        const cached = internals(service).documentCaches.get(editor.document.uri.toString())
        expect(cached).toBeDefined()
        expect(cached!.symbolKinds.get('useState')).toBe('function')
      })

      it('should reuse cache when importSectionText is unchanged', async () => {
        const importLine = "import { useState } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importLine,
          symbolKinds: new Map([['useState', 'function']]),
        })

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
        const spy = vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken')

        const editor = createMockEditor([importLine])
        await service.applyImportDecorations(editor)

        expect(spy).not.toHaveBeenCalled()
        expect(internals(service).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[cache] full hit'))
      })

      it('should invalidate cache when importSectionText changes', async () => {
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: "import { useState } from 'react'",
          symbolKinds: new Map([['useState', 'function']]),
        })

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useEffect'], importEndLine: 1 })
        const spy = vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

        const editor = createMockEditor(["import { useEffect } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(spy).toHaveBeenCalled()
      })

      it('should resolve only uncached symbols on partial cache hit', async () => {
        const importText = "import { useState, useEffect } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importText,
          symbolKinds: new Map([['useState', 'function']]),
        })

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
        const spy = vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

        // Only useEffect should be resolved, not useState
        expect(spy).toHaveBeenCalledTimes(1)
        expect(internals(service).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('resolving 1/2'))
      })

      it('should update cache after resolving new symbols', async () => {
        const importText = "import { useState, useEffect } from 'react'"
        const docUri = 'file:///test.ts'

        internals(service).documentCaches.set(docUri, {
          importSectionText: importText,
          symbolKinds: new Map([['useState', 'function']]),
        })

        vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
        vi.spyOn(internals(service).symbolResolver, 'resolveBySemanticToken').mockResolvedValue('function')

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

        const cached = internals(service).documentCaches.get(docUri)
        expect(cached!.symbolKinds.get('useState')).toBe('function')
        expect(cached!.symbolKinds.get('useEffect')).toBe('function')
      })
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

    it('should dispose the output channel', () => {
      service.dispose()

      expect(internals(service).output.dispose).toHaveBeenCalledOnce()
    })

    it('should handle empty state gracefully', () => {
      expect(() => service.dispose()).not.toThrow()
      expect(internals(service).decorationTypes.size).toBe(0)
      expect(internals(service).documentCaches.size).toBe(0)
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
