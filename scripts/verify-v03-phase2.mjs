import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.3 Phase 2 (탭 조작: 닫기 · 정렬 · 표시 별칭) Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

const REQUIRED_V03_PHASE2_ASSERTIONS = Object.freeze([
  'V3P2-FIXTURE',
  'V3P2-CLOSE-BTN-EXISTS',
  'V3P2-CLOSE-BTN-HIDDEN-AT-REST',
  'V3P2-CLOSE-BTN-KEYBOARD',
  'V3P2-CLOSE-INACTIVE-KEEPS-ACTIVE',
  'V3P2-CLOSE-NO-FS-CHANGE',
  'V3P2-CLOSE-ACTIVE-PICKS-NEIGHBOR',
  'V3P2-CLOSE-LAST-EMPTIES',
  'V3P2-CLOSE-ACTIVE-PICKS-BELOW',
  'V3P2-DRAG-INITIAL-ORDER',
  'V3P2-DRAG-SHOWS-INDICATOR',
  'V3P2-DRAG-REORDERS',
  'V3P2-DRAG-INDICATOR-CLEARED',
  'V3P2-DRAG-CANCEL-NO-REORDER',
  'V3P2-DRAG-OUTSIDE-RAIL-NO-REORDER',
  'V3P2-RENAME-DISABLED-EMPTY',
  'V3P2-RENAME-ENABLED-ACTIVE',
  'V3P2-RENAME-OPENS-INPUT',
  'V3P2-F2-NOT-BOUND',
  'V3P2-RENAME-ESCAPE-CANCELS',
  'V3P2-RENAME-ENTER-SAVES',
  'V3P2-ALIAS-KEEPS-PATH',
  'V3P2-RENAME-CONFIRM-UNCHANGED-NO-ALIAS',
  'V3P2-RENAME-CLOSE-BTN-AVAILABLE',
  'V3P2-RENAME-DRAFT-SURVIVES-EXTERNAL-RENDER',
  'V3P2-SLOT-BASELINE',
  'V3P2-ALIAS-FREES-SLOT',
  'V3P2-ALIAS-CLEAR-REACQUIRES',
  'V3P2-RAIL-OVERFLOWS',
  'V3P2-RAIL-SCROLLS-INDEPENDENTLY',
  'V3P2-CLOSE-DURING-LOAD-CLEARS-PROGRESS',
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
  'npx.cmd electron scripts/v03-phase2-electron-runner.cjs',
  '[electron] v0.3 Phase 2 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v03-phase2-test',
  '[pywebview] v0.3 Phase 2 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.3 Phase 2 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(
    ids.length === REQUIRED_V03_PHASE2_ASSERTIONS.length,
    `${label}: executed exactly ${REQUIRED_V03_PHASE2_ASSERTIONS.length} assertions (got ${ids.length})`
  );
  for (const required of REQUIRED_V03_PHASE2_ASSERTIONS) {
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
  console.error(`\nFAILED: ${failures} v0.3 Phase 2 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.3 Phase 2 quality checks passed (0 failures).');
