import type * as vscode from 'vscode'

export enum SymbolKind {
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  Type = 'type',
  Enum = 'enum',
  Namespace = 'namespace',
  Variable = 'variable',
}

export abstract class BaseSymbolResolver {
  abstract readonly name: string
  abstract resolve(document: vscode.TextDocument, position: vscode.Position): Promise<SymbolKind | undefined>
}
