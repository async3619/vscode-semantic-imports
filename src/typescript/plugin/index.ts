import type tslib from 'typescript/lib/tsserverlibrary'
import { type PluginRequest, type PluginResponse, RESPONSE_KEY } from './protocol'

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

    proxy.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
      const possiblePayload = options?.triggerCharacter

      if (!possiblePayload || typeof possiblePayload === 'string') {
        return oldLS.getCompletionsAtPosition(fileName, position, options, formattingSettings)
      }

      const request = possiblePayload as unknown as PluginRequest

      const prior: tslib.CompletionInfo = {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      }

      try {
        const response = handleRequest(ts, oldLS, fileName, position, request)
        ;(prior as unknown as Record<string, unknown>)[RESPONSE_KEY] = response
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        const response: PluginResponse = {
          id: 'error',
          error: { name: error.name, message: error.message, stack: error.stack },
        }
        ;(prior as unknown as Record<string, unknown>)[RESPONSE_KEY] = response
      }

      return prior
    }

    return proxy
  }

  return { create }
}

function handleRequest(
  ts: TypeScript,
  ls: tslib.LanguageService,
  fileName: string,
  position: number,
  request: PluginRequest,
): PluginResponse {
  switch (request.id) {
    case 'resolve':
      return handleResolve(ts, ls, fileName, position)
  }
}

function handleResolve(ts: TypeScript, ls: tslib.LanguageService, fileName: string, position: number): PluginResponse {
  const program = ls.getProgram()
  if (!program) {
    return { id: 'error', error: { name: 'PluginError', message: 'no program' } }
  }

  const sourceFile = program.getSourceFile(fileName)
  if (!sourceFile) {
    return { id: 'error', error: { name: 'PluginError', message: 'no source file' } }
  }

  const typeChecker = program.getTypeChecker()
  const node = findTokenAtPosition(ts, sourceFile, position)
  if (!node) {
    return { id: 'error', error: { name: 'PluginError', message: 'no node' } }
  }

  const symbol = typeChecker.getSymbolAtLocation(node)
  if (!symbol) {
    return { id: 'error', error: { name: 'PluginError', message: 'no symbol' } }
  }

  const wasAlias = !!(symbol.flags & ts.SymbolFlags.Alias)
  let resolved = symbol
  if (wasAlias) {
    resolved = typeChecker.getAliasedSymbol(resolved)
  }

  const flags = resolved.flags
  const isVariable = !!(flags & (ts.SymbolFlags.BlockScopedVariable | ts.SymbolFlags.FunctionScopedVariable))

  let isCallable = false
  if (isVariable) {
    const type = typeChecker.getTypeOfSymbolAtLocation(resolved, node)
    isCallable = type.getCallSignatures().length > 0
  }

  return {
    id: 'resolve',
    isFunction: !!(flags & ts.SymbolFlags.Function) || (isVariable && isCallable),
    isClass: !!(flags & ts.SymbolFlags.Class),
    isInterface: !!(flags & ts.SymbolFlags.Interface),
    isType: !!(flags & ts.SymbolFlags.TypeAlias),
    isEnum: !!(flags & ts.SymbolFlags.Enum),
    isNamespace: !!(flags & ts.SymbolFlags.NamespaceModule),
    isVariable: isVariable && !isCallable,
    isNotReady: wasAlias && resolved.getName() === 'unknown',
    debug: {
      symbolFlags: flags,
      symbolName: resolved.getName(),
      wasAlias,
      aliasedFlags: wasAlias ? flags : null,
    },
  }
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
