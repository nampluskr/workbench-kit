import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.2 Phase 6 (테마 · 아이콘 · 치수) Verification ===');
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
  'V2P6-FR-D1',
  'V2P6-FR-D2',
  'V2P6-FR-D3',
  'V2P6-FR-X10',
  'V2P6-FR-X11',
  'V2P6-FR-X12',
  'V2P6-FR-X13',
  'V2P6-FR-X14',
]);

// FR-D3: the comparison doc gained a common-dimensions divergence row, and
// the "how to read" summary counts it among the intentional divergences (so
// the divergence total is higher than the v0.1 list it enumerates).
const currentDoc = fs.readFileSync(path.join(rootDir, 'docs/vscode-comparison.md'), 'utf8');
assert(
  /## 6\. 공통 치수/.test(currentDoc) && /30 CSS px/.test(currentDoc) &&
    /의도적 다름 \(공통 치수\)/.test(currentDoc) && /D-7/.test(currentDoc),
  'docs/vscode-comparison.md §6 marks the uniform 30px chrome as an intentional divergence, citing D-7 (FR-D3)'
);
assert(
  /§6-1\(공통 30px 치수[\s\S]{0,40}D-7/.test(currentDoc) && /새로 생긴 "?의도적 다름"?[\s\S]{0,80}§6-1/.test(currentDoc),
  'the "how to read" summary enumerates §6-1 among the intentional divergences and marks it a v0.2 addition — the divergence count grew vs v0.1 (FR-D3)'
);
const dimensionsCss = fs.readFileSync(path.join(rootDir, 'src/style.css'), 'utf8');
assert(
  /--area-size:\s*30px/.test(dimensionsCss) &&
    /--titlebar-height:\s*var\(--area-size\)/.test(dimensionsCss) &&
    /--statusbar-height:\s*var\(--area-size\)/.test(dimensionsCss) &&
    /--activitybar-width:\s*var\(--area-size\)/.test(dimensionsCss),
  'src/style.css derives title bar, status bar and activity bar from the single --area-size: 30px token (FR-D1, FR-D2)'
);

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
  'npx.cmd electron scripts/v02-phase6-electron-runner.cjs',
  '[electron] v0.2 Phase 6 Results:'
);
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v02-phase6-test',
  '[pywebview] v0.2 Phase 6 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.2 Phase 6 assertions passed`);
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
  console.error(`\nFAILED: ${failures} v0.2 Phase 6 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.2 Phase 6 quality checks passed (0 failures).');
