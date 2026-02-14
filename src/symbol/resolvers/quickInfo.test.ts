import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { QuickInfoSymbolResolver } from './quickInfo'
import { SymbolKind } from '../types'

type ResolverInternals = {
  output: vscode.OutputChannel
}

function internals(resolver: QuickInfoSymbolResolver): ResolverInternals {
  return resolver as unknown as ResolverInternals
}

function createMockDocument(uri = 'file:///test.ts'): vscode.TextDocument {
  return { uri: vscode.Uri.parse(uri) } as unknown as vscode.TextDocument
}

function createMockPosition(line = 0, character = 0): vscode.Position {
  return new vscode.Position(line, character)
}

function createMockLocation(uri = 'file:///def.ts', line = 0, character = 0, endCharacter = 3): vscode.Location {
  return {
    uri: vscode.Uri.parse(uri),
    range: new vscode.Range(new vscode.Position(line, character), new vscode.Position(line, endCharacter)),
  } as vscode.Location
}

function mockQuickInfoResolution(options: {
  definitions?: vscode.Location[] | null
  quickinfo?: { body?: { kind: string; kindModifiers: string; displayString: string } } | null
}): void {
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

describe('QuickInfoSymbolResolver', () => {
  let resolver: QuickInfoSymbolResolver

  beforeEach(() => {
    resolver = new QuickInfoSymbolResolver(vscode.window.createOutputChannel('test'))
    vi.mocked(vscode.commands.executeCommand).mockReset()
  })

  it('should return undefined when definition provider returns null', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(null)
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when definition provider returns empty array', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([])
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return kind from quickinfo at definition site', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation('file:///def.ts', 5, 0, 3)],
      quickinfo: { body: { kind: 'function', kindModifiers: '', displayString: 'function foo(): void' } },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should return class kind from definition site', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation('file:///def.ts', 10, 0, 8)],
      quickinfo: { body: { kind: 'class', kindModifiers: '', displayString: 'class Foo' } },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Class)
  })

  it('should call tsserverRequest with 1-based definition position', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
      quickinfo: { body: { kind: 'function', kindModifiers: '', displayString: '' } },
    })

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.tsserverRequest', 'quickinfo', {
      file: '/def.ts',
      line: 6,
      offset: 5,
    })
  })

  it('should return undefined when quickinfo has no body', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation()],
      quickinfo: {},
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when quickinfo kind is empty string', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation()],
      quickinfo: { body: { kind: '', kindModifiers: '', displayString: '' } },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when quickinfo kind is not a recognized SymbolKind', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation()],
      quickinfo: { body: { kind: 'method', kindModifiers: '', displayString: '' } },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
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
        return { body: { kind: 'interface', kindModifiers: '', displayString: 'interface IFoo' } }
      }
      return null
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Interface)
  })

  it('should return undefined when definition target is not a file URI', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation('git:///def.ts', 0, 0, 3)],
      quickinfo: { body: { kind: 'function', kindModifiers: '', displayString: '' } },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should log definition and kind to output channel', async () => {
    mockQuickInfoResolution({
      definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
      quickinfo: { body: { kind: 'enum', kindModifiers: '', displayString: 'enum Direction' } },
    })

    await resolver.resolve(createMockDocument(), createMockPosition(3, 7))

    expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[quickinfo] 3:7'))
    expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('enum'))
  })
})
