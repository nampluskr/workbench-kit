import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.3 Phase 1 (Folder Tabs 레일과 폴더 추가) Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

/**
 * Every assertion this phase owns lives in the host-neutral suite
 * (v03-phase1-suite.js) and is run in both branches. What this file adds is
 * the cross-branch comparison PLAN.md requires for every Phase: the same
 * user action has to produce the same result in Electron and in pywebview.
 */
const REQUIRED_V03_PHASE1_ASSERTIONS = Object.freeze([
  'V3P1-RAIL-EXISTS',
  'V3P1-RAIL-POSITION',
  'V3P1-HEADER-TITLE',
  'V3P1-HEADER-ICON-COUNT',
  'V3P1-HEADER-ICON-ORDER',
  'V3P1-RENAME-DISABLED-EMPTY',
  'V3P1-ADD-FIRST-TAB',
  'V3P1-ROOT-MATCHES',
  'V3P1-TAB-ROW-RENDERED',
  'V3P1-TAB-HOVER-PATH',
  'V3P1-TAB-LABEL-BARE',
  'V3P1-TAB-HAS-ICON',
  'V3P1-RENAME-ENABLED-ACTIVE',
  'V3P1-REOPEN-SAME-PATH-ADDS',
  'V3P1-REOPEN-ACTIVATES-NEW',
  'V3P1-NUMBER-SUFFIX',
  'V3P1-NUMBER-CASE-INSENSITIVE',
  'V3P1-TWO-ROWS-RENDERED',
  'V3P1-ONE-ACTIVE-ROW',
  'V3P1-ACTIVE-VISUAL-DISTINCT',
  'V3P1-CLICK-ACTIVATES',
  'V3P1-DISTINCT-PATH-BARE',
  'V3P1-OPEN-RECENT-ADDS',
  'V3P1-OPEN-RECENT-ACTIVATES',
  'V3P1-NO-LAST-FOLDER-KEY',
  'V3P1-RESTORE-IS-NOOP',
  'V3P1-NUMBER-SLOT-REUSE',
]);

function runHost(label, command, resultMarker) {
  let output = '';
  try {
    output = execSync(command, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 240000 });
  } catch (err) {
    output = `${err.stdout || ''}${err.stderr || ''}`;
    console.error(`[FAIL] ${label} runner exited non-zero`);
    failures++;
  }
  const line = output.split('\n').find((l) => l.includes(resultMarker));
  if (!line) {
    console.error(`[FAIL] ${label} produced no structured result line`);
    failures++;
    return null;
  }
  try {
    return JSON.parse(line.slice(line.indexOf('{')));
  } catch (err) {
    console.error(`[FAIL] ${label} result line was not valid JSON: ${err.message}`);
    failures++;
    return null;
  }
}

const electron = runHost(
  'Electron',
  'npx.cmd electron scripts/v03-phase1-electron-runner.cjs',
  '[electron] v0.3 Phase 1 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v03-phase1-test',
  '[pywebview] v0.3 Phase 1 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.3 Phase 1 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(
    ids.length === REQUIRED_V03_PHASE1_ASSERTIONS.length,
    `${label}: executed exactly ${REQUIRED_V03_PHASE1_ASSERTIONS.length} assertions (got ${ids.length})`
  );
  for (const required of REQUIRED_V03_PHASE1_ASSERTIONS) {
    const row = result.results.find((r) => r.id === required);
    assert(Boolean(row), `${label}: assertion ${required} was executed`);
    if (row) assert(row.pass === true, `${label}: ${required} — ${row.msg}`);
  }
}

if (electron && pywebview) {
  let divergences = 0;
  for (const row of electron.results) {
    const other = pywebview.results.find((r) => r.id === row.id);
    if (!other || other.pass !== row.pass) {
      console.error(`[FAIL] ${row.id} differs between branches (Electron ${row.pass} / pywebview ${other ? other.pass : 'missing'})`);
      divergences++;
    }
  }
  assert(divergences === 0, `Electron and pywebview agree on every assertion (differences: ${divergences})`);
} else {
  console.error('[FAIL] Unable to compare branches: one or both runners failed to produce results');
  failures++;
}

if (failures > 0) {
  console.error(`\nFAILED: ${failures} v0.3 Phase 1 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.3 Phase 1 quality checks passed (0 failures).');
