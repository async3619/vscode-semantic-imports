import * as vscode from 'vscode'
import { extractContentText } from './utils/extractContentText'
import { findTokenTypeAtPosition } from './utils/findTokenTypeAtPosition'

interface QuickInfoResponse {
  body?: {
    kind: string
    kindModifiers: string
    displayString: string
  }
}

export class SymbolResolver {
  constructor(private readonly output: vscode.OutputChannel) {}

  async resolveByHover(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      position,
    )

    if (!hovers || hovers.length === 0) return undefined

    for (const hover of hovers) {
      for (const content of hover.contents) {
        const text = extractContentText(content)
        this.output.appendLine(`[hover] ${position.line}:${position.character} → ${text.slice(0, 200)}`)
        const match = text.match(/\(alias\)\s+(function|class|interface|type|enum|namespace|const|let|var|module)\b/)
        if (match) return match[1]
      }
    }

    return undefined
  }

  async resolveBySemanticToken(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
    const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider',
      document.uri,
      position,
    )

    if (!definitions || definitions.length === 0) return undefined

    const def = definitions[0]
    const targetUri = 'targetUri' in def ? def.targetUri : def.uri
    const targetRange = 'targetUri' in def ? (def.targetSelectionRange ?? def.targetRange) : def.range
    const targetPos = targetRange.start

    this.output.appendLine(
      `[definition] ${position.line}:${position.character} → ${targetUri.toString()}:${targetPos.line}:${targetPos.character}`,
    )

    await vscode.workspace.openTextDocument(targetUri)

    const [legend, tokens] = await Promise.all([
      vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
        'vscode.provideDocumentSemanticTokensLegend',
        targetUri,
      ),
      vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentSemanticTokens', targetUri),
    ])

    if (!legend || !tokens) return undefined

    const tokenType = findTokenTypeAtPosition(tokens, legend, targetPos.line, targetPos.character)
    this.output.appendLine(`[semantic] ${targetPos.line}:${targetPos.character} → ${tokenType ?? 'unknown'}`)

    return tokenType
  }

  async resolveByQuickInfo(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
    const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider',
      document.uri,
      position,
    )

    if (!definitions || definitions.length === 0) return undefined

    const def = definitions[0]
    const targetUri = 'targetUri' in def ? def.targetUri : def.uri
    const targetRange = 'targetUri' in def ? (def.targetSelectionRange ?? def.targetRange) : def.range
    const targetPos = targetRange.start

    if (targetUri.scheme !== 'file') return undefined

    this.output.appendLine(
      `[quickinfo] ${position.line}:${position.character} → def ${targetUri.fsPath}:${targetPos.line}:${targetPos.character}`,
    )

    const result = await vscode.commands.executeCommand<QuickInfoResponse>('typescript.tsserverRequest', 'quickinfo', {
      file: targetUri.fsPath,
      line: targetPos.line + 1,
      offset: targetPos.character + 1,
    })

    const kind = result?.body?.kind
    if (!kind) return undefined

    this.output.appendLine(`[quickinfo] ${position.line}:${position.character} → ${kind}`)
    return kind
  }
}
