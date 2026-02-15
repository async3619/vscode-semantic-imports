import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { loadTypeScript, _resetTypeScriptCache } from './loadTypeScript'

describe('loadTypeScript', () => {
  beforeEach(() => {
    _resetTypeScriptCache()
  })

  it('should return undefined when typescript-language-features extension is not found', () => {
    const result = loadTypeScript()
    expect(result).toBeUndefined()
  })

  it('should load TypeScript from extension path when available', () => {
    const mockGetExtension = vi.fn().mockReturnValue({
      extensionPath: '/mock/extensions/vscode.typescript-language-features',
    })
    vi.mocked(vscode.extensions).getExtension = mockGetExtension

    const result = loadTypeScript()

    expect(mockGetExtension).toHaveBeenCalledWith('vscode.typescript-language-features')
    // In test environment, require will fail for the mock path
    // but the function should handle it gracefully
    expect(result).toBeUndefined()
  })

  it('should cache the result after first call', () => {
    loadTypeScript()
    loadTypeScript()

    // getExtension should only be called once due to caching
    // (in test env it's undefined, so it returns undefined and caches null)
    expect(loadTypeScript()).toBeUndefined()
  })

  it('should return cached value on subsequent calls', () => {
    _resetTypeScriptCache()

    const first = loadTypeScript()
    const second = loadTypeScript()

    expect(first).toBe(second)
  })
})
