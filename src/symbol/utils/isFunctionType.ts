type TypeScript = typeof import('typescript')

export function isFunctionType(ts: TypeScript, typeText: string): boolean | undefined {
  const source = `type __t = ${typeText}`

  let sf: import('typescript').SourceFile
  try {
    sf = ts.createSourceFile('__check.ts', source, ts.ScriptTarget.Latest, false)
  } catch {
    return undefined
  }

  const stmt = sf.statements[0]
  if (!stmt || !ts.isTypeAliasDeclaration(stmt)) {
    return undefined
  }

  return classifyTypeNode(ts, stmt.type)
}

function classifyTypeNode(ts: TypeScript, node: import('typescript').TypeNode): boolean | undefined {
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) {
    return true
  }

  if (ts.isTypeLiteralNode(node)) {
    return node.members.some((m) => ts.isCallSignatureDeclaration(m) || ts.isConstructSignatureDeclaration(m))
  }

  if (ts.isTypeReferenceNode(node) || ts.isTypeQueryNode(node) || ts.isImportTypeNode(node)) {
    return undefined
  }

  if (ts.isParenthesizedTypeNode(node)) {
    return classifyTypeNode(ts, node.type)
  }

  return false
}
