import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not call the function before the delay elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    vi.advanceTimersByTime(200)

    expect(fn).not.toHaveBeenCalled()
  })

  it('should call the function after the delay elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledOnce()
  })

  it('should reset the timer on subsequent calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    vi.advanceTimersByTime(200)
    debounced()
    vi.advanceTimersByTime(200)

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledOnce()
  })

  it('should pass arguments to the original function', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('a', 'b')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledWith('a', 'b')
  })

  it('should use the latest arguments when timer resets', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('first')
    vi.advanceTimersByTime(100)
    debounced('second')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('second')
  })

  it('should cancel a pending call with cancel()', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(300)

    expect(fn).not.toHaveBeenCalled()
  })

  it('should be callable again after cancel()', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    debounced.cancel()
    debounced()
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledOnce()
  })

  it('should be a no-op when cancel() is called with no pending timer', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    expect(() => debounced.cancel()).not.toThrow()
  })
})
