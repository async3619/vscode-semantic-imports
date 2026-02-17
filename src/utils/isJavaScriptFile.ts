export function isJavaScriptFile(fsPath: string): boolean {
  return /\.(m|c)?js$/.test(fsPath)
}
