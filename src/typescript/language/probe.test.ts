import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { TypeScriptServerProbe } from './probe'
import type { TypeScriptLanguageService, DefinitionResult } from './languageService'

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

describe('TypeScriptServerProbe', () => {
  let probe: TypeScriptServerProbe
  let languageService: TypeScriptLanguageService

  beforeEach(() => {
    vi.useFakeTimers()
    languageService = createMockLanguageService()
    probe = new TypeScriptServerProbe(languageService)
  })

  afterEach(() => {
    probe.dispose()
    vi.useRealTimers()
  })

  describe('waitForReady', () => {
    it('should return true immediately when tsserver is ready on first check', async () => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
      vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
        kind: 'function',
        kindModifiers: '',
        displayString: '',
      })

      const result = await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(result).toBe(true)
      expect(languageService.getDefinition).toHaveBeenCalledTimes(1)
      expect(languageService.requestQuickInfo).toHaveBeenCalledTimes(1)
    })

    it('should return true (proceed) when definitions are empty after all attempts', async () => {
      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      // Advance through all probe attempts (10000ms / 500ms = 20 attempts)
      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      // Timeout = proceed anyway (true), not false
      expect(result).toBe(true)
    })

    it('should return true (proceed) when quickinfo returns undefined', async () => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(true)
    })

    it('should return true (proceed) when quickinfo throws error', async () => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
      vi.mocked(languageService.requestQuickInfo).mockRejectedValue(new Error('No Project'))

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(true)
    })

    it('should poll and return true when tsserver becomes ready after several attempts', async () => {
      let attempt = 0
      vi.mocked(languageService.getDefinition).mockImplementation(async () => {
        attempt++
        // Return null on first 3 attempts, then return definition
        if (attempt <= 3) {
          return null
        }
        return createDefinitionResult()
      })
      vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
        kind: 'function',
        kindModifiers: '',
        displayString: '',
      })

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      // Advance through 3 poll intervals (attempts 2, 3, 4)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)

      const result = await promise
      expect(result).toBe(true)
    })

    it('should return false when cancelled via cancel()', async () => {
      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      // Let first check fail, then cancel during delay
      await vi.advanceTimersByTimeAsync(250)
      probe.cancel('test-key')
      await vi.advanceTimersByTimeAsync(250)

      const result = await promise
      expect(result).toBe(false)
    })

    it('should auto-cancel previous call when called again with same key', async () => {
      const firstPromise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())
      await vi.advanceTimersByTimeAsync(0)

      // Second call with same key should cancel the first
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())
      vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
        kind: 'function',
        kindModifiers: '',
        displayString: '',
      })
      const secondPromise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      await vi.advanceTimersByTimeAsync(500)

      const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise])
      expect(firstResult).toBe(false) // cancelled
      expect(secondResult).toBe(true) // proceeded
    })

    it('should return true when definitions target has non-file URI', async () => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('git:///def.ts'))

      const result = await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(result).toBe(true)
      // Should not call quickinfo for non-file URIs
      expect(languageService.requestQuickInfo).not.toHaveBeenCalled()
    })

    it('should call requestQuickInfo with 1-based position from definition target', async () => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult('file:///def.ts', 5, 4, 10))
      vi.mocked(languageService.requestQuickInfo).mockResolvedValue({
        kind: 'function',
        kindModifiers: '',
        displayString: '',
      })

      await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(languageService.requestQuickInfo).toHaveBeenCalledWith('/def.ts', 6, 5)
    })

    it('should return true (proceed) when definitions provider returns null', async () => {
      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(true)
    })

    it('should use custom timeout option', async () => {
      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 1_000 })

      // 1000ms / 500ms = 2 max attempts, so only 1 poll needed
      await vi.advanceTimersByTimeAsync(500)

      const result = await promise
      expect(result).toBe(true)
    })

    it.each([
      ['file:///node_modules/pkg/index.js', '.js'],
      ['file:///node_modules/pkg/index.mjs', '.mjs'],
      ['file:///node_modules/pkg/index.cjs', '.cjs'],
    ])('should return true immediately for JS target %s without calling quickinfo', async (uri) => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult(uri))

      const result = await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(result).toBe(true)
      expect(languageService.requestQuickInfo).not.toHaveBeenCalled()
    })

    it('should clean up controllers on dispose', () => {
      // Start a probe that will be pending
      probe.waitForReady('key-a', createMockDocument(), createMockPosition())

      probe.dispose()

      // Starting a new probe after dispose should work fine
      expect(() => probe.waitForReady('key-b', createMockDocument(), createMockPosition())).not.toThrow()
    })
  })
})
