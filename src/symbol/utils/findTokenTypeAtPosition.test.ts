import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { findTokenTypeAtPosition } from './findTokenTypeAtPosition'

const DEFAULT_LEGEND: vscode.SemanticTokensLegend = {
  tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'variable', 'function'],
  tokenModifiers: [],
} as unknown as vscode.SemanticTokensLegend

function createTokenData(tokens: Array<[line: number, char: number, length: number, typeIndex: number]>) {
  const data: number[] = []
  let prevLine = 0
  let prevChar = 0
  for (const [line, char, length, typeIndex] of tokens) {
    const deltaLine = line - prevLine
    const deltaChar = deltaLine === 0 ? char - prevChar : char
    data.push(deltaLine, deltaChar, length, typeIndex, 0)
    prevLine = line
    prevChar = char
  }
  return new Uint32Array(data)
}

describe('findTokenTypeAtPosition', () => {
  it('should find token at exact start position', () => {
    const tokens = { data: createTokenData([[0, 5, 3, 6]]) } as vscode.SemanticTokens
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 5)).toBe('function')
  })

  it('should find token when target is within token range', () => {
    const tokens = { data: createTokenData([[0, 5, 10, 2]]) } as vscode.SemanticTokens
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 8)).toBe('class')
  })

  it('should return undefined when no token matches the position', () => {
    const tokens = { data: createTokenData([[0, 0, 3, 6]]) } as vscode.SemanticTokens
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 10)).toBeUndefined()
  })

  it('should handle multiple tokens on the same line', () => {
    const tokens = {
      data: createTokenData([
        [0, 0, 3, 5],
        [0, 5, 4, 6],
        [0, 12, 3, 2],
      ]),
    } as vscode.SemanticTokens

    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 0)).toBe('variable')
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 6)).toBe('function')
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 12)).toBe('class')
  })

  it('should handle tokens across multiple lines', () => {
    const tokens = {
      data: createTokenData([
        [0, 0, 5, 6],
        [2, 4, 3, 2],
        [5, 0, 4, 5],
      ]),
    } as vscode.SemanticTokens

    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 0)).toBe('function')
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 2, 5)).toBe('class')
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 5, 2)).toBe('variable')
  })

  it('should stop early when past the target line', () => {
    const tokens = {
      data: createTokenData([
        [0, 0, 3, 6],
        [5, 0, 3, 2],
        [10, 0, 3, 5],
      ]),
    } as vscode.SemanticTokens

    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 3, 0)).toBeUndefined()
  })

  it('should handle empty token data', () => {
    const tokens = { data: new Uint32Array([]) } as vscode.SemanticTokens
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 0)).toBeUndefined()
  })

  it('should not match position at token end boundary', () => {
    const tokens = { data: createTokenData([[0, 5, 3, 6]]) } as vscode.SemanticTokens
    expect(findTokenTypeAtPosition(tokens, DEFAULT_LEGEND, 0, 8)).toBeUndefined()
  })
})
