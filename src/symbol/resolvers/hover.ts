import * as vscode from 'vscode'
import { TypeScriptServerNotLoadedError } from '@/symbol/errors'
import { BaseSymbolResolver, SymbolKind } from '@/symbol/types'
import { extractContentText } from '@/symbol/utils/extractContentText'
import { isFunctionType } from '@/symbol/utils/isFunctionType'
import { loadTypeScript } from '@/symbol/utils/loadTypeScript'
import { toSymbolKind } from '@/symbol/utils/toSymbolKind'

const VARIABLE_KEYWORDS = new Set(['const', 'let', 'var'])
const TYPE_EXTRACT_PATTERN = /\(alias\)\s+(?:const|let|var)\s+\S+\s*:\s*(.+)/

export class HoverSymbolResolver extends BaseSymbolResolver {
  readonly name = 'hover'

  async resolve(document: vscode.TextDocument, position: vscode.Position) {
    const hovers = await this.languageService.getHovers(document.uri, position)
    if (hovers.length === 0) {
      return undefined
    }

    for (const hover of hovers) {
      for (const content of hover.contents) {
        const text = extractContentText(content)

        if (/\(loading\.\.\.\)/i.test(text)) {
          this.logger.debug('TypeScript Server not ready (loading...), will retry: ', text)
          throw new TypeScriptServerNotLoadedError()
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
