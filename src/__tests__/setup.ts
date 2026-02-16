import { vi } from 'vitest'

class MockPosition {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

class MockRange {
  public readonly start: MockPosition
  public readonly end: MockPosition
  constructor(start: MockPosition, end: MockPosition) {
    this.start = start
    this.end = end
  }
}

class MockMarkdownString {
  constructor(public value: string = '') {}
}

class MockUri {
  public readonly fsPath: string

  constructor(
    public readonly scheme: string,
    public readonly path: string,
  ) {
    this.fsPath = path
  }

  toString() {
    return `${this.scheme}://${this.path}`
  }

  static file(path: string) {
    return new MockUri('file', path)
  }

  static parse(value: string) {
    const match = value.match(/^([a-z]+):\/\/(.*)$/)
    if (match) {
      return new MockUri(match[1], match[2])
    }
    return new MockUri('file', value)
  }

  static joinPath(base: MockUri, ...segments: string[]) {
    const basePath = base.path.endsWith('/') ? base.path.slice(0, -1) : base.path
    const joined = segments.reduce((acc, seg) => {
      if (seg.startsWith('./')) {
        seg = seg.slice(2)
      }
      return acc + '/' + seg
    }, basePath)
    return new MockUri(base.scheme, joined)
  }
}

vi.mock('vscode', () => ({
  Position: MockPosition,
  Range: MockRange,
  MarkdownString: MockMarkdownString,
  Uri: MockUri,
  window: {
    createTextEditorDecorationType: vi.fn((opts: { color: string }) => ({
      key: `decoration-${opts.color}`,
      dispose: vi.fn(),
    })),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    })),
    visibleTextEditors: [] as unknown[],
    activeTextEditor: undefined as unknown,
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeActiveColorTheme: vi.fn(() => ({ dispose: vi.fn() })),
  },
  workspace: {
    openTextDocument: vi.fn(async () => ({})),
    onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
    })),
    fs: {
      readFile: vi.fn(),
    },
  },
  extensions: {
    all: [] as unknown[],
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}))
