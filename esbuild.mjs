import * as esbuild from 'esbuild'
import * as fs from 'fs'
import esbuildPluginTscModule from 'esbuild-plugin-tsc'
const { esbuildPluginTsc } = esbuildPluginTscModule

const isWatch = process.argv.includes('--watch')

const pluginDir = 'node_modules/semantic-imports-ts-plugin'

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

/** @type {import('esbuild').Plugin} */
const installTsPlugin = {
  name: 'install-ts-plugin',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        return
      }
      fs.mkdirSync(pluginDir, { recursive: true })
      fs.copyFileSync('tsPlugin/package.json', `${pluginDir}/package.json`)
      fs.copyFileSync('tsPlugin/index.js', `${pluginDir}/index.js`)
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
  keepNames: true,
  alias: { '@': './src' },
  plugins: [esbuildPluginTsc({ force: true }), ...(isWatch ? [watchPlugin] : [])],
}

/** @type {import('esbuild').BuildOptions} */
const tsPluginOptions = {
  entryPoints: ['src/typescript/plugin/index.ts'],
  bundle: true,
  outfile: 'tsPlugin/index.js',
  external: ['typescript', 'typescript/lib/tsserverlibrary'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
  keepNames: true,
  alias: { '@': './src' },
  plugins: isWatch ? [watchPlugin, installTsPlugin] : [installTsPlugin],
}

if (isWatch) {
  const [extCtx, pluginCtx] = await Promise.all([esbuild.context(extensionOptions), esbuild.context(tsPluginOptions)])
  await Promise.all([extCtx.watch(), pluginCtx.watch()])
  console.log('[watch] Watching for changes...')
} else {
  await Promise.all([esbuild.build(extensionOptions), esbuild.build(tsPluginOptions)])
  console.log('[esbuild] build complete')
}
