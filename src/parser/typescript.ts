import type { ImportStatement } from './types'

export class TypeScriptParser {
  parseImports(text: string) {
    const lines = text.split('\n')
    const statements: ImportStatement[] = []
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
        let statement = lines[i]
        let endLine = i
        while (endLine < lines.length - 1 && !this.isImportComplete(statement)) {
          endLine++
          statement += '\n' + lines[endLine]
        }
        i = endLine + 1
        continue
      }

      // Stop at non-import lines
      if (!trimmed.startsWith('import ') && !trimmed.startsWith('import\t')) {
        break
      }

      // Collect the full import statement (may span multiple lines)
      const startLine = i
      let statement = lines[i]
      let endLine = i
      while (endLine < lines.length - 1 && !this.isImportComplete(statement)) {
        endLine++
        statement += '\n' + lines[endLine]
      }

      const source = this.extractModuleSpecifier(statement)
      if (source) {
        const isStatementTypeOnly = /^import\s+type\s/.test(statement.trim())
        const parsed = this.parseImportStatement(statement, startLine, lines, source, isStatementTypeOnly)
        statements.push(...parsed)
      }

      i = endLine + 1
    }

    return statements
  }

  private extractModuleSpecifier(statement: string) {
    const match = statement.match(/from\s+['"]([^'"]+)['"]/) ?? statement.match(/^import\s+['"]([^'"]+)['"]/)
    return match?.[1]
  }

  private isImportComplete(statement: string) {
    return /from\s+['"][^'"]*['"]/.test(statement) || /^import\s+['"][^'"]*['"]/.test(statement.trim())
  }

  private parseImportStatement(
    statement: string,
    startLine: number,
    lines: string[],
    source: string,
    isStatementTypeOnly: boolean,
  ) {
    const results: ImportStatement[] = []
    const normalized = statement.replace(/\s+/g, ' ').trim()

    // Side-effect import: import 'module'
    if (/^import\s+['"]/.test(normalized)) {
      return results
    }

    // Remove "import" keyword and optional "type" keyword
    let rest = normalized.replace(/^import\s+(?:type\s+)?/, '')

    // Namespace import: * as name from '...'
    const namespaceMatch = rest.match(/^\*\s+as\s+(\w+)\s+from\s+/)
    if (namespaceMatch) {
      const localName = namespaceMatch[1]
      const pos = this.findSymbolPosition(localName, startLine, lines)
      results.push({
        localName,
        importedName: '*',
        source,
        kind: 'namespace',
        isTypeOnly: isStatementTypeOnly,
        ...pos,
      })
      return results
    }

    // Default import (possibly combined with named/namespace)
    const defaultMatch = rest.match(/^(\w+)\s*,?\s*/)
    if (defaultMatch && defaultMatch[1] !== 'from') {
      const localName = defaultMatch[1]
      const pos = this.findSymbolPosition(localName, startLine, lines)
      results.push({
        localName,
        importedName: localName,
        source,
        kind: 'default',
        isTypeOnly: isStatementTypeOnly,
        ...pos,
      })
      rest = rest.slice(defaultMatch[0].length)
    }

    // Namespace after default: , * as name from '...'
    const nsAfterDefault = rest.match(/^\*\s+as\s+(\w+)\s+from\s+/)
    if (nsAfterDefault) {
      const localName = nsAfterDefault[1]
      const pos = this.findSymbolPosition(localName, startLine, lines)
      results.push({
        localName,
        importedName: '*',
        source,
        kind: 'namespace',
        isTypeOnly: isStatementTypeOnly,
        ...pos,
      })
      return results
    }

    // Named imports: { Foo, Bar as Baz, type Qux }
    const namedMatch = rest.match(/\{([^}]*)\}/)
    if (namedMatch) {
      const items = namedMatch[1]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      for (const item of items) {
        const isInlineTypeOnly = /^type\s+/.test(item)
        const cleaned = item.replace(/^type\s+/, '')
        const asMatch = cleaned.match(/(\w+)\s+as\s+(\w+)/)

        let localName: string
        let importedName: string
        if (asMatch) {
          importedName = asMatch[1]
          localName = asMatch[2]
        } else {
          const nameMatch = cleaned.match(/^(\w+)$/)
          if (!nameMatch) {
            continue
          }
          localName = nameMatch[1]
          importedName = localName
        }

        const pos = this.findSymbolPosition(localName, startLine, lines)
        results.push({
          localName,
          importedName,
          source,
          kind: 'named',
          isTypeOnly: isStatementTypeOnly || isInlineTypeOnly,
          ...pos,
        })
      }
    }

    return results
  }

  private findSymbolPosition(symbolName: string, startLine: number, lines: string[]) {
    const escapedName = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\b${escapedName}\\b`)

    for (let line = startLine; line < lines.length; line++) {
      // Exclude the module specifier part (after from '...')
      const lineText = lines[line]
      const fromMatch = lineText.match(/\s+from\s+['"]/)
      const searchText = fromMatch ? lineText.slice(0, fromMatch.index) : lineText

      const match = pattern.exec(searchText)
      if (match) {
        return {
          startLine: line,
          startColumn: match.index,
          endLine: line,
          endColumn: match.index + symbolName.length,
        }
      }
    }

    return {
      startLine,
      startColumn: 0,
      endLine: startLine,
      endColumn: 0,
    }
  }
}
