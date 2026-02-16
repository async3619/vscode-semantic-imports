import * as vscode from 'vscode'

function formatArg(arg: unknown) {
  if (arg === null || arg === undefined) {
    return String(arg)
  }
  if (arg instanceof Error) {
    return arg.stack ?? arg.message
  }
  if (typeof arg === 'object') {
    if (Array.isArray(arg) || arg.constructor === Object || !arg.constructor) {
      return JSON.stringify(arg)
    }
    return `${arg.constructor.name} {}`
  }
  return String(arg)
}

export class Logger {
  private static output: vscode.LogOutputChannel | undefined

  private static ensureOutput() {
    Logger.output ??= vscode.window.createOutputChannel('Semantic Imports', { log: true })
    return Logger.output
  }

  static dispose() {
    Logger.output?.dispose()
    Logger.output = undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static create<T extends (abstract new (...args: any[]) => any) | ((...args: any[]) => any)>(target: T) {
    return new Logger(target.name)
  }

  private constructor(private readonly tag: string) {}

  info(...args: unknown[]) {
    Logger.ensureOutput().info(`[${this.tag}]`, ...args.map(formatArg))
  }

  warn(...args: unknown[]) {
    Logger.ensureOutput().warn(`[${this.tag}]`, ...args.map(formatArg))
  }

  error(...args: unknown[]) {
    Logger.ensureOutput().error(`[${this.tag}]`, ...args.map(formatArg))
  }

  debug(...args: unknown[]) {
    Logger.ensureOutput().debug(`[${this.tag}]`, ...args.map(formatArg))
  }
}
