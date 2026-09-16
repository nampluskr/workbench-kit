import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.3 Phase 4 (폴더별 Explorer 상태 보존과 복원) Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

const REQUIRED_SINGLE_SESSION = Object.freeze([
  'V4P4-FIXTURE',
  'V4P4-SAME-PATH-STARTS-COLLAPSED',
  'V4P4-SWITCH-RESTORES-EXPANSION',
  'V4P4-SAME-PATH-INDEPENDENT',
  'V4P4-FIXTURE-ACTUALLY-SCROLLS',
  'V4P4-SELECTION-RESTORED',
  'V4P4-SCROLL-RESTORED',
  'V4P4-CLOSED-TAB-STATE-NOT-PERSISTED',
  'V4P4-CLOSED-ACTIVE-TAB-STATE-NOT-PERSISTED',
  'V4P4-OVERLAPPING-RESTORE-SAFE',
  'V4P4-SAME-TAB-REENTRANT-RESTORE-SAFE',
  'V4P4-COLLAPSED-ROOT-RESTORED',
]);

const REQUIRED_LAUNCH1 = Object.freeze([
  'V4P4-L1-THREE-TABS',
  'V4P4-L1-REORDERED',
  'V4P4-L1-C-EXPANDED',
  'V4P4-L1-C-SCROLLED',
  'V4P4-L1-A-ACTIVE-LAST',
]);

const REQUIRED_LAUNCH2 = Object.freeze([
  'V4P4-L2-TABS-RESTORED',
  'V4P4-L2-ORDER-RESTORED',
  'V4P4-L2-ALIAS-RESTORED',
  'V4P4-L2-ACTIVE-TAB-RESTORED',
  'V4P4-L2-EXPANSION-RESTORED',
  'V4P4-L2-SELECTION-RESTORED',
  'V4P4-L2-SCROLL-RESTORED',
]);

