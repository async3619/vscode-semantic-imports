import { injectable } from 'inversify'
import * as vscode from 'vscode'

export interface DefinitionResult {
  targetUri: vscode.Uri
  targetRange: vscode.Range
  targetPos: vscode.Position
}

export interface CompletionInfoResponse {
  body?: Record<string, unknown>
}

export interface QuickInfoBody {
  kind: string
  kindModifiers: string
  displayString: string
}

interface QuickInfoResponse {
  body?: QuickInfoBody
}

@injectable()
export class TypeScriptLanguageService {
  async getDefinition(uri: vscode.Uri, position: vscode.Position): Promise<DefinitionResult | null> {
    return (
      (await this.executeDefinitionCommand('vscode.executeTypeDefinitionProvider', uri, position)) ??
      (await this.executeDefinitionCommand('vscode.executeDefinitionProvider', uri, position))
    )
  }

  private async executeDefinitionCommand(
    command: string,
    uri: vscode.Uri,
    position: vscode.Position,
  ): Promise<DefinitionResult | null> {
    const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      command,
      uri,
      position,
    )

    if (!definitions || definitions.length === 0) {
      return null
    }

    const def = definitions[0]
    const targetUri = 'targetUri' in def ? def.targetUri : def.uri
    const targetRange = 'targetUri' in def ? (def.targetSelectionRange ?? def.targetRange) : def.range

    return { targetUri, targetRange, targetPos: targetRange.start }
  }

  async getHovers(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Hover[]> {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position)

    return hovers ?? []
  }

  async requestCompletionInfo(
    file: string,
    line: number,
    offset: number,
    triggerCharacter?: unknown,
  ): Promise<CompletionInfoResponse | undefined> {
    return vscode.commands.executeCommand<CompletionInfoResponse>('typescript.tsserverRequest', 'completionInfo', {
      file,
      line,
      offset,
      triggerCharacter,
    })
  }

  async requestQuickInfo(file: string, line: number, offset: number): Promise<QuickInfoBody | undefined> {
    const result = await vscode.commands.executeCommand<QuickInfoResponse>('typescript.tsserverRequest', 'quickinfo', {
      file,
      line,
      offset,
    })

    return result?.body
  }

  async getSemanticTokens(
    uri: vscode.Uri,
  ): Promise<{ legend: vscode.SemanticTokensLegend; tokens: vscode.SemanticTokens } | null> {
    const [legend, tokens] = await Promise.all([
      vscode.commands.executeCommand<vscode.SemanticTokensLegend>('vscode.provideDocumentSemanticTokensLegend', uri),
      vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentSemanticTokens', uri),
    ])

    if (!legend || !tokens) {
      return null
    }

    return { legend, tokens }
  }

  async openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(uri)
  }
}
