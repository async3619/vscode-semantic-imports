import { describe, it, expect } from 'vitest'
import { TypeScriptParser } from './typescript'

describe('TypeScriptParser', () => {
  const parser = new TypeScriptParser()

  describe('parseImports', () => {
    describe('named imports', () => {
      it('should extract named imports', () => {
        const result = parser.parseImports("import { useState, useEffect } from 'react'")
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({
          localName: 'useState',
          importedName: 'useState',
          source: 'react',
          kind: 'named',
          isTypeOnly: false,
        })
        expect(result[1]).toMatchObject({
          localName: 'useEffect',
          importedName: 'useEffect',
          source: 'react',
          kind: 'named',
          isTypeOnly: false,
        })
      })

      it('should extract aliased imports using local name', () => {
        const result = parser.parseImports("import { foo as bar } from 'baz'")
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ localName: 'bar', importedName: 'foo', source: 'baz', kind: 'named' })
      })

      it('should handle mixed aliased and non-aliased', () => {
        const result = parser.parseImports("import { useState, Component as Comp } from 'react'")
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ localName: 'useState', importedName: 'useState' })
        expect(result[1]).toMatchObject({ localName: 'Comp', importedName: 'Component' })
      })
    })

    describe('default imports', () => {
      it('should extract default import', () => {
        const result = parser.parseImports("import React from 'react'")
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
          localName: 'React',
          importedName: 'React',
          source: 'react',
          kind: 'default',
          isTypeOnly: false,
        })
      })
    })

    describe('namespace imports', () => {
      it('should extract namespace import', () => {
        const result = parser.parseImports("import * as path from 'path'")
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
          localName: 'path',
          importedName: '*',
          source: 'path',
          kind: 'namespace',
          isTypeOnly: false,
        })
      })
    })

    describe('combined imports', () => {
      it('should extract default + named imports', () => {
        const result = parser.parseImports("import React, { useState, useEffect } from 'react'")
        expect(result).toHaveLength(3)
        expect(result[0]).toMatchObject({ localName: 'React', kind: 'default' })
        expect(result[1]).toMatchObject({ localName: 'useState', kind: 'named' })
        expect(result[2]).toMatchObject({ localName: 'useEffect', kind: 'named' })
      })

      it('should extract default + namespace imports', () => {
        const result = parser.parseImports("import React, * as ReactAll from 'react'")
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ localName: 'React', kind: 'default' })
        expect(result[1]).toMatchObject({ localName: 'ReactAll', importedName: '*', kind: 'namespace' })
      })
    })

    describe('type imports', () => {
      it('should extract type-only imports', () => {
        const result = parser.parseImports("import type { Foo, Bar } from 'module'")
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ localName: 'Foo', isTypeOnly: true })
        expect(result[1]).toMatchObject({ localName: 'Bar', isTypeOnly: true })
      })

      it('should extract inline type imports', () => {
        const result = parser.parseImports("import { type Foo, useState } from 'react'")
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ localName: 'Foo', isTypeOnly: true })
        expect(result[1]).toMatchObject({ localName: 'useState', isTypeOnly: false })
      })
    })

    describe('multi-line imports', () => {
      it('should handle multi-line named imports', () => {
        const text = `import {
  useState,
  useEffect,
  useCallback,
} from 'react'`
        const result = parser.parseImports(text)
        expect(result).toHaveLength(3)
        expect(result[0]).toMatchObject({ localName: 'useState' })
        expect(result[1]).toMatchObject({ localName: 'useEffect' })
        expect(result[2]).toMatchObject({ localName: 'useCallback' })
      })
    })

    describe('side-effect imports', () => {
      it('should return no statements for side-effect imports', () => {
        const result = parser.parseImports("import './styles.css'")
        expect(result).toHaveLength(0)
      })

      it('should still parse other imports alongside side-effect imports', () => {
        const text = `import { useState } from 'react'
import './styles.css'

const x = 1`
        const result = parser.parseImports(text)
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ localName: 'useState' })
      })
    })

    describe('multiple import statements', () => {
      it('should extract statements from all imports', () => {
        const text = `import React from 'react'
import { render } from 'react-dom'
import * as path from 'path'`
        const result = parser.parseImports(text)
        expect(result).toHaveLength(3)
        expect(result[0]).toMatchObject({ localName: 'React', source: 'react', kind: 'default' })
        expect(result[1]).toMatchObject({ localName: 'render', source: 'react-dom', kind: 'named' })
        expect(result[2]).toMatchObject({ localName: 'path', source: 'path', kind: 'namespace' })
      })
    })

    describe('re-exports', () => {
      it('should skip re-exports', () => {
        const text = `import { useState } from 'react'
export { Foo } from 'bar'

const x = 1`
        const result = parser.parseImports(text)
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ localName: 'useState' })
      })
    })

    describe('position information', () => {
      it('should provide correct position for single-line import', () => {
        const result = parser.parseImports("import { useState } from 'react'")
        expect(result[0]).toMatchObject({
          startLine: 0,
          startColumn: 9,
          endLine: 0,
          endColumn: 17,
        })
      })

      it('should provide correct position for multi-line import', () => {
        const text = `import {
  useState,
  useEffect,
} from 'react'`
        const result = parser.parseImports(text)
        expect(result[0]).toMatchObject({ startLine: 1, startColumn: 2, endLine: 1, endColumn: 10 })
        expect(result[1]).toMatchObject({ startLine: 2, startColumn: 2, endLine: 2, endColumn: 11 })
      })

      it('should provide correct position for default import', () => {
        const result = parser.parseImports("import React from 'react'")
        expect(result[0]).toMatchObject({ startLine: 0, startColumn: 7, endLine: 0, endColumn: 12 })
      })

      it('should provide correct position for namespace import', () => {
        const result = parser.parseImports("import * as path from 'path'")
        expect(result[0]).toMatchObject({ startLine: 0, startColumn: 12, endLine: 0, endColumn: 16 })
      })

      it('should provide correct position for aliased import', () => {
        const result = parser.parseImports("import { foo as bar } from 'baz'")
        // position should be for 'bar' (the local name)
        expect(result[0]).toMatchObject({ startLine: 0, startColumn: 16, endLine: 0, endColumn: 19 })
      })

      it('should provide correct positions for multiple imports on separate lines', () => {
        const text = `import React from 'react'
import { render } from 'react-dom'`
        const result = parser.parseImports(text)
        expect(result[0]).toMatchObject({ startLine: 0, startColumn: 7, endLine: 0, endColumn: 12 })
        expect(result[1]).toMatchObject({ startLine: 1, startColumn: 9, endLine: 1, endColumn: 15 })
      })
    })

    describe('edge cases', () => {
      it('should return empty array for empty file', () => {
        const result = parser.parseImports('')
        expect(result).toEqual([])
      })

      it('should return empty array for file with no imports', () => {
        const result = parser.parseImports('const x = 1\nconst y = 2')
        expect(result).toEqual([])
      })

      it('should skip leading comments before imports', () => {
        const text = `// This is a comment
/* Block comment */
import { useState } from 'react'

const x = 1`
        const result = parser.parseImports(text)
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ localName: 'useState', startLine: 2 })
      })

      it('should handle duplicate symbols from different sources', () => {
        const text = `import { useState } from 'react'
import { useState } from 'preact/hooks'`
        const result = parser.parseImports(text)
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ localName: 'useState', source: 'react' })
        expect(result[1]).toMatchObject({ localName: 'useState', source: 'preact/hooks' })
      })
    })
  })
})
