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
    vi.useRealTimers()
  })

  describe('waitForReady', () => {
    it('should return true immediately when tsserver is ready on first check', async () => {
      mockProbeResponse({
        definitions: [createMockLocation()],
        quickinfo: { body: { kind: 'function' } },
      })

      const controller = new AbortController()
      const result = await probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      expect(result).toBe(true)
      expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2)
    })

    it('should return false when definitions are empty', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

      const controller = new AbortController()
      const promise = probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      // First check returns not-ready, then polling starts with intervals
      // Advance through all probe attempts
      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(false)
    })

    it('should return false when quickinfo returns empty body', async () => {
      mockProbeResponse({
        definitions: [createMockLocation()],
        quickinfo: {},
      })

      const controller = new AbortController()
      const promise = probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(false)
    })

    it('should return false when quickinfo throws error', async () => {
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'vscode.executeDefinitionProvider') {
          return [createMockLocation()]
        }
        if (command === 'typescript.tsserverRequest') {
          throw new Error('No Project')
        }
        return null
      })

      const controller = new AbortController()
      const promise = probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(false)
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

      const controller = new AbortController()
      const promise = probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      // Advance through 3 poll intervals (attempts 2, 3, 4)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)

      const result = await promise
      expect(result).toBe(true)
    })

    it('should return false when signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const result = await probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      expect(result).toBe(false)
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled()
    })

    it('should return false when signal is aborted during polling', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])

      const controller = new AbortController()
      const promise = probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      // Let first check fail, then abort during delay
      await vi.advanceTimersByTimeAsync(250)
      controller.abort()
      await vi.advanceTimersByTimeAsync(250)

      const result = await promise
      expect(result).toBe(false)
    })

    it('should return true when definitions target has non-file URI', async () => {
      mockProbeResponse({
        definitions: [createMockLocation('git:///def.ts')],
        quickinfo: null,
      })

      const controller = new AbortController()
      const result = await probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

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

      const controller = new AbortController()
      const result = await probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

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

      const controller = new AbortController()
      await probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.tsserverRequest', 'quickinfo', {
        file: '/def.ts',
        line: 6,
        offset: 5,
      })
    })

    it('should return false when definitions provider returns null', async () => {
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)

      const controller = new AbortController()
      const promise = probe.waitForReady(createMockDocument(), createMockPosition(), controller.signal)

      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(500)
      }

      const result = await promise
      expect(result).toBe(false)
    })
  })
})
