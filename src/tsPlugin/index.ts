import type tslib from 'typescript/lib/tsserverlibrary'
import { TAG_NAME } from './protocol'

type TypeScript = typeof tslib

function init(modules: { typescript: TypeScript }) {
  const ts = modules.typescript

  function create(info: tslib.server.PluginCreateInfo) {
    const proxy = Object.create(null) as tslib.LanguageService
    const oldLS = info.languageService

    for (const k of Object.keys(oldLS)) {
      const key = k as keyof tslib.LanguageService
      ;(proxy as unknown as Record<string, unknown>)[key] = (...args: unknown[]) =>
        (oldLS[key] as unknown as (...a: unknown[]) => unknown)(...args)
    }

    proxy.getQuickInfoAtPosition = (fileName, position) => {
      const prior = oldLS.getQuickInfoAtPosition(fileName, position)
      if (!prior) {
        return prior
      }

      const program = oldLS.getProgram()
      if (!program) {
        return prior
      }

      const sourceFile = program.getSourceFile(fileName)
      if (!sourceFile) {
        return prior
      }

      const typeChecker = program.getTypeChecker()
      const node = findTokenAtPosition(ts, sourceFile, position)
      if (!node) {
        return prior
      }

      const symbol = typeChecker.getSymbolAtLocation(node)
      if (!symbol) {
        return prior
      }

      const type = typeChecker.getTypeOfSymbolAtLocation(symbol, node)
      const isFunction = type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0

      const tag: tslib.JSDocTagInfo = {
        name: TAG_NAME,
        text: [{ kind: 'text', text: JSON.stringify({ isFunction }) }],
      }
      prior.tags = [...(prior.tags || []), tag]

      return prior
    }

    return proxy
  }

  return { create }
}

function findTokenAtPosition(ts: TypeScript, sourceFile: tslib.SourceFile, position: number): tslib.Node | undefined {
  function visit(node: tslib.Node): tslib.Node | undefined {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) {
      return undefined
    }

    let candidate: tslib.Node | undefined
    ts.forEachChild(node, (child) => {
      if (!candidate && child.getStart(sourceFile) <= position && position < child.getEnd()) {
        candidate = visit(child)
      }
    })

    return candidate || node
  }

  return visit(sourceFile)
}

export = init
