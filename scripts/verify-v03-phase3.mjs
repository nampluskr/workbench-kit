import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.3 Phase 3 (레일 토글과 Explorer 연동) Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

const REQUIRED_V03_PHASE3_ASSERTIONS = Object.freeze([
  'V3P3-FIXTURE',
  'V3P3-ICON-EXISTS',
  'V3P3-ICON-AFTER-EXPLORER',
  'V3P3-ICON-CORRECT-GLYPH',
  'V3P3-MENU-ROW-EXISTS',
  'V3P3-MENU-ROW-LABEL',
  'V3P3-NO-SHORTCUT',
  'V3P3-RAIL-VISIBLE-INITIALLY',
  'V3P3-ICON-HIDES-RAIL',
  'V3P3-SIDEBAR-UNCHANGED-BY-RAIL-HIDE',
  'V3P3-MENU-UNCHECKS-WITH-ICON',
  'V3P3-MENU-SHOWS-RAIL',
  'V3P3-MENU-CHECKS-WITH-RAIL',
  'V3P3-EXPLORER-HIDES-INDEPENDENTLY',
  'V3P3-RAIL-UNCHANGED-BY-EXPLORER-HIDE',
  'V3P3-SELECT-TAB-AUTOSHOWS-EXPLORER-ON-ADD',
  'V3P3-EXPLORER-HIDDEN-BEFORE-RECLICK',
  'V3P3-RECLICK-ACTIVE-TAB-SHOWS-EXPLORER',
  'V3P3-EXPLORER-RESTORED-HIDDEN',
  'V3P3-RAIL-TOGGLE-PRESERVES-TABS',
  'V3P3-RAIL-VISIBILITY-NOT-PERSISTED',
  'V3P3-RAIL-VISIBLE-BEFORE-ZEN',
  'V3P3-ZEN-HIDES-RAIL',
  'V3P3-ZEN-EXIT-RESTORES-RAIL',
  'V3P3-EXISTING-TOGGLES-STILL-WORK',
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
    // Without this, a runner that never got far enough to run the suite
    // (e.g. fixture creation denied, a startup exception) printed nothing
    // but "no structured result line", indistinguishable from an actual
    // assertion failure (A3 R2 Minor finding).
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
  'npx.cmd electron scripts/v03-phase3-electron-runner.cjs',
  '[electron] v0.3 Phase 3 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v03-phase3-test',
  '[pywebview] v0.3 Phase 3 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.3 Phase 3 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(
    ids.length === REQUIRED_V03_PHASE3_ASSERTIONS.length,
    `${label}: executed exactly ${REQUIRED_V03_PHASE3_ASSERTIONS.length} assertions (got ${ids.length})`
  );
  for (const required of REQUIRED_V03_PHASE3_ASSERTIONS) {
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
  console.error(`\nFAILED: ${failures} v0.3 Phase 3 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.3 Phase 3 quality checks passed (0 failures).');
