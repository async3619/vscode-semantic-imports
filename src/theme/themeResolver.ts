import * as vscode from 'vscode'
import type { SymbolColorMap } from './types'
import { parseThemeFile } from './utils/parseThemeFile'
import { extractSymbolColors } from './utils/extractSymbolColors'
import { readUserColorCustomizations } from './utils/readUserColorCustomizations'

interface ThemeContribution {
  id?: string
  label?: string
  uiTheme?: string
  path: string
}

interface DiscoveredTheme {
  extensionUri: vscode.Uri
  themePath: string
  themeName: string
}

export class ThemeColorResolver {
  async loadColors(): Promise<SymbolColorMap> {
    const theme = this.discoverActiveTheme()
    if (!theme) {
      return {}
    }

    const parsed = await parseThemeFile(theme.extensionUri, theme.themePath)
    if (!parsed) {
      return {}
    }

    const colors = extractSymbolColors(parsed)
    const userOverrides = readUserColorCustomizations(theme.themeName)
    return { ...colors, ...userOverrides }
  }

  private discoverActiveTheme(): DiscoveredTheme | undefined {
    const themeName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme')
    if (!themeName) {
      return undefined
    }

    for (const ext of vscode.extensions.all) {
      const themes = ext.packageJSON?.contributes?.themes as ThemeContribution[] | undefined
      if (!themes) {
        continue
      }
      const match = themes.find((t) => t.id === themeName) ?? themes.find((t) => t.label === themeName)
      if (match) {
        return { extensionUri: ext.extensionUri, themePath: match.path, themeName }
      }
    }

    return undefined
  }
}
