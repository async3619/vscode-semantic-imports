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
const buildOptions = {
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

if (isWatch) {
  const ctx = await esbuild.context(buildOptions)
  await ctx.watch()
  console.log('[watch] Watching for changes...')
} else {
  await esbuild.build(buildOptions)
  console.log('[esbuild] build complete')
}
