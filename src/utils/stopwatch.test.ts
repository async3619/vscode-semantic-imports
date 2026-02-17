import { describe, expect, it, vi } from 'vitest'
import { stopwatch } from './stopwatch'

describe('stopwatch', () => {
  it('should return the callback result and elapsed time', async () => {
    const [result, elapsed] = await stopwatch(async () => 42)

    expect(result).toBe(42)
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('should measure elapsed time of an async callback', async () => {
    vi.useFakeTimers()

    const promise = stopwatch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return 'done'
    })

    await vi.advanceTimersByTimeAsync(100)
    const [result, elapsed] = await promise

    expect(result).toBe('done')
    expect(elapsed).toBeGreaterThanOrEqual(0)

    vi.useRealTimers()
  })

  it('should propagate errors from the callback', async () => {
    await expect(
      stopwatch(async () => {
        throw new Error('fail')
      }),
    ).rejects.toThrow('fail')
  })
})
