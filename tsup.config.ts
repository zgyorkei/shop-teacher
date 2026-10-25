import { defineConfig } from 'tsup';

// dist/ is committed: apps install this package straight from GitHub, and a
// committed build means they need no toolchain to do it.
export default defineConfig([
  {
    entry: { index: 'src/index.ts', 'gemini/index': 'src/gemini/index.ts', 'browser/index': 'src/browser/index.ts', 'measure/index': 'src/measure/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    // import.meta.url (the key store's createRequire) in the CommonJS build.
    shims: true,
    target: 'node20',
    clean: true,
    sourcemap: false,
    splitting: false,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
