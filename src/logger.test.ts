import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { Logger } from './logger'

class TestClass {}
class ServiceA {}
class ServiceB {}

describe('Logger', () => {
  let appendLine: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-16T14:30:12.456Z'))
    appendLine = vi.fn()
    vi.mocked(vscode.window.createOutputChannel).mockClear()
    vi.mocked(vscode.window.createOutputChannel).mockReturnValue({
      appendLine,
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
      name: 'Semantic Imports',
      hide: vi.fn(),
      replace: vi.fn(),
    } as unknown as vscode.OutputChannel)
  })

  afterEach(() => {
    Logger.dispose()
    vi.useRealTimers()
  })

  describe('create', () => {
    it('should extract class name as tag', () => {
      const logger = Logger.create(TestClass)
      logger.info('hello')

      expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('[TestClass]'))
    })
  })

  describe('log format', () => {
    it('should format info log with timestamp, tag, and severity', () => {
      const logger = Logger.create(TestClass)
      logger.info('hello world')

      expect(appendLine).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]\[TestClass\]\[INFO\] hello world$/),
      )
    })

    it('should format warn log correctly', () => {
      const logger = Logger.create(TestClass)
      logger.warn('something is off')

      expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('[WARN] something is off'))
    })

    it('should format error log correctly', () => {
      const logger = Logger.create(TestClass)
      logger.error('failed')

      expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('[ERROR] failed'))
    })

    it('should format debug log correctly', () => {
      const logger = Logger.create(TestClass)
      logger.debug('details')

      expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] details'))
    })

    it('should include timestamp with millisecond precision', () => {
      const logger = Logger.create(TestClass)
      logger.info('test')

      const line = appendLine.mock.calls[0][0] as string
      expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/)
    })
  })

  describe('tag isolation', () => {
    it('should use different tags for different logger instances', () => {
      const logger1 = Logger.create(ServiceA)
      const logger2 = Logger.create(ServiceB)

      logger1.info('from A')
      logger2.info('from B')

      expect(appendLine.mock.calls[0][0]).toContain('[ServiceA]')
      expect(appendLine.mock.calls[1][0]).toContain('[ServiceB]')
    })
  })

  describe('output channel', () => {
    it('should create output channel lazily on first log call', () => {
      Logger.create(TestClass)
      expect(vscode.window.createOutputChannel).not.toHaveBeenCalled()

      const logger = Logger.create(TestClass)
      logger.info('trigger')
      expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Semantic Imports')
    })

    it('should reuse the same output channel across loggers', () => {
      const logger1 = Logger.create(ServiceA)
      const logger2 = Logger.create(ServiceB)

      logger1.info('first')
      logger2.info('second')

      expect(vscode.window.createOutputChannel).toHaveBeenCalledTimes(1)
    })
  })
})
