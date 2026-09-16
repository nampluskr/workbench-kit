import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.2 Phase 5 (탐색기 구조) Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

const REQUIRED = Object.freeze([
  'INIT',
  'V2P5-FR-X1',
  'V2P5-FR-X2',
  'V2P5-FR-X3',
  'V2P5-FR-X4',
  'V2P5-FR-X5',
  'V2P5-FR-X5-KEYBOARD',
  'V2P5-FR-X6',
  'V2P5-FR-X7',
  'V2P5-FR-X8',
  'V2P5-FR-X9',
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
  'npx.cmd electron scripts/v02-phase5-electron-runner.cjs',
  '[electron] v0.2 Phase 5 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v02-phase5-test',
  '[pywebview] v0.2 Phase 5 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.2 Phase 5 assertions passed`);
  const ids = result.results.map((r) => r.id);
  assert(ids.length === REQUIRED.length, `${label}: executed exactly ${REQUIRED.length} assertions (got ${ids.length})`);
  for (const required of REQUIRED) {
    const row = result.results.find((r) => r.id === required);
    assert(Boolean(row), `${label}: assertion ${required} was executed`);
    if (row) assert(row.pass === true, `${label}: ${required} — ${row.msg}`);
  }
  for (const row of result.results.filter((r) => !REQUIRED.includes(r.id))) {
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
  console.error(`\nFAILED: ${failures} v0.2 Phase 5 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.2 Phase 5 quality checks passed (0 failures).');
