export interface RetryOptions {
  maxRetries: number
  delay: number
  shouldRetry: (error: unknown) => boolean
  onRetry?: (attempt: number, maxRetries: number, error: unknown) => void
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxRetries, delay, shouldRetry, onRetry } = options

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error
      }
      onRetry?.(attempt + 1, maxRetries, error)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}
