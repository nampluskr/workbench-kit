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
  },
});

