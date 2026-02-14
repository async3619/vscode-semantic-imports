export class TsServerLoadingError extends Error {
  constructor() {
    super('tsserver is still loading')
    this.name = 'TsServerLoadingError'
  }
}
