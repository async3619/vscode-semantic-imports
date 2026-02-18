import * as vscode from 'vscode'
import * as path from 'path'

type TypeScript = typeof import('typescript')

let cached: TypeScript | null | undefined

export function loadTypeScript(): TypeScript | undefined {
  if (cached !== undefined) {
    return cached ?? undefined
  }

  cached = null

  const tsExt = vscode.extensions.getExtension?.('vscode.typescript-language-features')
  if (!tsExt) {
    return undefined
  }

  try {
    const tsPath = path.join(path.dirname(tsExt.extensionPath), 'node_modules', 'typescript')
    cached = require(tsPath) as TypeScript
  } catch {
    // Failed to load TypeScript from VS Code built-in
  }

  return cached ?? undefined
}

export function _resetTypeScriptCache() {
  cached = undefined
}
