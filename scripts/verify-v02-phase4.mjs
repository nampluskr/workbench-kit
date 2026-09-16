import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.2 Phase 4 (메뉴와 칸 수명) Verification ===');
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
const REQUIRED_V02_PHASE4_ASSERTIONS = Object.freeze([
  'INIT',
  'V2P4-FR-M1',
  'V2P4-FR-M2',
  'V2P4-FR-M3',
  'V2P4-FR-M11',
  'V2P4-FR-M4',
  'V2P4-FR-M6',
  'V2P4-FR-M12',
  'V2P4-FR-M8',
  'V2P4-FR-M7-LIST',
  'V2P4-FR-M7-REMOVE',
  'V2P4-FR-M7-KEYBOARD',
  'V2P4-FR-M7-EMPTY',
  'V2P4-FR-M9',
  'V2P4-FR-M5-CTRLO',
  'V2P4-FR-M5-CTRLW',
  'V2P4-FR-M5-ALTF4',
  'V2P4-FR-M5-F11',
  'V2P4-FR-M5-CTRLB',
  'V2P4-CAPTURE-KEYS',
  'V2P4-FR-M10-TAB',
  'V2P4-FR-M10-GROUP',
  'V2P4-FR-M10-ALL',
  'V2P4-FR-M10-CANCEL',
  'V2P4-FR-M10-ELSEWHERE',
  'V2P4-FR-P11-RIGHT',
  'V2P4-FR-P11-DOWN',
  'V2P4-FR-P12',
]);

function runHost(label, command, resultMarker) {
  let output = '';
  try {
    output = execSync(command, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    output = `${err.stdout || ''}${err.stderr || ''}`;
    console.error(`[FAIL] ${label} runner exited non-zero`);
    failures++;
  }
  const line = output.split('\n').find((l) => l.includes(resultMarker));
  if (!line) {
    console.error(`[FAIL] ${label} produced no structured result line`);
    console.error(output.split('\n').slice(-40).join('\n'));
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
  'npx.cmd electron scripts/v02-phase4-electron-runner.cjs',
  '[electron] v0.2 Phase 4 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v02-phase4-test',
  '[pywebview] v0.2 Phase 4 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.2 Phase 4 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(
    ids.length === REQUIRED_V02_PHASE4_ASSERTIONS.length,
    `${label}: executed exactly ${REQUIRED_V02_PHASE4_ASSERTIONS.length} assertions (got ${ids.length})`
  );
  for (const required of REQUIRED_V02_PHASE4_ASSERTIONS) {
    const row = result.results.find((r) => r.id === required);
    assert(Boolean(row), `${label}: assertion ${required} was executed`);
    if (row) assert(row.pass === true, `${label}: ${required} — ${row.msg}`);
  }
  for (const row of result.results.filter((r) => !REQUIRED_V02_PHASE4_ASSERTIONS.includes(r.id))) {
    assert(false, `${label}: unexpected assertion ${row.id} — ${row.msg}`);
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
  console.error(`\nFAILED: ${failures} v0.2 Phase 4 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.2 Phase 4 quality checks passed (0 failures).');
