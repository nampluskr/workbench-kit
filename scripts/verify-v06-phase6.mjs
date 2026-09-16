import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.3 Phase 6 (에디터 전환 모드) Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

const REQUIRED_V06_PHASE6_ASSERTIONS = Object.freeze([
  'V6P6-FIXTURE',
  'V6P6-MODE-STARTS-SHARED',
  'V6P6-MENU-ROWS-EXIST',
  'V6P6-SHARED-CHECKED-INITIALLY',
  'V6P6-NO-SHORTCUT',
  'V6P6-SHARED-EDITOR-UNCHANGED-ON-SWITCH',
  'V6P6-SHARED-EDITOR-SAME-ACROSS-BOTH-TABS',
  'V6P6-MODE-SWITCH-TO-WORKSPACE',
  'V6P6-FIRST-WORKSPACE-SEEDED-FROM-SHARED',
  'V6P6-NEW-WORKSPACE-TAB-STARTS-EMPTY',
  'V6P6-WORKSPACE-B-HAS-SPLIT',
  'V6P6-SWITCH-RESTORES-A-WORKSPACE',
  'V6P6-SWITCH-RESTORES-B-SPLIT-LAYOUT',
  'V6P6-SWITCH-BACK-TO-SHARED-RESTORES-SHARED-STATE',
  'V6P6-WORKSPACE-NOT-PERSISTED',
  'V6P6-FILE-CONTENT-DIRTY-BEFORE-SWITCH',
  'V6P6-FILE-CONTENT-SURVIVES-MODE-SWITCH',
  'V6P6-FILE-DIRTY-BASELINE-SURVIVES-MODE-SWITCH',
  'V6P6-FILE-DIRTY-BASELINE-SURVIVES-EDIT-UNDO-CYCLE',
  'V6P6-QUIT-SETUP-DIRTY-IN-A',
  'V6P6-QUIT-B-WORKSPACE-CLEAN',
  'V6P6-QUIT-DETECTS-HIDDEN-DIRTY-WORKSPACE',
  'V6P6-QUIT-SAVE-CHOICE-ACTUALLY-SAVES',
  'V6P6-QUIT-DISCARD-CHOICE-PROCEEDS-WITHOUT-SAVING',
  'V6P6-RACE-SETUP-STILL-MID-LOAD',
  'V6P6-MODE-SWITCH-DURING-LOAD-DOES-NOT-CORRUPT-TARGET',
  'V6P6-MODE-SWITCH-DURING-LOAD-ATTRIBUTES-TO-SOURCE',
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
    const tail = output.split('\n').slice(-40).join('\n').trim();
    if (tail) console.error(`[FAIL] ${label} runner output (last 40 lines):\n${tail}`);
    failures++;
  }
  const line = output.split('\n').find((l) => l.includes(resultMarker));
  if (!line) {
    console.error(`[FAIL] ${label} produced no structured result line`);
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
  'npx.cmd electron scripts/v06-phase6-electron-runner.cjs',
  '[electron] v0.3 Phase 6 Results:'
);
// An ISOLATED, fresh storage_path — not the default shared profile — so a
// previous run's cached HTTP response (now that pywebview genuinely
// persists across launches: private_mode=False, v0.3 Phase 4 fix) cannot
// serve a stale build's JS to this run and produce a false pass/fail.
const pyStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v06p6-py-'));
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v06-phase6-test',
  '[pywebview] v0.3 Phase 6 Results:',
  { WB_STORAGE_PATH_OVERRIDE: pyStorage }
);
rmSyncRetrying(pyStorage);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.3 Phase 6 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(
    ids.length === REQUIRED_V06_PHASE6_ASSERTIONS.length,
    `${label}: executed exactly ${REQUIRED_V06_PHASE6_ASSERTIONS.length} assertions (got ${ids.length})`
  );
  for (const required of REQUIRED_V06_PHASE6_ASSERTIONS) {
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
  console.error(`\nFAILED: ${failures} v0.3 Phase 6 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.3 Phase 6 quality checks passed (0 failures).');
