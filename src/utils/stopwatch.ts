export async function stopwatch<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now()
  const result = await fn()
  const elapsed = Math.round(performance.now() - start)
  return [result, elapsed]
}
