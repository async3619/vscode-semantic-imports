import * as vscode from 'vscode'

type Severity = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

function formatTimestamp(date: Date) {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${y}-${mo}-${d} ${h}:${mi}:${s}.${ms}`
}

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
  private static output: vscode.OutputChannel | undefined

  private static ensureOutput() {
    Logger.output ??= vscode.window.createOutputChannel('Semantic Imports')
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
    this.log('INFO', args)
  }

  warn(...args: unknown[]) {
    this.log('WARN', args)
  }

  error(...args: unknown[]) {
    this.log('ERROR', args)
  }

  debug(...args: unknown[]) {
    this.log('DEBUG', args)
  }

  private log(severity: Severity, args: unknown[]) {
    const output = Logger.ensureOutput()
    const timestamp = formatTimestamp(new Date())
    output.appendLine(`[${timestamp}][${this.tag}][${severity}] ${args.map(formatArg).join(' ')}`)
  }
}
