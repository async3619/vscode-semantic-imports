import { describe, it, expect } from 'vitest'
import { parseImports } from './importParser'

describe('parseImports', () => {
  describe('named imports', () => {
    it('should extract named imports', () => {
      const result = parseImports("import { useState, useEffect } from 'react'")
      expect(result.symbols).toEqual(['useState', 'useEffect'])
    })

    it('should extract aliased imports using local name', () => {
      const result = parseImports("import { foo as bar } from 'baz'")
      expect(result.symbols).toEqual(['bar'])
    })

    it('should handle mixed aliased and non-aliased', () => {
      const result = parseImports("import { useState, Component as Comp } from 'react'")
      expect(result.symbols).toEqual(['useState', 'Comp'])
    })
  })

  describe('default imports', () => {
    it('should extract default import', () => {
      const result = parseImports("import React from 'react'")
      expect(result.symbols).toEqual(['React'])
    })
  })

  describe('namespace imports', () => {
    it('should extract namespace import', () => {
      const result = parseImports("import * as path from 'path'")
      expect(result.symbols).toEqual(['path'])
    })
  })

  describe('combined imports', () => {
    it('should extract default + named imports', () => {
      const result = parseImports("import React, { useState, useEffect } from 'react'")
      expect(result.symbols).toEqual(['React', 'useState', 'useEffect'])
    })

    it('should extract default + namespace imports', () => {
      const result = parseImports("import React, * as ReactAll from 'react'")
      expect(result.symbols).toEqual(['React', 'ReactAll'])
    })
  })

  describe('type imports', () => {
    it('should extract type-only imports', () => {
      const result = parseImports("import type { Foo, Bar } from 'module'")
      expect(result.symbols).toEqual(['Foo', 'Bar'])
    })

    it('should extract inline type imports', () => {
      const result = parseImports("import { type Foo, useState } from 'react'")
      expect(result.symbols).toEqual(['Foo', 'useState'])
    })
  })

  describe('multi-line imports', () => {
    it('should handle multi-line named imports', () => {
      const text = `import {
  useState,
  useEffect,
  useCallback,
} from 'react'`
      const result = parseImports(text)
      expect(result.symbols).toEqual(['useState', 'useEffect', 'useCallback'])
    })

    it('should set importEndLine correctly for multi-line imports', () => {
      const text = `import {
  useState,
  useEffect,
} from 'react'

const x = useState(0)`
      const result = parseImports(text)
      expect(result.importEndLine).toBe(4)
    })
  })

  describe('side-effect imports', () => {
    it('should return no symbols for side-effect imports', () => {
      const result = parseImports("import './styles.css'")
      expect(result.symbols).toEqual([])
    })

    it('should still update importEndLine for side-effect imports', () => {
      const text = `import { useState } from 'react'
import './styles.css'

const x = 1`
      const result = parseImports(text)
      expect(result.symbols).toEqual(['useState'])
      expect(result.importEndLine).toBe(2)
    })
  })

  describe('multiple import statements', () => {
    it('should extract symbols from all imports', () => {
      const text = `import React from 'react'
import { render } from 'react-dom'
import * as path from 'path'`
      const result = parseImports(text)
      expect(result.symbols).toEqual(['React', 'render', 'path'])
      expect(result.importEndLine).toBe(3)
    })
  })

  describe('re-exports', () => {
    it('should skip re-exports', () => {
      const text = `import { useState } from 'react'
export { Foo } from 'bar'

const x = 1`
      const result = parseImports(text)
      expect(result.symbols).toEqual(['useState'])
    })
  })

  describe('edge cases', () => {
    it('should return empty symbols and importEndLine 0 for empty file', () => {
      const result = parseImports('')
      expect(result.symbols).toEqual([])
      expect(result.importEndLine).toBe(0)
    })

    it('should return empty symbols for file with no imports', () => {
      const result = parseImports('const x = 1\nconst y = 2')
      expect(result.symbols).toEqual([])
      expect(result.importEndLine).toBe(0)
    })

    it('should skip leading comments before imports', () => {
      const text = `// This is a comment
/* Block comment */
import { useState } from 'react'

const x = 1`
      const result = parseImports(text)
      expect(result.symbols).toEqual(['useState'])
      expect(result.importEndLine).toBe(3)
    })

    it('should deduplicate symbols', () => {
      const text = `import { useState } from 'react'
import { useState } from 'preact/hooks'`
      const result = parseImports(text)
      expect(result.symbols).toEqual(['useState'])
    })
  })
})
