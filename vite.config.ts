import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: /^dockview-core$/,
        replacement: path.resolve(import.meta.dirname, 'node_modules/dockview-core/dist/dockview-core.js'),
      },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 250000,
    rolldownOptions: {
      output: {
        // Keeps the single-JS-bundle golden set (FR-H2, NFR-2, A1): without
        // this, monaco's lazily loaded language modules (dynamic import())
        // would land as separate chunk files, breaking the exact dist file
        // set the two hosts are checked against.
        codeSplitting: false,
      },
    },
  },
});

