import * as esbuild from 'esbuild'

const isWatch = process.argv.includes('--watch')

/** @type {import('esbuild').Plugin} */
const watchPlugin = {
  name: 'watch-notifier',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] Build started')
    })
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        console.log('[watch] Build finished successfully')
      } else {
        console.log('[watch] Build finished with errors')
      }
    })
  },
}

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  mainFields: ['module', 'main'],
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
  plugins: isWatch ? [watchPlugin] : [],
}

/** @type {import('esbuild').BuildOptions} */
const tsPluginOptions = {
  entryPoints: ['src/tsPlugin/index.ts'],
  bundle: true,
  outfile: 'dist/tsPlugin.js',
  external: [],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
  plugins: isWatch ? [watchPlugin] : [],
}

if (isWatch) {
  const [extCtx, pluginCtx] = await Promise.all([esbuild.context(extensionOptions), esbuild.context(tsPluginOptions)])
  await Promise.all([extCtx.watch(), pluginCtx.watch()])
  console.log('[watch] Watching for changes...')
} else {
  await Promise.all([esbuild.build(extensionOptions), esbuild.build(tsPluginOptions)])
  console.log('[esbuild] build complete')
}
