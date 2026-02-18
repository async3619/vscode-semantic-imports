import type * as vscode from 'vscode'
import { Logger } from '@/logger'
import type { DefinitionResult, TypeScriptLanguageService } from '@/typescript/language'
import { TypeScriptServerNotLoadedError } from './errors'
import { extractContentText } from './utils/extractContentText'

export enum SymbolKind {
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  Type = 'type',
  Enum = 'enum',
  Namespace = 'namespace',
  Variable = 'variable',
}

export const SymbolConfidence: Record<SymbolKind, number> = {
  [SymbolKind.Function]: 0.9,
  [SymbolKind.Class]: 0.9,
  [SymbolKind.Interface]: 0.8,
  [SymbolKind.Type]: 0.8,
  [SymbolKind.Enum]: 0.8,
  [SymbolKind.Namespace]: 0.7,
  [SymbolKind.Variable]: 0.5,
}

export abstract class BaseSymbolResolver {
  abstract readonly name: string
  protected readonly logger: Logger

  constructor(protected readonly languageService: TypeScriptLanguageService) {
    this.logger = Logger.create(this.constructor as typeof BaseSymbolResolver)
  }

  abstract resolve(document: vscode.TextDocument, position: vscode.Position): Promise<SymbolKind | undefined>

  protected async getDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<DefinitionResult | null> {
    const result = await this.languageService.getDefinition(document.uri, position)
    if (result) {
      return result
    }

    const hovers = await this.languageService.getHovers(document.uri, position)
    for (const hover of hovers) {
      for (const content of hover.contents) {
        if (/\(loading\.\.\.\)/i.test(extractContentText(content))) {
          throw new TypeScriptServerNotLoadedError()
        }
      }
    }

    return null
  }
}
