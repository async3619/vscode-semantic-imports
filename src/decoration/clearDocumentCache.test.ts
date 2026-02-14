import { describe, it, expect, beforeEach } from 'vitest'
import { documentCaches } from './state'
import { clearDocumentCache } from './clearDocumentCache'

describe('clearDocumentCache', () => {
  beforeEach(() => {
    documentCaches.clear()
  })

  it('should delete the cache entry for the given uri', () => {
    documentCaches.set('file:///test.ts', { importSectionText: 'import {}', symbolKinds: new Map() })
    clearDocumentCache('file:///test.ts')
    expect(documentCaches.has('file:///test.ts')).toBe(false)
  })

  it('should not affect other cache entries', () => {
    documentCaches.set('file:///a.ts', { importSectionText: '', symbolKinds: new Map() })
    documentCaches.set('file:///b.ts', { importSectionText: '', symbolKinds: new Map() })
    clearDocumentCache('file:///a.ts')
    expect(documentCaches.has('file:///a.ts')).toBe(false)
    expect(documentCaches.has('file:///b.ts')).toBe(true)
  })

  it('should be a no-op if uri does not exist in cache', () => {
    expect(documentCaches.size).toBe(0)
    clearDocumentCache('file:///nonexistent.ts')
    expect(documentCaches.size).toBe(0)
  })
})
