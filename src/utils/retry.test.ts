import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withRetry } from './retry'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')

    const result = await withRetry(fn, { maxRetries: 3, delay: 100, shouldRetry: () => true })

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry and succeed on later attempt', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('transient')
      }
      return 'ok'
    })

    const promise = withRetry(fn, { maxRetries: 3, delay: 100, shouldRetry: () => true })
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should throw after max retries exceeded', async () => {
    vi.useRealTimers()

    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('persistent')
    })

    await expect(withRetry(fn, { maxRetries: 2, delay: 0, shouldRetry: () => true })).rejects.toThrow('persistent')
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('should not retry when shouldRetry returns false', async () => {
    vi.useRealTimers()

    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('non-retryable')
    })

    const promise = withRetry(fn, { maxRetries: 3, delay: 0, shouldRetry: () => false })
    await expect(promise).rejects.toThrow('non-retryable')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should only retry on matching errors', async () => {
    vi.useRealTimers()

    class RetryableError extends Error {}
    let callCount = 0
    const fn = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new RetryableError('retry me')
      }
      throw new Error('do not retry')
    })

    await expect(
      withRetry(fn, { maxRetries: 3, delay: 0, shouldRetry: (e) => e instanceof RetryableError }),
    ).rejects.toThrow('do not retry')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should wait the specified delay between retries', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('fail')
      }
      return 'ok'
    })

    const promise = withRetry(fn, { maxRetries: 3, delay: 500, shouldRetry: () => true })

    await vi.advanceTimersByTimeAsync(499)
    expect(fn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    const result = await promise

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should call onRetry before each retry attempt', async () => {
    vi.useRealTimers()

    let callCount = 0
    const fn = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount <= 2) {
        throw new Error('fail')
      }
      return 'ok'
    })
    const onRetry = vi.fn()

    await withRetry(fn, { maxRetries: 3, delay: 0, shouldRetry: () => true, onRetry })

    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 3, expect.any(Error))
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 3, expect.any(Error))
  })
})
