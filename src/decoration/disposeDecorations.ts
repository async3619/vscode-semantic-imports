import { decorationTypes } from './state'

export function disposeDecorations(): void {
  for (const type of decorationTypes.values()) {
    type.dispose()
  }
  decorationTypes.clear()
}
