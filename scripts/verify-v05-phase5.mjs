import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.3 Phase 5 (사라진 경로의 오류 상태) Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

const REQUIRED_V05_PHASE5_ASSERTIONS = Object.freeze([
  'V5P5-FIXTURE',
  'V5P5-DEAD-TAB-NOT-REMOVED',
  'V5P5-DEAD-TAB-HAS-ERROR',
  'V5P5-DEAD-ROW-ERROR-CLASS',
  'V5P5-DEAD-ROW-WARNING-ICON',
  'V5P5-DEAD-ROW-TITLE-IS-ERROR',
  'V5P5-EXPLORER-EMPTY-ON-ERROR',
  'V5P5-OTHER-TABS-STILL-WORK',
  'V5P5-RELOCATE-BTN-EXISTS',
  'V5P5-RELOCATE-SAME-TAB-ID',
  'V5P5-RELOCATE-CLEARS-ERROR',
  'V5P5-RELOCATE-LOADS-NEW-PATH',
  'V5P5-RELOCATE-ROW-CLEARS-ERROR-CLASS',
  'V5P5-INACTIVE-B-HAS-ERROR-BEFORE-RELOCATE',
  'V5P5-RELOCATE-INACTIVE-SYNCS-RAIL',
  'V5P5-RELOCATE-INACTIVE-SYNCS-EXPLORER',
  'V5P5-RELOCATE-INACTIVE-ONE-ACTIVE-ROW',
  'V5P5-RELOCATE-TO-ANOTHER-DEAD-PATH-STILL-ERRORS',
  'V5P5-CLOSE-ERROR-TAB',
  'V5P5-NO-FILESYSTEM-MUTATION',
  'V5P5-RESTORE-CLEARS-STALE-ERROR',
]);

function runHost(label, command, resultMarker) {
  let output = '';
  try {
    output = execSync(command, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 240000 });
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
  'npx.cmd electron scripts/v05-phase5-electron-runner.cjs',
  '[electron] v0.3 Phase 5 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v05-phase5-test',
  '[pywebview] v0.3 Phase 5 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.3 Phase 5 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(
    ids.length === REQUIRED_V05_PHASE5_ASSERTIONS.length,
    `${label}: executed exactly ${REQUIRED_V05_PHASE5_ASSERTIONS.length} assertions (got ${ids.length})`
  );
  for (const required of REQUIRED_V05_PHASE5_ASSERTIONS) {
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
  console.error(`\nFAILED: ${failures} v0.3 Phase 5 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.3 Phase 5 quality checks passed (0 failures).');
