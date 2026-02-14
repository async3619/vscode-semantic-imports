import { describe, it, expect, beforeEach, vi } from 'vitest'
import { decorationTypes, documentCaches } from './state'
import { disposeDecorations } from './disposeDecorations'
import type * as vscode from 'vscode'

describe('disposeDecorations', () => {
  beforeEach(() => {
    decorationTypes.clear()
    documentCaches.clear()
  })

  it('should call dispose() on all decoration types', () => {
    const dispose1 = vi.fn()
    const dispose2 = vi.fn()
    decorationTypes.set('#ff0000', { dispose: dispose1 } as unknown as vscode.TextEditorDecorationType)
    decorationTypes.set('#00ff00', { dispose: dispose2 } as unknown as vscode.TextEditorDecorationType)

    disposeDecorations()

    expect(dispose1).toHaveBeenCalledOnce()
    expect(dispose2).toHaveBeenCalledOnce()
  })

  it('should clear the decorationTypes map', () => {
    decorationTypes.set('#ff0000', { dispose: vi.fn() } as unknown as vscode.TextEditorDecorationType)

    disposeDecorations()

    expect(decorationTypes.size).toBe(0)
  })

  it('should clear the documentCaches map', () => {
    documentCaches.set('file:///test.ts', { importSectionText: '', symbolKinds: new Map() })

    disposeDecorations()

    expect(documentCaches.size).toBe(0)
  })

  it('should handle empty state gracefully', () => {
    expect(() => disposeDecorations()).not.toThrow()
    expect(decorationTypes.size).toBe(0)
    expect(documentCaches.size).toBe(0)
  })
})
