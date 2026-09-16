import fs from 'fs';
import os from 'os';
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

/**
 * A just-exited WebView2/Chromium process can hold its profile files open
 * for a moment after the process itself has quit — plain rmSync throws
 * EBUSY in that window. maxRetries/retryDelay (Node's built-in Windows
 * EBUSY/ENOTEMPTY retry) rides that out instead of crashing the verifier.
 */
function rmSyncRetrying(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.error(`[FAIL] Could not clean up ${target}: ${err.message}`);
    failures++;
  }
}

function runHost(label, command, resultMarker, extraEnv) {
  let output = '';
  try {
    output = execSync(command, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 240000,
      env: { ...process.env, ...(extraEnv || {}) },
    });
  } catch (err) {
    output = `${err.stdout || ''}${err.stderr || ''}`;
    console.error(`[FAIL] ${label} runner exited non-zero`);
    failures++;
  }
  const line = output.split('\n').find((l) => l.includes(resultMarker));
  if (!line) {
    console.error(`[FAIL] ${label} produced no structured result line`);
    // Without this, a runner that never got far enough to run the suite
    // printed nothing but "no structured result line", indistinguishable
    // from an actual assertion failure (A3 R2 Minor finding).
    const tail = output.split('\n').slice(-40).join('\n').trim();
    if (tail) console.error(`[FAIL] ${label} runner output (last 40 lines):\n${tail}`);
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
// An ISOLATED, fresh storage_path — not the default shared profile — so a
// previous run's cached HTTP response (now that pywebview genuinely
// persists across launches: private_mode=False, v0.3 Phase 4 fix) cannot
// serve a stale build's JS to this run and produce a false pass/fail.
const pyStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v03p2-py-'));
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v03-phase2-test',
  '[pywebview] v0.3 Phase 2 Results:',
  { WB_STORAGE_PATH_OVERRIDE: pyStorage }
);
rmSyncRetrying(pyStorage);

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
