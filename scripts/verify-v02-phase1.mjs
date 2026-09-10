import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.2 Phase 1 (임시 자리와 확정) Verification ===');
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
 * Every assertion this phase owns lives in the host-neutral suite and is run
 * in both branches. What this file adds is the cross-branch comparison the
 * common judging rule requires (SPEC 0절): the same user action has to produce
 * the same result in Electron and in pywebview.
 */
const REQUIRED_V02_PHASE1_ASSERTIONS = Object.freeze([
  'INIT',
  'V2P1-FIXTURE',
  'V2P1-FR-P1',
  'V2P1-FR-P2',
  'V2P1-FR-P3',
  'V2P1-FR-P10',
  'V2P1-FR-P13-DRAG',
  'V2P1-FR-P13-REORDER',
  'V2P1-FR-P10-MERGE',
  'V2P1-FR-P4',
  'V2P1-FR-P8',
  'V2P1-FR-P5',
  'V2P1-FR-P6-FILE',
  'V2P1-FR-P6-FOLDER',
  'V2P1-DIRTY-PREVIEW',
  'V2P1-DIRTY-DBLCLICK',
  'V2P1-ALREADY-OPEN-NO-DIALOG',
  'V2P1-META-CLEARED',
  'V2P1-FR-T1',
  'V2P1-FR-T2',
  'V2P1-FR-P7-FRESH',
  'V2P1-FR-P7-PREVIEW',
  'V2P1-FR-T3',
]);

function runHost(label, command, resultMarker) {
  let output = '';
  let ok = true;
  try {
    output = execSync(command, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 240000 });
  } catch (err) {
    output = `${err.stdout || ''}${err.stderr || ''}`;
    ok = false;
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
  'npx.cmd electron scripts/v02-phase1-electron-runner.cjs',
  '[electron] v0.2 Phase 1 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v02-phase1-test',
  '[pywebview] v0.2 Phase 1 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.2 Phase 1 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(
    ids.length === REQUIRED_V02_PHASE1_ASSERTIONS.length,
    `${label}: executed exactly ${REQUIRED_V02_PHASE1_ASSERTIONS.length} assertions (got ${ids.length})`
  );
  for (const required of REQUIRED_V02_PHASE1_ASSERTIONS) {
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
  console.error(`\nFAILED: ${failures} v0.2 Phase 1 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.2 Phase 1 quality checks passed (0 failures).');
