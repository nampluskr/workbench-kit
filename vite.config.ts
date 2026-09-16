import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8'));

/**
 * The date shown in the title bar is the last code change (v0.2 FR-C8, D-4):
 * the date of the last commit, which is what tells someone who copied this
 * template which revision they have. A build date would change on every build
 * of unchanged code. Resolved once per build and shared by both host branches,
 * so no branch-specific configuration is involved (NFR-2).
 */
function lastCommitDate(): string {
  try {
    return execSync('git log -1 --format=%cs', { cwd: import.meta.dirname, encoding: 'utf8' }).trim();
  } catch {
    // A11 Major: a copy without Git metadata (a source archive) has no commit
    // to ask. The newest source file is then the closest thing to "the last
    // code change", and it keeps the shown date in its YYYY-MM-DD form.
    try {
      return newestSourceDate(path.resolve(import.meta.dirname, 'src'));
    } catch {
      return 'unknown';
    }
  }
}

function newestSourceDate(dir: string): string {
  let newest = 0;
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else newest = Math.max(newest, fs.statSync(entryPath).mtimeMs);
    }
  };
  walk(dir);
  if (newest === 0) throw new Error('no source files');
  const d = new Date(newest);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default defineConfig({
  base: './',
  define: {
    __WB_VERSION__: JSON.stringify(pkg.version),
    __WB_COMMIT_DATE__: JSON.stringify(lastCommitDate()),
  },
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
