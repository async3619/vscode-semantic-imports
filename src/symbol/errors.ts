export class TypeScriptServerNotLoadedError extends Error {
  constructor() {
    super('tsserver is still loading')
    this.name = 'TypeScriptServerNotLoadedError'
  }
}
