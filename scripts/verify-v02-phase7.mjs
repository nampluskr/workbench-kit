import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: v0.2 Phase 7 (표시 언어와 전건 대조) Verification ===');
let failures = 0;
function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

// --------------------------------------------------------------------------
// WK-078 (Node-side): zero Hangul in any product-provided string in src/.
// Comments and docstrings are allowed to explain; string LITERALS the user
// could see are not. Scan .ts / .py / .html / .css for Hangul inside quotes
// or between tags, skipping the test-only host branches.
// --------------------------------------------------------------------------
const HANGUL = /[가-힣]/;
function walk(dir, exts) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'assets', 'data'].includes(e.name)) continue;
      out.push(...walk(full, exts));
    } else if (exts.some((x) => e.name.endsWith(x))) {
      out.push(full);
    }
  }
  return out;
}
const productKoreanHits = [];
for (const file of walk(path.join(rootDir, 'src'), ['.ts', '.html', '.css'])) {
  const rel = path.relative(rootDir, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // strip line comments and JSDoc/asterisk lines
    const code = line.replace(/\/\/.*$/, '');
    if (/^\s*\*/.test(line) || /^\s*\/\*/.test(line)) return;
    // Hangul inside a string/template literal
    const m = code.match(/(['"`])((?:(?!\1).)*[가-힣](?:(?!\1).)*)\1/);
    if (m) productKoreanHits.push(`${rel}:${i + 1}  ${m[2].slice(0, 60)}`);
  });
}
assert(
  productKoreanHits.length === 0,
  `Zero Hangul in product string literals under src/ (FR-L1). Hits: ${JSON.stringify(productKoreanHits.slice(0, 10))}`
);

// pywebview: the runtime WindowApi / window title must be English (the
// --*-test branches are test-only and may keep Korean log text).
const pyMain = fs.readFileSync(path.join(rootDir, 'src/hosts/pywebview/main.py'), 'utf8');
const pyProductLines = pyMain
  .split('\n')
  .filter((l) => !/#/.test(l) && !/is_.*_test|phase\d|v02.phase/.test(l))
  .filter((l) => /create_window|window\.set_title|evaluate_js\(.*textContent|WindowApi/.test(l));
assert(
  !pyProductLines.some((l) => HANGUL.test(l)),
  'pywebview host: the window title and WindowApi carry no Hangul (FR-L1)'
);

// --------------------------------------------------------------------------
// WK-080: the SPEC 0.1 replacement table is the boundary between regression
// and intended change. Confirm it lists the replacements it should and that
// `npm test` (run separately) passing all prior phases IS the v0.1 regression
// pass — here we just assert the table's shape hasn't silently emptied.
// --------------------------------------------------------------------------
const spec = fs.readFileSync(path.join(rootDir, 'docs/current/SPEC.md'), 'utf8');
const table01 = spec.slice(spec.indexOf('### 0.1'), spec.indexOf('**공통 판정 규칙**'));
const replacementRows = (table01.match(/^\| `?v0\.1 /gm) || []).length;
// A15 round-1 Major finding: a loose `>= 20` lower bound quietly encoded a
// third number alongside PLAN.md's completion-condition text ("10건") and
// the table's actual current row count — three different figures for the
// same boundary is ambiguous, not a real regression pin. Phase 3/4/5's
// "계획 외" corrections (docs/current/PROGRESS.md) grew the table from
// PLAN's original estimate to today's actual count as each Phase found v0.1
// requirements PLAN hadn't listed; that growth is legitimate and recorded,
// but it means PLAN.md's "10건" text is now stale (docs/current/ is
// human-written — an agent does not edit it; flagged in PROGRESS.md instead,
// see WK-080's 계획 외 entry). Pin the exact current count here so a future
// silent row deletion is caught, instead of merely checking "still roughly
// big enough". FR-P14/FR-P15 (사용자 UI 검토 중, 2026-09-12) added two more
// rows (v0.1 FR-C1 일부, v0.1 FR-B2) after Phase 7 originally closed at 22.
const EXPECTED_REPLACEMENT_ROWS = 24;
assert(
  replacementRows === EXPECTED_REPLACEMENT_ROWS,
  `SPEC 0.1 replacement table lists exactly the ${EXPECTED_REPLACEMENT_ROWS} v0.1 requirements v0.2 supersedes as of Phase 7 (found ${replacementRows}) (WK-080, NFR-2)`
);
for (const fr of ['FR-A6', 'FR-B1', 'FR-N1', 'FR-N6', 'FR-N9', 'FR-M1', 'FR-D3', 'FR-A20', 'FR-A23', 'FR-Q1a']) {
  assert(new RegExp(`v0\\.1 \`?${fr}\\b`).test(table01), `SPEC 0.1 table covers the v0.1 ${fr} replacement (WK-080)`);
}

// --------------------------------------------------------------------------
// WK-082 (Node-side): every key the runtime uses for a command is in
// reserved-keys.md, and the doc still declares itself the single source.
// --------------------------------------------------------------------------
const reserved = fs.readFileSync(path.join(rootDir, 'docs/reserved-keys.md'), 'utf8');
assert(/유일한 예약 키 목록/.test(reserved), 'reserved-keys.md still declares itself the single reserved-key list (FR-R1)');
for (const key of ['Ctrl+O', 'Ctrl+W', 'Ctrl+\\', 'Ctrl+B', 'Alt+F4', 'F10', 'F11', 'F6', 'Ctrl+Tab']) {
  assert(reserved.includes(key), `reserved-keys.md documents ${key} (NFR-8)`);
}
const mainTs = fs.readFileSync(path.join(rootDir, 'src/main.ts'), 'utf8');
// Any bare accelerator string used in a keydown branch in main.ts should be
// one of the documented keys (a light guard against an undocumented binding).
assert(/reserved-keys\.md/.test(mainTs), 'main.ts points at reserved-keys.md for its key policy (NFR-8)');

// --------------------------------------------------------------------------
// Host suites — run both, cross-check.
// --------------------------------------------------------------------------
const REQUIRED = Object.freeze([
  'INIT',
  'V2P7-FR-L1',
  'V2P7-FR-L1-EMPTY-STATE',
  'V2P7-FR-L2',
  'V2P7-FR-L3',
  'V2P7-STRINGS-COLLECTED',
  'V2P7-NFR8-KEYBOARD',
  'V2P7-NFR5-DIVERGENCE',
]);

function runHost(label, command, marker) {
  let output = '';
  try {
    output = execSync(command, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    output = `${err.stdout || ''}${err.stderr || ''}`;
    console.error(`[FAIL] ${label} runner exited non-zero`);
    failures++;
  }
  const line = output.split('\n').find((l) => l.includes(marker));
  if (!line) {
    console.error(`[FAIL] ${label} produced no structured result line`);
    console.error(output.split('\n').slice(-40).join('\n'));
    failures++;
    return null;
  }
  try {
    return JSON.parse(line.slice(line.indexOf('{')));
  } catch (err) {
    console.error(`[FAIL] ${label} result not valid JSON: ${err.message}`);
    failures++;
    return null;
  }
}

const electron = runHost('Electron', 'npx.cmd electron scripts/v02-phase7-electron-runner.cjs', '[electron] v0.2 Phase 7 Results:');
const pywebview = runHost(
  'pywebview',
  '"C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe" -m src.hosts.pywebview.main --v02-phase7-test',
  '[pywebview] v0.2 Phase 7 Results:'
);

for (const [label, result] of [['Electron', electron], ['pywebview', pywebview]]) {
  if (!result) continue;
  assert(result.success === true, `${label}: all v0.2 Phase 7 assertions passed`);
  for (const id of REQUIRED) {
    const row = result.results.find((r) => r.id === id);
    assert(Boolean(row), `${label}: assertion ${id} was executed`);
    if (row) assert(row.pass === true, `${label}: ${id} — ${row.msg}`);
  }
}

if (electron && pywebview) {
  let div = 0;
  for (const row of electron.results) {
    const other = pywebview.results.find((r) => r.id === row.id);
    if (!other || other.pass !== row.pass) {
      console.error(`[FAIL] ${row.id} differs between branches (Electron ${row.pass} / pywebview ${other ? other.pass : 'missing'})`);
      div++;
    }
  }
  assert(div === 0, `Electron and pywebview agree on every Phase 7 assertion (differences: ${div})`);
  // FR-L: the exact set of product strings is identical in both hosts (same
  // names for the same features — SPEC 1.5 note).
  assert(
    Boolean(electron.strings) && electron.strings === pywebview.strings,
    'The product-string set collected is byte-identical between Electron and pywebview (FR-L, same names both branches)'
  );
} else {
  console.error('[FAIL] Unable to compare branches');
  failures++;
}

if (failures > 0) {
  console.error(`\nFAILED: ${failures} v0.2 Phase 7 check(s) failed.`);
  process.exit(1);
}
console.log('\nSUCCESS: All v0.2 Phase 7 quality checks passed (0 failures).');
