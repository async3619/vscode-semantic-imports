import type * as vscode from 'vscode'

export function findTokenTypeAtPosition(
  tokens: vscode.SemanticTokens,
  legend: vscode.SemanticTokensLegend,
  targetLine: number,
  targetChar: number,
): string | undefined {
  const data = tokens.data
  let line = 0
  let char = 0

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i]
    const deltaStart = data[i + 1]
    const length = data[i + 2]
    const tokenTypeIndex = data[i + 3]

    line += deltaLine
    char = deltaLine === 0 ? char + deltaStart : deltaStart

    if (line === targetLine && char <= targetChar && targetChar < char + length) {
      return legend.tokenTypes[tokenTypeIndex]
    }

    if (line > targetLine) {
      break
    }
  }

  return undefined
}
