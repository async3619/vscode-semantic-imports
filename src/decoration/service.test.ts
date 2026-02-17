import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { DecorationService } from './service'
import type { SymbolResolverFactory } from './service'
import { SymbolResolver } from './resolver'
import type { DocumentCache } from './types'
import { SymbolKind, TypeScriptServerNotLoadedError } from '@/symbol'
import { HoverSymbolResolver, PluginSymbolResolver, SemanticTokenSymbolResolver } from '@/symbol'
import type { SymbolColorMap } from '@/theme'
import { TypeScriptLanguageService, TypeScriptServerProbe } from '@/typescript/language'
import type { ImportStatement } from '@/parser'
import { TypeScriptParser } from '@/parser'

type ServiceInternals = {
  languageService: TypeScriptLanguageService
  probe: TypeScriptServerProbe
  parser: TypeScriptParser
  decorationTypes: Map<string, vscode.TextEditorDecorationType>
  documentCaches: Map<string, DocumentCache>
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

function createService(colors: SymbolColorMap = TEST_COLORS) {
  const languageService = new TypeScriptLanguageService()
  const probe = new TypeScriptServerProbe(languageService)
  const parser = new TypeScriptParser()
  const factory: SymbolResolverFactory = (doc, targets, ls) => new SymbolResolver(doc, targets, ls)
  const service = new DecorationService(languageService, probe, parser, factory)
  service.setColors(colors)
  return { service, languageService, probe, parser }
}

function mockProbe(probe: TypeScriptServerProbe) {
  vi.spyOn(probe, 'waitForReady').mockResolvedValue(true)
  vi.spyOn(probe, 'cancel')
  vi.spyOn(probe, 'dispose')
  return probe
}

type ResolveMethod = (document: vscode.TextDocument, position: vscode.Position) => Promise<SymbolKind | undefined>

function spyResolve(prototype: { resolve: ResolveMethod }) {
  return vi.spyOn(prototype as { resolve: ResolveMethod }, 'resolve')
}

function stubAllResolvers() {
  spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(undefined)
  spyResolve(HoverSymbolResolver.prototype).mockResolvedValue(undefined)
  spyResolve(SemanticTokenSymbolResolver.prototype).mockResolvedValue(undefined)
}

describe('DecorationService', () => {
  let service: DecorationService
  let probe: TypeScriptServerProbe

  beforeEach(() => {
    vi.useFakeTimers()
    const created = createService()
    service = created.service
    probe = mockProbe(created.probe)
    vi.mocked(vscode.window.createTextEditorDecorationType).mockClear()

    stubAllResolvers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

        expect(probe.waitForReady).not.toHaveBeenCalled()
      })

      it('should find symbol occurrences and apply decorations', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(vi.mocked(editor.setDecorations)).toHaveBeenCalledWith(
          expect.objectContaining({ dispose: expect.any(Function) }),
          [expect.objectContaining({ start: expect.objectContaining({ line: 0, character: 9 }) })],
        )
      })
    })

    describe('symbol occurrences', () => {
      it('should decorate multiple symbols with the same color', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'Foo', source: 'a', startLine: 0, startColumn: 9, endLine: 0, endColumn: 12 }),
          stmt({ localName: 'Bar', source: 'b', startLine: 1, startColumn: 9, endLine: 1, endColumn: 12 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Class)

        const editor = createMockEditor(["import { Foo } from 'a'", "import { Bar } from 'b'"])
        await service.applyImportDecorations(editor)

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
        const spy = spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

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
        spyResolve(PluginSymbolResolver.prototype).mockImplementation(async () => {
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
        spyResolve(PluginSymbolResolver.prototype).mockRejectedValue(new Error('resolution failed'))

        const editor = createMockEditor(["import { failing } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })

      it('should retry symbols that fail with TypeScriptServerNotLoadedError', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'clsx', source: 'clsx', startLine: 0, startColumn: 7, endLine: 0, endColumn: 11 }),
        ])
        const spy = spyResolve(PluginSymbolResolver.prototype)
          .mockRejectedValueOnce(new TypeScriptServerNotLoadedError())
          .mockResolvedValueOnce(SymbolKind.Function)

        const editor = createMockEditor(["import clsx from 'clsx'"])
        const promise = service.applyImportDecorations(editor)
        await vi.advanceTimersByTimeAsync(500)
        await promise

        expect(spy).toHaveBeenCalledTimes(2)
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Function],
        })
      })

      it('should give up retrying after max retry attempts', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'clsx', source: 'clsx', startLine: 0, startColumn: 7, endLine: 0, endColumn: 11 }),
        ])
        const spy = spyResolve(PluginSymbolResolver.prototype).mockRejectedValue(new TypeScriptServerNotLoadedError())

        const editor = createMockEditor(["import clsx from 'clsx'"])
        const promise = service.applyImportDecorations(editor)
        await vi.advanceTimersByTimeAsync(3000)
        await promise

        // 1 initial + 5 retries = 6 calls
        expect(spy).toHaveBeenCalledTimes(6)
        expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled()
      })

      it('should preserve earlier resolver result when later resolver also resolves', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'mySymbol', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)
        spyResolve(HoverSymbolResolver.prototype).mockResolvedValue(SymbolKind.Class)

        const editor = createMockEditor(["import { mySymbol } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Function],
        })
      })

      it('should use semanticToken as fallback only when hover returns undefined', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'resolved', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'unresolved', startLine: 0, startColumn: 19, endLine: 0, endColumn: 29 }),
        ])
        spyResolve(HoverSymbolResolver.prototype).mockImplementation(async (_doc, pos) => {
          return pos.character === 9 ? SymbolKind.Function : undefined
        })
        spyResolve(SemanticTokenSymbolResolver.prototype).mockResolvedValue(SymbolKind.Variable)

        const editor = createMockEditor(["import { resolved, unresolved } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(SemanticTokenSymbolResolver.prototype.resolve).toHaveBeenCalledTimes(1)
      })
    })

    describe('color mapping', () => {
      it('should map function kind to the injected function color', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

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
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Class)

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
        spyResolve(PluginSymbolResolver.prototype).mockImplementation(async (_doc, pos) => {
          return pos.character < 14 ? SymbolKind.Function : SymbolKind.Class
        })

        const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Function],
        })
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: TEST_COLORS[SymbolKind.Class],
        })
      })

      it('should skip symbols whose kind has no color in the map', async () => {
        const partialColors: SymbolColorMap = { [SymbolKind.Function]: '#DCDCAA' }
        const created = createService(partialColors)
        service = created.service
        mockProbe(created.probe)

        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
          stmt({ localName: 'MyClass', startLine: 0, startColumn: 15, endLine: 0, endColumn: 22 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockImplementation(async (_doc, pos) => {
          return pos.character < 14 ? SymbolKind.Function : SymbolKind.Class
        })

        const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(1)
        expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({
          color: '#DCDCAA',
        })
      })

      it('should not apply any decorations when colors map is empty', async () => {
        const created = createService({})
        service = created.service
        mockProbe(created.probe)

        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

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
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

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
        const spy = spyResolve(PluginSymbolResolver.prototype)

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
        const spy = spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

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
        const spy = spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

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

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

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
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor([importText])
        await service.applyImportDecorations(editor)

        const cached = internals(service).documentCaches.get(docUri)
        expect(cached!.symbolKinds.get('useState')).toBe(SymbolKind.Function)
        expect(cached!.symbolKinds.get('useEffect')).toBe(SymbolKind.Function)
      })
    })

    describe('tsserver probe', () => {
      it('should call probe.waitForReady before resolver pipeline when symbols need resolving', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(probe.waitForReady).toHaveBeenCalledOnce()
        expect(probe.waitForReady).toHaveBeenCalledWith(
          editor.document.uri.toString(),
          editor.document,
          expect.objectContaining({ line: 0, character: 9 }),
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

        expect(probe.waitForReady).not.toHaveBeenCalled()
      })

      it('should cancel previous probe when new decoration request arrives', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])

        await service.applyImportDecorations(editor)
        await service.applyImportDecorations(editor)

        expect(probe.cancel).toHaveBeenCalledWith(editor.document.uri.toString())
      })

      it('should return early when probe returns false (cancelled)', async () => {
        vi.mocked(probe.waitForReady).mockResolvedValue(false)

        mockParserReturn(service, [
          stmt({ localName: 'useState', source: 'react', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
        ])
        const spy = spyResolve(PluginSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)

        const editor = createMockEditor(["import { useState } from 'react'"])
        await service.applyImportDecorations(editor)

        expect(spy).not.toHaveBeenCalled()
      })

      it('should call probe.dispose on service dispose', () => {
        service.dispose()

        expect(probe.dispose).toHaveBeenCalledOnce()
      })
    })

    describe('progressive enhancement', () => {
      it('should apply decorations progressively as phases complete', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
          stmt({ localName: 'MyClass', startLine: 0, startColumn: 15, endLine: 0, endColumn: 22 }),
        ])

        spyResolve(PluginSymbolResolver.prototype).mockImplementation(async (_doc, pos) => {
          return pos.character === 9 ? SymbolKind.Function : undefined
        })

        let resolveHover!: (value: SymbolKind | undefined) => void
        const hoverPromise = new Promise<SymbolKind | undefined>((resolve) => {
          resolveHover = resolve
        })
        spyResolve(HoverSymbolResolver.prototype).mockImplementation(async () => hoverPromise)

        const editor = createMockEditor(["import { myFn, MyClass } from 'mod'"])
        const applyPromise = service.applyImportDecorations(editor)

        await vi.advanceTimersByTimeAsync(0)

        const callsBefore = vi.mocked(editor.setDecorations).mock.calls
        const decoratedBefore = callsBefore.filter((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decoratedBefore.length).toBeGreaterThanOrEqual(1)

        resolveHover(SymbolKind.Class)
        await applyPromise

        const callsAfter = vi.mocked(editor.setDecorations).mock.calls
        const decoratedAfter = callsAfter.filter((call) => Array.isArray(call[1]) && call[1].length > 0)
        expect(decoratedAfter.length).toBeGreaterThan(decoratedBefore.length)
      })

      it('should not call semanticToken for symbols already resolved by hover', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'myFn', startLine: 0, startColumn: 9, endLine: 0, endColumn: 13 }),
        ])
        spyResolve(HoverSymbolResolver.prototype).mockResolvedValue(SymbolKind.Function)
        const semanticSpy = spyResolve(SemanticTokenSymbolResolver.prototype)

        const editor = createMockEditor(["import { myFn } from 'mod'"])
        await service.applyImportDecorations(editor)

        expect(semanticSpy).not.toHaveBeenCalled()
      })

      it('should call semanticToken only for symbols unresolved after hover', async () => {
        mockParserReturn(service, [
          stmt({ localName: 'resolved', startLine: 0, startColumn: 9, endLine: 0, endColumn: 17 }),
          stmt({ localName: 'unresolved', startLine: 0, startColumn: 19, endLine: 0, endColumn: 29 }),
        ])
        spyResolve(HoverSymbolResolver.prototype).mockImplementation(async (_doc, pos) => {
          return pos.character === 9 ? SymbolKind.Function : undefined
        })
        const semanticSpy = vi
          .spyOn(SemanticTokenSymbolResolver.prototype, 'resolve')
          .mockResolvedValue(SymbolKind.Variable)

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
