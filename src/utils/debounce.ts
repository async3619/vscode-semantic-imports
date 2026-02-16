// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => void

export type DebouncedFunction<T extends AnyFunction> = ((...args: Parameters<T>) => void) & {
  cancel(): void
}

export function debounce<T extends AnyFunction>(fn: T, delay: number): DebouncedFunction<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const debounced = (...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, delay)
  }

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  return debounced as DebouncedFunction<T>
}
