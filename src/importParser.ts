export interface ParsedImports {
  /** All unique imported symbol names (local names, after alias resolution) */
  symbols: string[]
  /** The 0-based line number where the body starts (first line after all imports) */
  importEndLine: number
}

export function parseImports(text: string) {
  const lines = text.split('\n')
  const symbols: string[] = []
  let importEndLine = 0
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    // Skip empty lines, single-line comments, block comment lines
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      i++
      continue
    }

    // Skip re-exports: export { ... } from '...'
    if (trimmed.startsWith('export ')) {
      // Collect full statement for multi-line re-exports
      let statement = lines[i]
      let endLine = i
      while (endLine < lines.length - 1 && !isImportComplete(statement)) {
        endLine++
        statement += '\n' + lines[endLine]
      }
      importEndLine = endLine + 1
      i = endLine + 1
      continue
    }

    // Stop at non-import lines
    if (!trimmed.startsWith('import ') && !trimmed.startsWith('import\t')) {
      break
    }

    // Collect the full import statement (may span multiple lines)
    let statement = lines[i]
    let endLine = i
    while (endLine < lines.length - 1 && !isImportComplete(statement)) {
      endLine++
      statement += '\n' + lines[endLine]
    }

    symbols.push(...parseImportStatement(statement))
    importEndLine = endLine + 1
    i = endLine + 1
  }

  return { symbols: [...new Set(symbols)], importEndLine }
}

function isImportComplete(statement: string) {
  return /from\s+['"][^'"]*['"]/.test(statement) || /^import\s+['"][^'"]*['"]/.test(statement.trim())
}

function parseImportStatement(statement: string) {
  const symbols: string[] = []
  const normalized = statement.replace(/\s+/g, ' ').trim()

  // Side-effect import: import 'module'
  if (/^import\s+['"]/.test(normalized)) {
    return []
  }

  // Remove "import" keyword and optional "type" keyword
  let rest = normalized.replace(/^import\s+(?:type\s+)?/, '')

  // Namespace import: * as name from '...'
  const namespaceMatch = rest.match(/^\*\s+as\s+(\w+)\s+from\s+/)
  if (namespaceMatch) {
    symbols.push(namespaceMatch[1])
    return symbols
  }

  // Default import (possibly combined with named/namespace)
  const defaultMatch = rest.match(/^(\w+)\s*,?\s*/)
  if (defaultMatch && defaultMatch[1] !== 'from') {
    symbols.push(defaultMatch[1])
    rest = rest.slice(defaultMatch[0].length)
  }

  // Namespace after default: , * as name from '...'
  const nsAfterDefault = rest.match(/^\*\s+as\s+(\w+)\s+from\s+/)
  if (nsAfterDefault) {
    symbols.push(nsAfterDefault[1])
    return symbols
  }

  // Named imports: { Foo, Bar as Baz, type Qux }
  const namedMatch = rest.match(/\{([^}]*)\}/)
  if (namedMatch) {
    const items = namedMatch[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    for (const item of items) {
      const cleaned = item.replace(/^type\s+/, '')
      const asMatch = cleaned.match(/(\w+)\s+as\s+(\w+)/)
      if (asMatch) {
        symbols.push(asMatch[2])
      } else {
        const nameMatch = cleaned.match(/^(\w+)$/)
        if (nameMatch) {
          symbols.push(nameMatch[1])
        }
      }
    }
  }

  return symbols
}
