import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { TypeScriptServerProbe } from './probe'

function createMockDocument(uri = 'file:///test.ts') {
  return { uri: vscode.Uri.parse(uri) } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0) {
  return new vscode.Position(line, character)
}

function createMockLocation(uri = 'file:///def.ts', line = 0, character = 0, endCharacter = 3) {
  return {
    uri: vscode.Uri.parse(uri),
    range: new vscode.Range(new vscode.Position(line, character), new vscode.Position(line, endCharacter)),
  } as vscode.Location
}

function mockProbeResponse(options: {
  definitions?: vscode.Location[] | null
  quickinfo?: { body?: { kind: string } } | null
}) {
  vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
    if (command === 'vscode.executeDefinitionProvider') {
      return options.definitions ?? null
    }
    if (command === 'typescript.tsserverRequest') {
      return options.quickinfo ?? null
    }
    return null
  })
}

describe('TypeScriptServerProbe', () => {
  let probe: TypeScriptServerProbe

  beforeEach(() => {
    vi.useFakeTimers()
    probe = new TypeScriptServerProbe()
    vi.mocked(vscode.commands.executeCommand).mockReset()
  })

  afterEach(() => {
    probe.dispose()
    vi.useRealTimers()
  })

  describe('waitForReady', () => {
    it('should return true immediately when tsserver is ready on first check', async () => {
      mockProbeResponse({
        definitions: [createMockLocation()],
        quickinfo: { body: { kind: 'function' } },
      })

      const result = await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(result).toBe(true)
      expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2)
    })

    it('should return true (proceed) when definitions are empty after all attempts', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      // Advance through all probe attempts (10000ms / 500ms = 20 attempts)
      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      // Timeout = proceed anyway (true), not false
      expect(result).toBe(true)
    })

    it('should return true (proceed) when quickinfo returns empty body', async () => {
      mockProbeResponse({
        definitions: [createMockLocation()],
        quickinfo: {},
      })

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(true)
    })

    it('should return true (proceed) when quickinfo throws error', async () => {
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') {
          return [createMockLocation()]
        }
        if (command === 'typescript.tsserverRequest') {
          throw new Error('No Project')
        }
        return null
      })

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(true)
    })

    it('should poll and return true when tsserver becomes ready after several attempts', async () => {
      let attempt = 0
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') {
          attempt++
          // Return empty on first 3 attempts, then return definitions
          if (attempt <= 3) {
            return []
          }
          return [createMockLocation()]
        }
        if (command === 'typescript.tsserverRequest') {
          return { body: { kind: 'function' } }
        }
        return null
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
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      // Let first check fail, then cancel during delay
      await vi.advanceTimersByTimeAsync(250)
      probe.cancel('test-key')
      await vi.advanceTimersByTimeAsync(250)

      const result = await promise
      expect(result).toBe(false)
    })

    it('should auto-cancel previous call when called again with same key', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

      const firstPromise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())
      await vi.advanceTimersByTimeAsync(0)

      // Second call with same key should cancel the first
      mockProbeResponse({
        definitions: [createMockLocation()],
        quickinfo: { body: { kind: 'function' } },
      })
      const secondPromise = probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      await vi.advanceTimersByTimeAsync(500)

      const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise])
      expect(firstResult).toBe(false) // cancelled
      expect(secondResult).toBe(true) // proceeded
    })

    it('should return true when definitions target has non-file URI', async () => {
      mockProbeResponse({
        definitions: [createMockLocation('git:///def.ts')],
        quickinfo: null,
      })

      const result = await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(result).toBe(true)
      // Should not call quickinfo for non-file URIs
      expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1)
    })

    it('should handle LocationLink with targetSelectionRange', async () => {
      const targetUri = vscode.Uri.parse('file:///linked.ts')
      const targetRange = new vscode.Range(new vscode.Position(10, 0), new vscode.Position(10, 20))
      const targetSelectionRange = new vscode.Range(new vscode.Position(10, 7), new vscode.Position(10, 12))

      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') {
          return [{ targetUri, targetRange, targetSelectionRange }]
        }
        if (command === 'typescript.tsserverRequest') {
          return { body: { kind: 'interface' } }
        }
        return null
      })

      const result = await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(result).toBe(true)
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.tsserverRequest', 'quickinfo', {
        file: '/linked.ts',
        line: 11,
        offset: 8,
      })
    })

    it('should call quickinfo with 1-based position from definition target', async () => {
      mockProbeResponse({
        definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
        quickinfo: { body: { kind: 'function' } },
      })

      await probe.waitForReady('test-key', createMockDocument(), createMockPosition())

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.tsserverRequest', 'quickinfo', {
        file: '/def.ts',
        line: 6,
        offset: 5,
      })
    })

    it('should return true (proceed) when definitions provider returns null', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 10_000 })

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(true)
    })

    it('should use custom timeout option', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

      const promise = probe.waitForReady('test-key', createMockDocument(), createMockPosition(), { timeout: 1_000 })

      // 1000ms / 500ms = 2 max attempts, so only 1 poll needed
      await vi.advanceTimersByTimeAsync(500)

      const result = await promise
      expect(result).toBe(true)
    })

    it('should clean up controllers on dispose', () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

      // Start a probe that will be pending
      probe.waitForReady('key-a', createMockDocument(), createMockPosition())

      probe.dispose()

      // Starting a new probe after dispose should work fine
      expect(() => probe.waitForReady('key-b', createMockDocument(), createMockPosition())).not.toThrow()
    })
  })
})
