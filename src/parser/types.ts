export interface ImportStatement {
  /** Local name after alias resolution */
  localName: string
  /** Original imported name (same as localName if no alias, '*' for namespace) */
  importedName: string
  /** Module specifier (e.g. 'react', '~/foo/bar') */
  source: string
  /** Import kind */
  kind: 'named' | 'default' | 'namespace'
  /** Whether this is a type-only import */
  isTypeOnly: boolean
  /** Start line (0-based) */
  startLine: number
  /** Start column (0-based) */
  startColumn: number
  /** End line (0-based) */
  endLine: number
  /** End column (0-based) */
  endColumn: number
}
