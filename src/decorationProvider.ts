import * as vscode from 'vscode'
import { parseImports } from './importParser'

// Colors from VS Code Light theme
const KIND_COLORS: Record<string, string> = {
  function: '#800000',
  class: '#008080',
  interface: '#008080',
  type: '#008080',
  enum: '#008080',
  namespace: '#008080',
  module: '#008080',
  variable: '#000080',
  const: '#000080',
  let: '#000080',
}

const DEFAULT_COLOR = '#000000'

const output = vscode.window.createOutputChannel('Semantic Imports')

const decorationTypes = new Map<string, vscode.TextEditorDecorationType>()

interface DocumentCache {
  importSectionText: string
  symbolKinds: Map<string, string>
}

const documentCaches = new Map<string, DocumentCache>()

function getDecorationType(color: string): vscode.TextEditorDecorationType {
  let type = decorationTypes.get(color)
  if (!type) {
    type = vscode.window.createTextEditorDecorationType({ color })
    decorationTypes.set(color, type)
  }
  return type
}

function extractContentText(content: vscode.MarkedString | vscode.MarkdownString): string {
  if (content instanceof vscode.MarkdownString) return content.value
  if (typeof content === 'string') return content
  return content.value
}

async function resolveSymbolKind(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<string | undefined> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    document.uri,
    position,
  )

  if (!hovers || hovers.length === 0) return undefined

  for (const hover of hovers) {
    for (const content of hover.contents) {
      const text = extractContentText(content)
      output.appendLine(`[hover] ${position.line}:${position.character} → ${text.slice(0, 200)}`)
      const match = text.match(/\(alias\)\s+(function|class|interface|type|enum|namespace|const|let|var|module)\b/)
      if (match) return match[1]
    }
  }

  return undefined
}

interface SymbolOccurrence {
  symbol: string
  range: vscode.Range
}

export async function applyImportDecorations(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document
  const text = document.getText()
  const { symbols, importEndLine } = parseImports(text)

  // Clear all existing decorations
  for (const type of decorationTypes.values()) {
    editor.setDecorations(type, [])
  }

  if (symbols.length === 0) return

  const escapedSymbols = symbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`\\b(${escapedSymbols.join('|')})\\b`, 'g')
  const occurrences: SymbolOccurrence[] = []

  for (let lineIndex = 0; lineIndex < importEndLine; lineIndex++) {
    const lineText = document.lineAt(lineIndex).text

    // Exclude the module specifier part (from '...' / from "...")
    const fromMatch = lineText.match(/\s+from\s+['"]/)
    const searchText = fromMatch ? lineText.slice(0, fromMatch.index) : lineText
    let match: RegExpExecArray | null

    pattern.lastIndex = 0
    while ((match = pattern.exec(searchText)) !== null) {
      const startPos = new vscode.Position(lineIndex, match.index)
      const endPos = new vscode.Position(lineIndex, match.index + match[0].length)
      occurrences.push({ symbol: match[0], range: new vscode.Range(startPos, endPos) })
    }
  }

  // Resolve kind for each unique symbol, using cache when possible
  const docUri = document.uri.toString()
  const importSectionText = text.split('\n').slice(0, importEndLine).join('\n')
  const cached = documentCaches.get(docUri)
  const symbolKinds = new Map<string, string>()
  const uniqueSymbols = [...new Set(occurrences.map((o) => o.symbol))]

  // Reuse cached kinds only if import section is unchanged
  const reusableCache = cached && cached.importSectionText === importSectionText ? cached.symbolKinds : null
  const symbolsToResolve: string[] = []

  for (const symbol of uniqueSymbols) {
    const kind = reusableCache?.get(symbol)
    if (kind) {
      symbolKinds.set(symbol, kind)
    } else {
      symbolsToResolve.push(symbol)
    }
  }

  if (symbolsToResolve.length > 0) {
    output.appendLine(`[cache] resolving ${symbolsToResolve.length}/${uniqueSymbols.length} symbols for ${docUri}`)

    await Promise.all(
      symbolsToResolve.map(async (symbol) => {
        try {
          const occurrence = occurrences.find((o) => o.symbol === symbol)
          if (!occurrence) return
          const kind = await resolveSymbolKind(document, occurrence.range.start)
          if (kind) symbolKinds.set(symbol, kind)
        } catch {
          // Hover provider may fail for this symbol; fall back to default color
        }
      }),
    )

    documentCaches.set(docUri, { importSectionText, symbolKinds: new Map(symbolKinds) })
  } else {
    output.appendLine(`[cache] full hit for ${docUri}`)
  }

  // Group ranges by color
  const rangesByColor = new Map<string, vscode.Range[]>()

  for (const { symbol, range } of occurrences) {
    const kind = symbolKinds.get(symbol)
    const color = kind ? (KIND_COLORS[kind] ?? DEFAULT_COLOR) : DEFAULT_COLOR
    const ranges = rangesByColor.get(color) ?? []
    ranges.push(range)
    rangesByColor.set(color, ranges)
  }

  // Apply decorations
  for (const [color, ranges] of rangesByColor) {
    editor.setDecorations(getDecorationType(color), ranges)
  }
}

export function clearDocumentCache(uri: string): void {
  documentCaches.delete(uri)
}

export function disposeDecorations(): void {
  for (const type of decorationTypes.values()) {
    type.dispose()
  }
  decorationTypes.clear()
  documentCaches.clear()
}
