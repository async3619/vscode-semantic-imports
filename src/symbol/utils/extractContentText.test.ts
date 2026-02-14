import { describe, it, expect } from 'vitest'
import * as vscode from 'vscode'
import { extractContentText } from './extractContentText'

describe('extractContentText', () => {
  it('should return value from MarkdownString instance', () => {
    const content = new vscode.MarkdownString('some markdown')
    expect(extractContentText(content)).toBe('some markdown')
  })

  it('should return string content directly', () => {
    expect(extractContentText('hello')).toBe('hello')
  })

  it('should return value from MarkedString object with language and value', () => {
    const content = { language: 'typescript', value: 'const x = 1' }
    expect(extractContentText(content)).toBe('const x = 1')
  })

  it('should handle empty MarkdownString', () => {
    const content = new vscode.MarkdownString('')
    expect(extractContentText(content)).toBe('')
  })

  it('should handle empty string', () => {
    expect(extractContentText('')).toBe('')
  })
})
