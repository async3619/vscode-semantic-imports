import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { decorationTypes } from './state'
import { getDecorationType } from './getDecorationType'

describe('getDecorationType', () => {
  beforeEach(() => {
    decorationTypes.clear()
    vi.mocked(vscode.window.createTextEditorDecorationType).mockClear()
  })

  it('should create a new decoration type for an unseen color', () => {
    const result = getDecorationType('#ff0000')

    expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledWith({ color: '#ff0000' })
    expect(result).toBeDefined()
    expect(result.dispose).toBeDefined()
  })

  it('should return cached decoration type for previously seen color', () => {
    const first = getDecorationType('#ff0000')
    const second = getDecorationType('#ff0000')

    expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it('should create separate decoration types for different colors', () => {
    const red = getDecorationType('#ff0000')
    const green = getDecorationType('#00ff00')

    expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(2)
    expect(red).not.toBe(green)
  })

  it('should store the decoration type in the decorationTypes map', () => {
    const result = getDecorationType('#ff0000')

    expect(decorationTypes.get('#ff0000')).toBe(result)
  })
})
