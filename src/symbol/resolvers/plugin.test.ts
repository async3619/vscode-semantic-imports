import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { PluginSymbolResolver } from './plugin'
import { SymbolKind } from '../types'
import { TAG_NAME } from '../../tsPlugin/protocol'

type ResolverInternals = {
  output: vscode.OutputChannel
}

function internals(resolver: PluginSymbolResolver) {
  return resolver as unknown as ResolverInternals
}

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

function mockPluginResolution(options: {
  definitions?: vscode.Location[] | null
  quickinfo?: {
    body?: {
      kind: string
      kindModifiers: string
      displayString: string
      tags?: { name: string; text?: string }[]
    }
  } | null
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

describe('PluginSymbolResolver', () => {
  let resolver: PluginSymbolResolver

  beforeEach(() => {
    resolver = new PluginSymbolResolver(vscode.window.createOutputChannel('test'))
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

  it('should return undefined when plugin tag is not present (plugin not loaded)', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: { body: { kind: 'const', kindModifiers: '', displayString: '', tags: [] } },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when quickinfo has no body', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {},
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when quickinfo has no tags', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: { body: { kind: 'const', kindModifiers: '', displayString: '' } },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return Function when plugin tag indicates isFunction=true', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'const',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: true }) }],
        },
      },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should return Variable when plugin tag indicates isFunction=false and kind is const', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'const',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: false }) }],
        },
      },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Variable)
  })

  it('should return correct kind when plugin tag indicates isFunction=false and kind is class', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'class',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: false }) }],
        },
      },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Class)
  })

  it('should return Function for type alias resolving to function', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'const',
          kindModifiers: '',
          displayString: 'const handler: MyCallback',
          tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: true }) }],
        },
      },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Function)
  })

  it('should call tsserverRequest with 1-based definition position', async () => {
    mockPluginResolution({
      definitions: [createMockLocation('file:///def.ts', 5, 4, 10)],
      quickinfo: {
        body: {
          kind: 'function',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: true }) }],
        },
      },
    })

    await resolver.resolve(createMockDocument(), createMockPosition())

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.tsserverRequest', 'quickinfo', {
      file: '/def.ts',
      line: 6,
      offset: 5,
    })
  })

  it('should return undefined when definition target is not a file URI', async () => {
    mockPluginResolution({
      definitions: [createMockLocation('git:///def.ts')],
      quickinfo: null,
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })

  it('should return undefined when tag text is invalid JSON', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'const',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME, text: 'not-json' }],
        },
      },
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
        return {
          body: {
            kind: 'interface',
            kindModifiers: '',
            displayString: '',
            tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: false }) }],
          },
        }
      }
      return null
    })

    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Interface)
  })

  it('should return Variable when kind is unrecognized and isFunction is false', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'alias',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: false }) }],
        },
      },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBe(SymbolKind.Variable)
  })

  it('should log plugin resolution to output channel', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'const',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME, text: JSON.stringify({ isFunction: true }) }],
        },
      },
    })

    await resolver.resolve(createMockDocument(), createMockPosition(3, 7))

    expect(internals(resolver).output.appendLine).toHaveBeenCalledWith(expect.stringContaining('[plugin] 3:7'))
  })

  it('should return undefined when tag has no text', async () => {
    mockPluginResolution({
      definitions: [createMockLocation()],
      quickinfo: {
        body: {
          kind: 'const',
          kindModifiers: '',
          displayString: '',
          tags: [{ name: TAG_NAME }],
        },
      },
    })
    const result = await resolver.resolve(createMockDocument(), createMockPosition())
    expect(result).toBeUndefined()
  })
})
