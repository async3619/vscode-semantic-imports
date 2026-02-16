import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { Logger } from './logger'

class TestClass {}
class ServiceA {}
class ServiceB {}

describe('Logger', () => {
  let infoFn: ReturnType<typeof vi.fn>
  let warnFn: ReturnType<typeof vi.fn>
  let errorFn: ReturnType<typeof vi.fn>
  let debugFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    infoFn = vi.fn()
    warnFn = vi.fn()
    errorFn = vi.fn()
    debugFn = vi.fn()
    vi.mocked(vscode.window.createOutputChannel).mockClear()
    vi.mocked(vscode.window.createOutputChannel).mockReturnValue({
      info: infoFn,
      warn: warnFn,
      error: errorFn,
      debug: debugFn,
      trace: vi.fn(),
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
      name: 'Semantic Imports',
      hide: vi.fn(),
      replace: vi.fn(),
    } as unknown as vscode.LogOutputChannel)
  })

  afterEach(() => {
    Logger.dispose()
  })

  describe('create', () => {
    it('should extract class name as tag', () => {
      const logger = Logger.create(TestClass)
      logger.info('hello')

      expect(infoFn).toHaveBeenCalledWith('[TestClass]', 'hello')
    })
  })

  describe('severity methods', () => {
    it('should call output.info for info()', () => {
      const logger = Logger.create(TestClass)
      logger.info('hello world')

      expect(infoFn).toHaveBeenCalledWith('[TestClass]', 'hello world')
    })

    it('should call output.warn for warn()', () => {
      const logger = Logger.create(TestClass)
      logger.warn('something is off')

      expect(warnFn).toHaveBeenCalledWith('[TestClass]', 'something is off')
    })

    it('should call output.error for error()', () => {
      const logger = Logger.create(TestClass)
      logger.error('failed')

      expect(errorFn).toHaveBeenCalledWith('[TestClass]', 'failed')
    })

    it('should call output.debug for debug()', () => {
      const logger = Logger.create(TestClass)
      logger.debug('details')

      expect(debugFn).toHaveBeenCalledWith('[TestClass]', 'details')
    })
  })

  describe('tag isolation', () => {
    it('should use different tags for different logger instances', () => {
      const logger1 = Logger.create(ServiceA)
      const logger2 = Logger.create(ServiceB)

      logger1.info('from A')
      logger2.info('from B')

      expect(infoFn.mock.calls[0][0]).toBe('[ServiceA]')
      expect(infoFn.mock.calls[1][0]).toBe('[ServiceB]')
    })
  })

  describe('args formatting', () => {
    it('should serialize plain objects as JSON', () => {
      const logger = Logger.create(TestClass)
      logger.info('data', { key: 'value', count: 42 })

      expect(infoFn).toHaveBeenCalledWith('[TestClass]', 'data', '{"key":"value","count":42}')
    })

    it('should display class instances as ClassName {}', () => {
      const logger = Logger.create(TestClass)
      logger.info('received', new ServiceA())

      expect(infoFn).toHaveBeenCalledWith('[TestClass]', 'received', 'ServiceA {}')
    })

    it('should serialize arrays as JSON', () => {
      const logger = Logger.create(TestClass)
      logger.info('items', [1, 2, 3])

      expect(infoFn).toHaveBeenCalledWith('[TestClass]', 'items', '[1,2,3]')
    })

    it('should convert primitives with String()', () => {
      const logger = Logger.create(TestClass)
      logger.info('values', 42, true, 'text')

      expect(infoFn).toHaveBeenCalledWith('[TestClass]', 'values', '42', 'true', 'text')
    })

    it('should handle null and undefined', () => {
      const logger = Logger.create(TestClass)
      logger.info('empty', null, undefined)

      expect(infoFn).toHaveBeenCalledWith('[TestClass]', 'empty', 'null', 'undefined')
    })

    it('should use error stack for Error instances', () => {
      const logger = Logger.create(TestClass)
      const error = new Error('boom')
      logger.error('failed', error)

      expect(errorFn).toHaveBeenCalledWith('[TestClass]', 'failed', expect.stringContaining('Error: boom'))
    })
  })

  describe('output channel', () => {
    it('should create log output channel lazily on first log call', () => {
      Logger.create(TestClass)
      expect(vscode.window.createOutputChannel).not.toHaveBeenCalled()

      const logger = Logger.create(TestClass)
      logger.info('trigger')
      expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Semantic Imports', { log: true })
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
