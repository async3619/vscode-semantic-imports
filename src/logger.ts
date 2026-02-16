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

  info(message: string) {
    this.log('INFO', message)
  }

  warn(message: string) {
    this.log('WARN', message)
  }

  error(message: string) {
    this.log('ERROR', message)
  }

  debug(message: string) {
    this.log('DEBUG', message)
  }

  private log(severity: Severity, message: string) {
    const output = Logger.ensureOutput()
    const timestamp = formatTimestamp(new Date())
    output.appendLine(`[${timestamp}][${this.tag}][${severity}] ${message}`)
  }
}
