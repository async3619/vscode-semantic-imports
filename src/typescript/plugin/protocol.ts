export const RESPONSE_KEY = '__semanticImports'

export interface ResolveRequest {
  id: 'resolve'
}

export type PluginRequest = ResolveRequest

export interface ResolveResponse {
  id: 'resolve'
  isFunction: boolean
  isClass: boolean
  isInterface: boolean
  isType: boolean
  isEnum: boolean
  isNamespace: boolean
  isVariable: boolean
  isNotReady: boolean
  debug: {
    symbolFlags: number
    symbolName: string
    wasAlias: boolean
    aliasedFlags: number | null
  }
}

export interface ErrorResponse {
  id: 'error'
  error: { name: string; message: string; stack?: string }
}

export type PluginResponse = ResolveResponse | ErrorResponse
