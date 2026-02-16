import * as vscode from 'vscode'
import { Logger } from '../logger'
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
  private readonly logger = Logger.create(ThemeColorResolver)

  async loadColors(): Promise<SymbolColorMap> {
    const theme = this.discoverActiveTheme()
    if (!theme) {
      this.logger.warn('no active theme found')
      return {}
    }

    this.logger.info(`loading colors from theme '${theme.themeName}'`)
    const parsed = await parseThemeFile(theme.extensionUri, theme.themePath)
    if (!parsed) {
      this.logger.warn(`failed to parse theme file for '${theme.themeName}'`)
      return {}
    }

    const colors = extractSymbolColors(parsed)
    const userOverrides = readUserColorCustomizations(theme.themeName)
    const merged = { ...colors, ...userOverrides }
    const kinds = Object.keys(merged)
    this.logger.info(`loaded ${kinds.length} symbol colors:`, kinds.join(', '))
    return merged
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
