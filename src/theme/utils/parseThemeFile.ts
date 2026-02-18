import { parse as parsePlist } from 'fast-plist'
import { parse as parseJsonc } from 'jsonc-parser'
import * as vscode from 'vscode'
import type { RawThemeData, ResolvedThemeData, TokenColorRule } from '@/theme/types'

const MAX_INCLUDE_DEPTH = 10

export async function parseThemeFile(
  extensionUri: vscode.Uri,
  themePath: string,
): Promise<ResolvedThemeData | undefined> {
  try {
    return await resolveTheme(extensionUri, themePath, 0)
  } catch {
    return undefined
  }
}

async function resolveTheme(baseUri: vscode.Uri, themePath: string, depth: number): Promise<ResolvedThemeData> {
  if (depth > MAX_INCLUDE_DEPTH) {
    return { semanticHighlighting: false, semanticTokenColors: {}, tokenColors: [] }
  }

  const themeUri = vscode.Uri.joinPath(baseUri, themePath)
  const raw = await readThemeFile(themeUri)

  let parentData: ResolvedThemeData = {
    semanticHighlighting: false,
    semanticTokenColors: {},
    tokenColors: [],
  }

  if (raw.include) {
    const dir = themePath.substring(0, themePath.lastIndexOf('/') + 1)
    const includePath = dir + raw.include
    parentData = await resolveTheme(baseUri, includePath, depth + 1)
  }

  const tokenColors: TokenColorRule[] = [...parentData.tokenColors, ...(raw.tokenColors ?? [])]

  const semanticTokenColors: Record<string, string> = { ...parentData.semanticTokenColors }
  if (raw.semanticTokenColors) {
    for (const [key, value] of Object.entries(raw.semanticTokenColors)) {
      const color = typeof value === 'string' ? value : value?.foreground
      if (color) {
        semanticTokenColors[key] = color
      }
    }
  }

  const semanticHighlighting = raw.semanticHighlighting ?? parentData.semanticHighlighting

  return { semanticHighlighting, semanticTokenColors, tokenColors }
}

async function readThemeFile(uri: vscode.Uri): Promise<RawThemeData> {
  const bytes = await vscode.workspace.fs.readFile(uri)
  const text = new TextDecoder('utf-8').decode(bytes)
  const path = uri.path.toLowerCase()

  if (path.endsWith('.tmtheme') || path.endsWith('.plist')) {
    return parsePlist(text) as RawThemeData
  }

  return parseJsonc(text) as RawThemeData
}
