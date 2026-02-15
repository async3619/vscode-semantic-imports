import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { isFunctionType } from './isFunctionType'

describe('isFunctionType', () => {
  describe('function types → true', () => {
    const cases = [
      '() => void',
      '(x: string) => number',
      '(a: number, b: string) => boolean',
      '() => Promise<void>',
      '<T>(arg: T) => T',
      '<T, U>(a: T, b: U) => [T, U]',
      'new () => Foo',
      'new (x: string) => Bar',
      '(x: { nested: () => void }) => number',
    ]

    for (const typeText of cases) {
      it(`should return true for "${typeText}"`, () => {
        expect(isFunctionType(ts, typeText)).toBe(true)
      })
    }
  })

  describe('callable object types → true', () => {
    const cases = ['{ (): void }', '{ new (): Foo }', '{ (): void; name: string }']

    for (const typeText of cases) {
      it(`should return true for "${typeText}"`, () => {
        expect(isFunctionType(ts, typeText)).toBe(true)
      })
    }
  })

  describe('parenthesized function types → true', () => {
    it('should return true for "(() => void)"', () => {
      expect(isFunctionType(ts, '(() => void)')).toBe(true)
    })
  })

  describe('non-function types → false', () => {
    const cases = [
      'string',
      'number',
      'boolean',
      'void',
      'null',
      'undefined',
      'never',
      'unknown',
      'any',
      '42',
      '"hello"',
      'true',
      'string[]',
      '[string, number]',
      'string | number',
      'string & { brand: true }',
      '{ bar: number }',
      '{ name: string; age: number }',
    ]

    for (const typeText of cases) {
      it(`should return false for "${typeText}"`, () => {
        expect(isFunctionType(ts, typeText)).toBe(false)
      })
    }
  })

  describe('ambiguous types → undefined', () => {
    const cases = ['MyCallback', 'React.FC', 'Record<string, number>', 'typeof someFunction', 'typeof import("react")']

    for (const typeText of cases) {
      it(`should return undefined for "${typeText}"`, () => {
        expect(isFunctionType(ts, typeText)).toBeUndefined()
      })
    }
  })

  describe('edge cases', () => {
    it('should return undefined for empty string', () => {
      expect(isFunctionType(ts, '')).toBeUndefined()
    })

    it('should return false for object type without call signatures', () => {
      expect(isFunctionType(ts, '{ handler: () => void }')).toBe(false)
    })
  })
})
