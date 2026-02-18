import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import type { DefinitionResult, TypeScriptLanguageService } from './languageService'
import { TypeScriptServerProbe } from './probe'

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
    it('should return true immediately when definition is resolved on first check', async () => {
      vi.mocked(languageService.getDefinition).mockResolvedValue(createDefinitionResult())

      const result = await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(result).toBe(true)
      expect(languageService.getDefinition).toHaveBeenCalledTimes(1)
      expect(languageService.requestQuickInfo).not.toHaveBeenCalled()
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
      const secondPromise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      await vi.advanceTimersByTimeAsync(500)

      const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise])
      expect(firstResult).toBe(false) // cancelled
      expect(secondResult).toBe(true) // proceeded
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

    it('should clean up controllers on dispose', () => {
      // Start a probe that will be pending
      probe.waitForReady('key-a', createMockDocument(), createMockPosition())

      probe.dispose()

      // Starting a new probe after dispose should work fine
      expect(() => probe.waitForReady('key-b', createMockDocument(), createMockPosition())).not.toThrow()
    })
  })
})
