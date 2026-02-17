import { describe, expect, it } from 'vitest'
import { isJavaScriptFile } from './isJavaScriptFile'

describe('isJavaScriptFile', () => {
  it.each(['/node_modules/lodash/lodash.js', '/node_modules/pkg/index.mjs', '/node_modules/pkg/index.cjs'])(
    'should return true for %s',
    (path) => {
      expect(isJavaScriptFile(path)).toBe(true)
    },
  )

  it.each(['/node_modules/@types/lodash/index.d.ts', '/src/app.ts', '/src/app.tsx', '/src/app.jsx'])(
    'should return false for %s',
    (path) => {
      expect(isJavaScriptFile(path)).toBe(false)
    },
  )
})