function runHostCommand(label, command, resultMarker, extraEnv) {
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

function checkRequired(label, result, required) {
  if (!result) return;
  assert(result.success === true, `${label}: all assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(ids.length === required.length, `${label}: executed exactly ${required.length} assertions (got ${ids.length})`);
  for (const id of required) {
    const row = result.results.find((r) => r.id === id);
    assert(Boolean(row), `${label}: assertion ${id} was executed`);
    if (row) assert(row.pass === true, `${label}: ${id} — ${row.msg}`);
  }
}

// ----------------------------------------------------------------------
// 1. Single-session suite (WK-098, WK-099), Electron then pywebview.
// ----------------------------------------------------------------------
const electronSingle = runHostCommand(
  'Electron (single-session)',
  'npx.cmd electron scripts/v04-phase4-electron-runner.cjs',
  '[electron] v0.3 Phase 4 single-session Results:'
);
checkRequired('Electron (single-session)', electronSingle, REQUIRED_SINGLE_SESSION);

const pyStorageSingle = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04p4-py-single-'));
try {
  const pywebviewSingle = runHostCommand(
    'pywebview (single-session)',
    '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v04-phase4-single-test',
    '[pywebview] v0.3 Phase 4 single-session Results:',
    { WB_STORAGE_PATH_OVERRIDE: pyStorageSingle }
  );
  checkRequired('pywebview (single-session)', pywebviewSingle, REQUIRED_SINGLE_SESSION);

  if (electronSingle && pywebviewSingle) {
    let divergences = 0;
    for (const row of electronSingle.results) {
      const other = pywebviewSingle.results.find((r) => r.id === row.id);
      if (!other || other.pass !== row.pass) {
        console.error(`[FAIL] ${row.id} differs between branches (Electron ${row.pass} / pywebview ${other ? other.pass : 'missing'})`);
        divergences++;
      }
    }
    assert(divergences === 0, `Electron and pywebview agree on every single-session assertion (differences: ${divergences})`);
  }
} finally {
  rmSyncRetrying(pyStorageSingle);
}

// ----------------------------------------------------------------------
// 2. Restart pair — real two-launch check, Electron then pywebview
//    (round-1 adversarial lesson from Phase 6, A8: a single-process
//    simulation cannot prove a restart claim; reuse a real shared profile
//    across two separate process launches instead).
// ----------------------------------------------------------------------
/**
 * Enough root-level files to actually overflow the Explorer's visible
 * height — a tiny fixture made `scrollTop` always clamp to 0, so the
 * scroll-restoration assertion could pass even with scroll persistence
 * removed entirely (A4 R1 Major finding).
 */
function makeFixture(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'inner.txt'), 'inner');
  for (let i = 0; i < 60; i++) {
    fs.writeFileSync(path.join(dir, `file-${String(i).padStart(2, '0')}.txt`), String(i));
  }
  return dir;
}

console.log('\n--- Restart pair: Electron (two real process launches, shared userData) ---');
const dirA = makeFixture('wb-v04p4-restart-A-');
const dirB = makeFixture('wb-v04p4-restart-B-');
const dirC = makeFixture('wb-v04p4-restart-C-');
const electronUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04p4-electron-userdata-'));
try {
  const commonEnv = {
    WB_P4_USERDATA_DIR: electronUserData,
    WB_P4_DIR_A: dirA,
    WB_P4_DIR_B: dirB,
    WB_P4_DIR_C: dirC,
  };
  const launch1 = runHostCommand(
    'Electron launch1',
    'npx.cmd electron scripts/v04-phase4-electron-runner.cjs',
    '[electron] v0.3 Phase 4 launch1 Results:',
    { ...commonEnv, WB_P4_MODE: 'launch1' }
  );
  checkRequired('Electron launch1', launch1, REQUIRED_LAUNCH1);

  const launch2 = runHostCommand(
    'Electron launch2',
    'npx.cmd electron scripts/v04-phase4-electron-runner.cjs',
    '[electron] v0.3 Phase 4 launch2 Results:',
    { ...commonEnv, WB_P4_MODE: 'launch2' }
  );
  checkRequired('Electron launch2', launch2, REQUIRED_LAUNCH2);
} finally {
  rmSyncRetrying(electronUserData);
  rmSyncRetrying(dirA);
  rmSyncRetrying(dirB);
  rmSyncRetrying(dirC);
}

console.log('\n--- Restart pair: pywebview (two real process launches, shared isolated storage_path) ---');
const dirA2 = makeFixture('wb-v04p4-pyrestart-A-');
const dirB2 = makeFixture('wb-v04p4-pyrestart-B-');
const dirC2 = makeFixture('wb-v04p4-pyrestart-C-');
const pyRestartStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04p4-py-restart-'));
try {
  const pyEnv = {
    WB_STORAGE_PATH_OVERRIDE: pyRestartStorage,
    WB_P4_DIR_A: dirA2,
    WB_P4_DIR_B: dirB2,
    WB_P4_DIR_C: dirC2,
  };
  const pyLaunch1 = runHostCommand(
    'pywebview launch1',
    '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v04-phase4-launch1-test',
    '[pywebview] v0.3 Phase 4 launch1 Results:',
    pyEnv
  );
  checkRequired('pywebview launch1', pyLaunch1, REQUIRED_LAUNCH1);

  const pyLaunch2 = runHostCommand(
    'pywebview launch2',
    '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v04-phase4-launch2-test',
    '[pywebview] v0.3 Phase 4 launch2 Results:',
    pyEnv
  );
  checkRequired('pywebview launch2', pyLaunch2, REQUIRED_LAUNCH2);
} finally {
  rmSyncRetrying(pyRestartStorage);
  rmSyncRetrying(dirA2);
  rmSyncRetrying(dirB2);
  rmSyncRetrying(dirC2);
}

if (failures > 0) {
  console.error(`\nFAILED: ${failures} v0.3 Phase 4 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.3 Phase 4 quality checks passed (0 failures).');
