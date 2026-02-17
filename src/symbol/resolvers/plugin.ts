import * as vscode from 'vscode'
import { RESPONSE_KEY, type PluginResponse } from '../../tsPlugin/protocol'
import { TypeScriptServerNotLoadedError } from '../errors'
import { SymbolKind, BaseSymbolResolver } from '../types'

export class PluginSymbolResolver extends BaseSymbolResolver {
  readonly name = 'plugin'

  async resolve(document: vscode.TextDocument, position: vscode.Position) {
    const definition = await this.getDefinition(document, position)
    if (!definition) {
      return undefined
    }

    if (definition.targetUri.scheme !== 'file') {
      return undefined
    }

    let result
    try {
      result = await this.languageService.requestCompletionInfo(
        definition.targetUri.fsPath,
        definition.targetPos.line + 1,
        definition.targetPos.character + 1,
        { id: 'resolve' },
      )
      this.logger.debug('plugin response received:', result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (message.includes('No Project')) {
        this.logger.debug('TypeScript Server not ready (No Project), will retry')
        throw new TypeScriptServerNotLoadedError()
      }

      this.logger.debug('tsserver request failed:', message)
      return undefined
    }

    const response = result?.body?.[RESPONSE_KEY] as PluginResponse | undefined
    if (!response) {
      return undefined
    }

    if (response.id === 'error') {
      this.logger.debug('plugin responded with error')
      return undefined
    }

    if (response.isNotReady) {
      this.logger.debug('syntax server returned transient unknown symbol, will retry')
      throw new TypeScriptServerNotLoadedError()
    }

    if (response.isFunction) {
      return SymbolKind.Function
    } else if (response.isClass) {
      return SymbolKind.Class
    } else if (response.isInterface) {
      return SymbolKind.Interface
    } else if (response.isType) {
      return SymbolKind.Type
    } else if (response.isEnum) {
      return SymbolKind.Enum
    } else if (response.isNamespace) {
      return SymbolKind.Namespace
    } else if (response.isVariable) {
      return SymbolKind.Variable
    }

    return undefined
  }
}
