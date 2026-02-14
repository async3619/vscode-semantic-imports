import * as vscode from 'vscode'
import type { SymbolColorMap } from './types'
import { parseThemeFile } from './utils/parseThemeFile'
import { extractSymbolColors } from './utils/extractSymbolColors'

interface ThemeContribution {
  id?: string
  label?: string
  uiTheme?: string
  path: string
}

interface DiscoveredTheme {
  extensionUri: vscode.Uri
  themePath: string
}

export class ThemeColorResolver {
  constructor(private readonly output: vscode.OutputChannel) {}

  async loadColors(): Promise<SymbolColorMap> {
    try {
      const theme = this.discoverActiveTheme()
      if (!theme) {
        this.output.appendLine('[theme] active theme not found')
        return {}
      }

      this.output.appendLine(`[theme] parsing theme at ${theme.themePath}`)
      const parsed = await parseThemeFile(theme.extensionUri, theme.themePath)
      if (!parsed) {
        this.output.appendLine('[theme] failed to parse theme file')
        return {}
      }

      const colors = extractSymbolColors(parsed)
      this.output.appendLine(`[theme] extracted colors: ${JSON.stringify(colors)}`)
      return colors
    } catch {
      this.output.appendLine('[theme] unexpected error loading colors')
      return {}
    }
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
        return { extensionUri: ext.extensionUri, themePath: match.path }
      }
    }

    return undefined
  }
}
