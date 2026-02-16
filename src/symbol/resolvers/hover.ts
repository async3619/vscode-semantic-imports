import * as vscode from 'vscode'
import { TsServerLoadingError } from '../errors'
import { SymbolKind, BaseSymbolResolver } from '../types'
import { extractContentText } from '../utils/extractContentText'
import { isFunctionType } from '../utils/isFunctionType'
import { loadTypeScript } from '../utils/loadTypeScript'
import { toSymbolKind } from '../utils/toSymbolKind'

const VARIABLE_KEYWORDS = new Set(['const', 'let', 'var'])
const TYPE_EXTRACT_PATTERN = /\(alias\)\s+(?:const|let|var)\s+\S+\s*:\s*(.+)/

export class HoverSymbolResolver extends BaseSymbolResolver {
  readonly name = 'hover'

  async resolve(document: vscode.TextDocument, position: vscode.Position) {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      position,
    )

    if (!hovers || hovers.length === 0) {
      return undefined
    }

    for (const hover of hovers) {
      for (const content of hover.contents) {
        const text = extractContentText(content)

        if (/\(loading\.\.\.\)/i.test(text)) {
          throw new TsServerLoadingError()
        }

        const match = text.match(/\(alias\)\s+(function|class|interface|type|enum|namespace|const|let|var|module)\b/)
        if (match) {
          const keyword = match[1]
          if (VARIABLE_KEYWORDS.has(keyword)) {
            return this.resolveVariableKind(text)
          }
          return toSymbolKind(keyword)
        }
      }
    }

    return undefined
  }

  private resolveVariableKind(text: string) {
    const typeMatch = text.match(TYPE_EXTRACT_PATTERN)
    if (!typeMatch) {
      return SymbolKind.Variable
    }

    const ts = loadTypeScript()
    if (!ts) {
      return undefined
    }

    const result = isFunctionType(ts, typeMatch[1].trim())
    if (result === true) {
      return SymbolKind.Function
    }
    if (result === false) {
      return SymbolKind.Variable
    }

    return undefined
  }
}
