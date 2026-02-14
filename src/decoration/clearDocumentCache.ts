import { documentCaches } from './state'

export function clearDocumentCache(uri: string): void {
  documentCaches.delete(uri)
}
