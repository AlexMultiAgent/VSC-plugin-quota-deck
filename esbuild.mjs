import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: false,
  minify: !watch,
  logLevel: 'info',
};

const extension = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode'],
};

const webview = {
  ...shared,
  entryPoints: ['src/presentation/dashboard/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

if (watch) {
  const ctx = await esbuild.context(extension);
  const webCtx = await esbuild.context(webview);
  await ctx.watch();
  await webCtx.watch();
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
}
