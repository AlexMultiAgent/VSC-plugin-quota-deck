import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/index.js',
  banner: { js: '#!/usr/bin/env node' },
  // The SDK and zod stay normal dependencies; only the shared QuotaDeck
  // provider/core sources are bundled into the executable.
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
