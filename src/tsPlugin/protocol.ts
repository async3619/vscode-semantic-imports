export const RESPONSE_KEY = '__semanticImports'

export interface ResolveRequest {
  id: 'resolve'
}

export type PluginRequest = ResolveRequest

export interface ResolveResponse {
  id: 'resolve'
  isFunction: boolean
}

export interface ErrorResponse {
  id: 'error'
  error: { name: string; message: string; stack?: string }
}

export type PluginResponse = ResolveResponse | ErrorResponse
