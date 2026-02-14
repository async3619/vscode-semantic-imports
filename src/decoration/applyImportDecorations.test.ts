import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { decorationTypes, documentCaches, output } from './state'
import { DEFAULT_COLOR, KIND_COLORS } from './constants'

vi.mock('../importParser', () => ({
  parseImports: vi.fn(),
}))

vi.mock('./resolveSymbolKind', () => ({
  resolveSymbolKind: vi.fn(),
}))

import { parseImports } from '../importParser'
import { resolveSymbolKind } from './resolveSymbolKind'
import { applyImportDecorations } from './applyImportDecorations'

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

describe('applyImportDecorations', () => {
  beforeEach(() => {
    decorationTypes.clear()
    documentCaches.clear()
    vi.mocked(parseImports).mockReset()
    vi.mocked(resolveSymbolKind).mockReset()
    vi.mocked(output.appendLine).mockClear()
    vi.mocked(vscode.window.createTextEditorDecorationType).mockClear()
  })

  describe('basic flow', () => {
    it('should clear existing decorations before applying new ones', async () => {
      const disposeFn = vi.fn()
      const existingType = { key: 'existing', dispose: disposeFn } as unknown as vscode.TextEditorDecorationType
      decorationTypes.set('#ff0000', existingType)

      vi.mocked(parseImports).mockReturnValue({ symbols: [], importEndLine: 0 })

      const editor = createMockEditor([])
      await applyImportDecorations(editor)

      expect(vi.mocked(editor.setDecorations)).toHaveBeenCalledWith(existingType, [])
    })

    it('should return early if no symbols are found', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: [], importEndLine: 0 })

      const editor = createMockEditor([])
      await applyImportDecorations(editor)

      expect(resolveSymbolKind).not.toHaveBeenCalled()
    })

    it('should find symbol occurrences and apply decorations', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor(["import { useState } from 'react'"])
      await applyImportDecorations(editor)

      expect(vi.mocked(editor.setDecorations)).toHaveBeenCalledWith(
        expect.objectContaining({ dispose: expect.any(Function) }),
        [expect.objectContaining({ start: expect.objectContaining({ line: 0, character: 9 }) })],
      )
    })
  })

  describe('symbol occurrence regex', () => {
    it('should exclude the module specifier part after from', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['react', 'useState'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor(["import { useState } from 'react'"])
      await applyImportDecorations(editor)

      // Only 'useState' should be found as occurrence (react is after `from`)
      expect(vi.mocked(resolveSymbolKind)).toHaveBeenCalledTimes(1)
    })

    it('should escape special regex characters in symbol names without throwing', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['$special'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('const')

      const editor = createMockEditor(["import { $special } from 'mod'"])

      // Should not throw a regex syntax error due to unescaped $
      await expect(applyImportDecorations(editor)).resolves.toBeUndefined()
    })

    it('should find same symbol on multiple lines', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['Foo'], importEndLine: 2 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('class')

      const editor = createMockEditor(["import { Foo } from 'a'", "import { Foo } from 'b'"])
      await applyImportDecorations(editor)

      // Should find Foo on both lines
      const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
      const decorationCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length > 0)
      expect(decorationCall).toBeDefined()
      expect(decorationCall![1]).toHaveLength(2)
    })

    it('should use word boundary matching', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['use'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor(["import { use, useState } from 'react'"])
      await applyImportDecorations(editor)

      // Only 'use' should match, not 'use' within 'useState'
      const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
      const decorationCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length > 0)
      expect(decorationCall).toBeDefined()
      expect(decorationCall![1]).toHaveLength(1)
    })
  })

  describe('symbol kind resolution', () => {
    it('should call resolveSymbolKind for each unique symbol', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor(["import { useState, useEffect } from 'react'"])
      await applyImportDecorations(editor)

      expect(resolveSymbolKind).toHaveBeenCalledTimes(2)
    })

    it('should use DEFAULT_COLOR when resolveSymbolKind returns undefined', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['unknown'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue(undefined)

      const editor = createMockEditor(["import { unknown } from 'mod'"])
      await applyImportDecorations(editor)

      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: DEFAULT_COLOR })
    })

    it('should use DEFAULT_COLOR when resolveSymbolKind throws', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['failing'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockRejectedValue(new Error('hover failed'))

      const editor = createMockEditor(["import { failing } from 'mod'"])
      await applyImportDecorations(editor)

      // Should not throw, and should apply default color
      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: DEFAULT_COLOR })
    })
  })

  describe('color mapping', () => {
    it('should map function kind to KIND_COLORS.function', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor(["import { myFn } from 'mod'"])
      await applyImportDecorations(editor)

      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: KIND_COLORS.function })
    })

    it('should use DEFAULT_COLOR for unknown kind not in KIND_COLORS', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['myVar'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('var')

      const editor = createMockEditor(["import { myVar } from 'mod'"])
      await applyImportDecorations(editor)

      // 'var' is not in KIND_COLORS, so DEFAULT_COLOR is used
      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: DEFAULT_COLOR })
    })

    it('should group symbols with same color into a single setDecorations call', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['ClassA', 'ClassB'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('class')

      const editor = createMockEditor(["import { ClassA, ClassB } from 'mod'"])
      await applyImportDecorations(editor)

      const setDecorationsCalls = vi.mocked(editor.setDecorations).mock.calls
      const applyCall = setDecorationsCalls.find((call) => Array.isArray(call[1]) && call[1].length === 2)
      expect(applyCall).toBeDefined()
    })

    it('should create separate setDecorations calls for different colors', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['myFn', 'MyClass'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockImplementation(async (_doc, pos) => {
        // myFn at char 9, MyClass at char 15
        return pos.character < 14 ? 'function' : 'class'
      })

      const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
      await applyImportDecorations(editor)

      const setDecorationsCalls = vi
        .mocked(editor.setDecorations)
        .mock.calls.filter((call) => Array.isArray(call[1]) && call[1].length > 0)
      expect(setDecorationsCalls.length).toBe(2)
    })
  })

  describe('caching', () => {
    it('should store resolved kinds in documentCaches', async () => {
      vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor(["import { useState } from 'react'"])
      await applyImportDecorations(editor)

      const cached = documentCaches.get(editor.document.uri.toString())
      expect(cached).toBeDefined()
      expect(cached!.symbolKinds.get('useState')).toBe('function')
    })

    it('should reuse cache when importSectionText is unchanged', async () => {
      const importLine = "import { useState } from 'react'"
      const docUri = 'file:///test.ts'

      documentCaches.set(docUri, {
        importSectionText: importLine,
        symbolKinds: new Map([['useState', 'function']]),
      })

      vi.mocked(parseImports).mockReturnValue({ symbols: ['useState'], importEndLine: 1 })

      const editor = createMockEditor([importLine])
      await applyImportDecorations(editor)

      expect(resolveSymbolKind).not.toHaveBeenCalled()
      expect(output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[cache] full hit'))
    })

    it('should invalidate cache when importSectionText changes', async () => {
      const docUri = 'file:///test.ts'

      documentCaches.set(docUri, {
        importSectionText: "import { useState } from 'react'",
        symbolKinds: new Map([['useState', 'function']]),
      })

      vi.mocked(parseImports).mockReturnValue({ symbols: ['useEffect'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor(["import { useEffect } from 'react'"])
      await applyImportDecorations(editor)

      expect(resolveSymbolKind).toHaveBeenCalled()
    })

    it('should resolve only uncached symbols on partial cache hit', async () => {
      const importText = "import { useState, useEffect } from 'react'"
      const docUri = 'file:///test.ts'

      documentCaches.set(docUri, {
        importSectionText: importText,
        symbolKinds: new Map([['useState', 'function']]),
      })

      vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor([importText])
      await applyImportDecorations(editor)

      // Only useEffect should be resolved, not useState
      expect(resolveSymbolKind).toHaveBeenCalledTimes(1)
      expect(output.appendLine).toHaveBeenCalledWith(expect.stringContaining('resolving 1/2'))
    })

    it('should update cache after resolving new symbols', async () => {
      const importText = "import { useState, useEffect } from 'react'"
      const docUri = 'file:///test.ts'

      documentCaches.set(docUri, {
        importSectionText: importText,
        symbolKinds: new Map([['useState', 'function']]),
      })

      vi.mocked(parseImports).mockReturnValue({ symbols: ['useState', 'useEffect'], importEndLine: 1 })
      vi.mocked(resolveSymbolKind).mockResolvedValue('function')

      const editor = createMockEditor([importText])
      await applyImportDecorations(editor)

      const cached = documentCaches.get(docUri)
      expect(cached!.symbolKinds.get('useState')).toBe('function')
      expect(cached!.symbolKinds.get('useEffect')).toBe('function')
    })
  })
})
