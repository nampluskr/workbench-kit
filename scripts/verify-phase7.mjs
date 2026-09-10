import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: Phase 7 (Licenses, Baseline Docs, Full Cross-Reference) Quality Verification ===');
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
// 1. License completeness & attribution (FR-Q4, FR-Q5)
// --------------------------------------------------------------------------
console.log('\n--- 1. License Completeness & Attribution (FR-Q4, FR-Q5) ---');
const licensesDir = path.join(rootDir, 'licenses');
const requiredLicenseFiles = [
  'LICENSE-dockview-core.txt',
  'LICENSE-monaco-editor.txt',
  'LICENSE-codicons.txt',
  'LICENSE-CODE-codicons.txt',
  'LICENSE-seti-ui.txt',
  'LICENSE-vscode-icons.txt',
];
// Round-1 adversarial finding (Major): filename existence and 4-keyword
// presence both pass on an empty, truncated, or wrong-license file body, or
// on an About screen whose copyright holder silently drifts from
// licenses/README.md. Check actual license-family content per file, and
// cross-check About's holder strings against the same README values instead
// of independently re-typing them.
const requiredLicenseContent = {
  'LICENSE-dockview-core.txt': [/MIT License/, /Copyright \(c\) 2021 mathuo/],
  'LICENSE-monaco-editor.txt': [/MIT License/i, /Copyright \(c\) 2016.*Microsoft Corporation/],
  'LICENSE-codicons.txt': [/Attribution 4\.0/],
  'LICENSE-CODE-codicons.txt': [/MIT License/, /Copyright \(c\) Microsoft Corporation/],
  'LICENSE-seti-ui.txt': [/MIT License/i, /Copyright \(c\) 2014 Jesse Weed/],
  'LICENSE-vscode-icons.txt': [/MIT License/, /ShareAlike/],
};
for (const f of requiredLicenseFiles) {
  const fullPath = path.join(licensesDir, f);
  const exists = fs.existsSync(fullPath);
  assert(exists, `${f} exists in licenses/ (FR-Q4)`);
  if (!exists) continue;
  const body = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of requiredLicenseContent[f]) {
    assert(pattern.test(body), `${f} contains the expected license-family text matching ${pattern} — not empty/truncated/wrong-license (FR-Q4)`);
  }
}
const licensesReadme = fs.existsSync(path.join(licensesDir, 'README.md')) ? fs.readFileSync(path.join(licensesDir, 'README.md'), 'utf8') : '';
assert(
  licensesReadme.includes('dockview-core') && licensesReadme.includes('monaco-editor') && licensesReadme.includes('codicons') && licensesReadme.includes('seti-ui') && licensesReadme.includes('vscode-icons'),
  'licenses/README.md lists all 5 bundled items and what each is used for (FR-Q4)'
);

const aboutSource = fs.readFileSync(path.join(rootDir, 'src/core/about.ts'), 'utf8');
assert(
  aboutSource.includes('CC BY 4.0') && aboutSource.includes('CC BY-SA') && aboutSource.includes('codicons') && aboutSource.includes('vscode-icons'),
  'Help > 정보 (src/core/about.ts) source contains attribution text for both CC-licensed icon sets (FR-Q5)'
);
// Cross-check: the copyright holders About names must actually appear in
// licenses/README.md too, so the two cannot silently drift apart.
assert(
  aboutSource.includes('Microsoft Corporation') && licensesReadme.includes('Microsoft Corporation'),
  'About screen\'s codicons copyright holder ("Microsoft Corporation") matches licenses/README.md\'s listing, not an independently-typed value that could drift (FR-Q5)'
);
assert(
  aboutSource.includes('Roberto Huertas') && licensesReadme.includes('Roberto Huertas'),
  'About screen\'s vscode-icons copyright holder ("Roberto Huertas and vscode-icons contributors") matches licenses/README.md\'s listing, not an independently-typed value that could drift (FR-Q5)'
);

// --------------------------------------------------------------------------
// 2. Zero custom implementation of already-verified pieces (NFR-4)
// --------------------------------------------------------------------------
console.log('\n--- 2. Zero Custom Implementation of dockview / monaco / icon systems (NFR-4) ---');
// Round-1 adversarial finding (Major): a narrow class-name blocklist is
// trivially evaded by renaming. No static check can prove the *absence* of
// a reimplementation under an arbitrary name — that is an unbounded search.
// This section instead combines two signals that together are much harder
// to fake: (a) the real library's own top-level class is actually
// INSTANTIATED (not just imported and unused), and (b) a broader blocklist
// of naming/structural patterns a naive reimplementation would plausibly
// use, covering layout, editing, AND icon rendering (seti and vscode-icons
// both, not just seti as in round 1).
const editorSource = fs.readFileSync(path.join(rootDir, 'src/core/editor.ts'), 'utf8');
assert(editorSource.includes("from 'dockview-core'"), 'editor.ts imports from dockview-core (NFR-4)');
assert(/createDockview\s*\(/.test(editorSource), 'editor.ts actually calls dockview-core\'s own createDockview() factory (not merely imports the package unused) — the real library owns pane/tab/view lifecycle (NFR-4)');
const layoutReimplPattern = /class\s+\w*(PaneManager|SplitLayout|TabGroupManager|GridCoordinator|WorkspaceGroups|LayoutEngine|PanelGrid)\b/;
assert(!layoutReimplPattern.test(editorSource), 'editor.ts contains 0 custom classes matching common pane/tab/grid-layout reimplementation naming patterns (NFR-4)');

const texteditorSource = fs.readFileSync(path.join(rootDir, 'src/core/texteditor.ts'), 'utf8');
assert(texteditorSource.includes("from 'monaco-editor/editor/editor.api'"), 'texteditor.ts imports from monaco-editor (NFR-4)');
assert(/monaco\.editor\.create\s*\(/.test(texteditorSource), 'texteditor.ts actually calls monaco.editor.create() (not merely imports monaco unused) — the real library owns tokenizing/editing (NFR-4)');
const editorReimplPattern = /class\s+\w*(Tokenizer|Highlighter|CodeEditor|SyntaxColorizer|TextBuffer)\b/;
assert(!editorReimplPattern.test(texteditorSource), 'texteditor.ts contains 0 custom classes matching common editor/tokenizer reimplementation naming patterns (NFR-4)');

const iconReimplPattern = /<svg[\s\S]*?<path/;
for (const iconFile of ['src/icons/seti.ts', 'src/icons/vscode-icons.ts']) {
  const iconSource = fs.readFileSync(path.join(rootDir, iconFile), 'utf8');
  assert(!iconReimplPattern.test(iconSource), `${iconFile} contains 0 inline hand-drawn SVG path data (NFR-4)`);
}
assert(
  fs.existsSync(path.join(rootDir, 'src/icons/data/seti.json')) && fs.existsSync(path.join(rootDir, 'src/icons/assets/seti.woff')),
  'seti resolver uses the real bundled seti-ui icon font + mapping data, not hand-drawn icon glyphs (NFR-4)'
);
const vscodeIconsAssetDir = path.join(rootDir, 'src/icons/assets/vscode-icons');
assert(
  fs.existsSync(vscodeIconsAssetDir) && fs.readdirSync(vscodeIconsAssetDir).filter((f) => f.endsWith('.svg')).length > 100,
  'vscode-icons resolver uses the real bundled vscode-icons SVG asset set (100+ files), not a small hand-drawn subset (NFR-4)'
);

// --------------------------------------------------------------------------
// 2b. FR-N3 (window edge resize) — structural check of the host's
//     `resizable` window-creation flag. This is genuinely the entire
//     workbench-kit-owned surface for this FR: native edge-resize itself is
//     OS chrome with 0 JS event path to intercept or synthesize, so there is
//     nothing further to test at the browser-suite level (same accepted
//     class of limitation as FR-N2's real drag, already established in A4
//     for real drag-and-drop). Replaces a round-1 hardcoded `true` in
//     phase7-suite.js with an actual source check (Critical finding).
// --------------------------------------------------------------------------
console.log('\n--- 2b. FR-N3 Window Resizability (structural) ---');
const electronMainSource = fs.readFileSync(path.join(rootDir, 'src/hosts/electron/main.cjs'), 'utf8');
assert(!/resizable\s*:\s*false/.test(electronMainSource), "Electron's BrowserWindow is not created with resizable: false (FR-N3)");
const pywebviewMainSource = fs.readFileSync(path.join(rootDir, 'src/hosts/pywebview/main.py'), 'utf8');
assert(!/resizable\s*=\s*False/.test(pywebviewMainSource), "pywebview's create_window is not called with resizable=False (FR-N3)");

// --------------------------------------------------------------------------
// 3. VS Code baseline comparison doc (FR-R2, NFR-3)
// --------------------------------------------------------------------------
console.log('\n--- 3. VS Code Baseline Comparison Doc (FR-R2, NFR-3) ---');
const comparisonPath = path.join(rootDir, 'docs/vscode-comparison.md');
assert(fs.existsSync(comparisonPath), 'docs/vscode-comparison.md exists (FR-R2)');
const comparisonText = fs.existsSync(comparisonPath) ? fs.readFileSync(comparisonPath, 'utf8') : '';
for (const area of ['탐색기', '탭 (Tabs)', '분할 영역', '선택과 포커스', '키보드/마우스 조작']) {
  assert(comparisonText.includes(area), `vscode-comparison.md covers the "${area}" area (FR-R2)`);
}
// NFR-3 was amended (2026-09-09, Phase 7 A7 round 3) from "정확히 1개" to
// "every row honestly marked, feature-absence counts too" — there is no
// longer a single magic count to assert. Instead confirm every table-row
// divergence this doc now documents cites its backing decision, so the
// count can't silently regress to 0 (or drift without a paper trail).
const divergenceMarkerCount = (comparisonText.match(/의도적 다름/g) || []).length;
assert(divergenceMarkerCount >= 5, `vscode-comparison.md records multiple intentional divergences, not just Zen (found ${divergenceMarkerCount} mentions, NFR-3's 2026-09-09 revision)`);
assert(comparisonText.includes('Zen'), 'Zen mode is recorded as one of the divergences (NFR-3, D-12)');
for (const decisionId of ['D-5', 'D-13', 'D-20', 'D-22']) {
  assert(comparisonText.includes(decisionId), `vscode-comparison.md cites ${decisionId} as backing for one of its non-Zen divergences (NFR-3)`);
}

// --------------------------------------------------------------------------
// 4. Checklist doc splitting check types (FR-R3)
// --------------------------------------------------------------------------
console.log('\n--- 4. Checklist Doc — Implementation-Detail vs User-Behavior Checks (FR-R3) ---');
const checklistPath = path.join(rootDir, 'docs/checklist.md');
assert(fs.existsSync(checklistPath), 'docs/checklist.md exists (FR-R3)');
const checklistText = fs.existsSync(checklistPath) ? fs.readFileSync(checklistPath, 'utf8') : '';
// FR-R3 was amended (2026-09-09, Phase 7 A7 round 3) to require exactly
// these 3 categories (was 2) once the honest "로직 수준 시뮬레이션"
// reclassification was accepted.
assert(
  checklistText.includes('사용자 행동 검사') && checklistText.includes('구현 세부 검사') && checklistText.includes('로직 수준 시뮬레이션'),
  'checklist.md names and defines all 3 check categories required by FR-R3 (사용자 행동 검사 · 구현 세부 검사 · 로직 수준 시뮬레이션)'
);

// --------------------------------------------------------------------------
// 5. 133-item FR matrix completeness (FR-H1, NFR-5, WK-041)
// --------------------------------------------------------------------------
console.log('\n--- 5. 133-Item FR Cross-Reference Matrix Completeness (FR-H1, NFR-5) ---');
// Reads the v0.1 SPEC snapshot, not docs/current/SPEC.md. This matrix is the
// v0.1 closing gate: it pairs v0.1's 133 requirements with the assertions that
// judge them, and both sides of that pairing are frozen in history. Pointing it
// at the current version would silently re-target it at a different contract
// (v0.2's SPEC lists only what v0.2 changes — see v0.2 SPEC 0절). The v0.2
// matrix is built by its own Phase 7 (WK-082).
const specText = fs.readFileSync(path.join(rootDir, 'docs/history/v0.1/SPEC.md'), 'utf8');
const specLines = specText.split('\n').slice(11, 247);
const allFrIds = [];
for (const line of specLines) {
  const m = line.match(/^\|\s*(FR-[A-Z][0-9]+[a-z]?)\s*(?:†\s*)?\|/);
  if (m) allFrIds.push(m[1]);
}
assert(allFrIds.length === 133, `SPEC.md section 1 contains exactly 133 FR rows (found ${allFrIds.length})`);

const matrixPath = path.join(rootDir, 'docs/phase7-fr-matrix.md');
assert(fs.existsSync(matrixPath), 'docs/phase7-fr-matrix.md exists (WK-041)');
const matrixText = fs.existsSync(matrixPath) ? fs.readFileSync(matrixPath, 'utf8') : '';
let missingFromMatrix = 0;
for (const fr of allFrIds) {
  const rowRegex = new RegExp(`\\|\\s*${fr}\\s*\\|`);
  if (!rowRegex.test(matrixText)) {
    console.error(`[FAIL] ${fr} has no row in phase7-fr-matrix.md`);
    missingFromMatrix++;
  }
}
assert(missingFromMatrix === 0, `Every one of the 133 SPEC FR IDs has a row in phase7-fr-matrix.md (missing: ${missingFromMatrix})`);

// Round-1 adversarial finding (Critical): the check above only proved an FR
// label appears somewhere in the doc — it never resolved the cited
// assertion IDs at all, so a fabricated/nonexistent citation (e.g.
// `P7-NOT-A-REAL-ASSERTION`) would pass silently. Parse every
// `scripts/phase{n}-suite.js:ID` citation out of the matrix and confirm
// that exact ID string is actually defined as a record() call in that file
// — a citation naming a real file+ID that never runs or never passes is
// still caught downstream by section 6/7's REQUIRED_PHASE{n}_ASSERTIONS
// manifests, which force every emitted ID to be declared, present, AND
// passing in both hosts.
console.log('\n--- 5b. Matrix Citations Resolve to Real, Existing Assertions ---');
const suiteFileCache = {};
function suiteFileContains(suiteFile, assertionId) {
  if (!(suiteFile in suiteFileCache)) {
    const p = path.join(rootDir, suiteFile);
    suiteFileCache[suiteFile] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }
  const src = suiteFileCache[suiteFile];
  if (src === null) return false;
  const idRegex = new RegExp(`record\\(\\s*['"\`]${assertionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  return idRegex.test(src);
}
// Round-2 adversarial finding (Critical): the round-1 parser only matched
// fully-qualified `scripts/phaseN-suite.js:ID` tokens — matrix rows that
// list several IDs from the same file as `` `file:ID1` `` · `` `ID2` `` ·
// `` `ID3` `` (bare tokens after the first qualified one) left ID2/ID3
// completely unchecked. Now every backtick-quoted token in a row is
// inspected: a qualified one sets the "current file" for that row, and any
// bare P{n}-FR-*-shaped token is resolved against that same file.
const matrixRows = matrixText.split('\n').filter((l) => /^\|\s*FR-/.test(l));
let unresolvedCitations = 0;
let checkedCitations = 0;
const bareIdPattern = /^P\d+-[A-Za-z0-9-]+$/;
for (const row of matrixRows) {
  const frMatch = row.match(/^\|\s*(FR-[A-Z][0-9]+[a-z]?)\s*\|/);
  const fr = frMatch ? frMatch[1] : '(unknown)';
  const tokens = row.match(/`([^`]+)`/g) || [];
  let currentFile = null;
  for (const t of tokens) {
    const raw = t.slice(1, -1);
    const qualified = raw.match(/^(scripts\/phase\d+-suite\.js):([A-Za-z0-9-]+)$/);
    if (qualified) {
      currentFile = qualified[1];
      checkedCitations++;
      if (!suiteFileContains(currentFile, qualified[2])) {
        console.error(`[FAIL] ${fr} cites ${currentFile}:${qualified[2]}, which does not exist as a record() call in that file`);
        unresolvedCitations++;
      }
      continue;
    }
    if (bareIdPattern.test(raw) && currentFile) {
      checkedCitations++;
      if (!suiteFileContains(currentFile, raw)) {
        console.error(`[FAIL] ${fr} cites ${currentFile}:${raw} (bare id in same row), which does not exist as a record() call in that file`);
        unresolvedCitations++;
      }
    }
  }
}
assert(checkedCitations > 100, `Matrix citation parser actually found and checked a substantial number of citations, including bare same-row ids (found ${checkedCitations}, expected 100+)`);
assert(unresolvedCitations === 0, `Every scripts/phase{n}-suite.js citation in phase7-fr-matrix.md resolves to a real record() call in that file (unresolved: ${unresolvedCitations})`);

// --------------------------------------------------------------------------
// 6. In-Browser Runtime Verification via Electron
// --------------------------------------------------------------------------
console.log('\n--- 6. Executing In-Browser Runtime Verification via Electron ---');
const runnerPath = path.join(__dirname, 'phase7-electron-runner.cjs');

let electronResults = null;
try {
  const runnerOutput = execSync(`npx.cmd electron "${runnerPath}"`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 40000,
  }).toString();

  for (const line of runnerOutput.split(/\r?\n/)) {
    if (line.startsWith('[PASS]')) console.log(line);
    else if (line.startsWith('[FAIL]')) { console.error(line); failures++; }
  }
  const match = runnerOutput.match(/\[electron\] Phase 7 Results:\s*(\{.*\})/);
  if (match) electronResults = JSON.parse(match[1]);
  assert(runnerOutput.includes('All Phase 7 Electron in-browser runtime assertions executed successfully'), 'Electron test runner completed all assertions successfully');
} catch (err) {
  console.error(`[FAIL] Electron test runner failed: ${err.message}`);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  failures++;
}

// --------------------------------------------------------------------------
// 7. In-Browser Runtime Verification via pywebview & Cross-Host Parity
// --------------------------------------------------------------------------
console.log('\n--- 7. Executing In-Browser Runtime Verification via pywebview & Cross-Host Parity ---');

function findPython() {
  if (process.env.WORKBENCH_PYTHON && fs.existsSync(process.env.WORKBENCH_PYTHON)) {
    return process.env.WORKBENCH_PYTHON;
  }
  const winpythonPath = 'C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe';
  if (fs.existsSync(winpythonPath)) return winpythonPath;
  try {
    const which = execSync('where python', { stdio: 'pipe' }).toString().trim().split(/\r?\n/)[0];
    if (which && fs.existsSync(which)) return which;
  } catch {}
  return 'python';
}

const pythonExecutable = findPython();
let pywebviewResults = null;
try {
  const pyOutput = execSync(`"${pythonExecutable}" -m src.hosts.pywebview.main --phase7-test`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 40000,
  }).toString();

  for (const line of pyOutput.split(/\r?\n/)) {
    if (line.startsWith('[pywebview] Phase 7 Results:')) console.log(line);
  }
  const pyMatch = pyOutput.match(/\[pywebview\] Phase 7 Results:\s*(\{.*\})/);
  if (pyMatch) pywebviewResults = JSON.parse(pyMatch[1]);
  assert(pywebviewResults && pywebviewResults.success === true, 'pywebview test runner completed all assertions successfully');
} catch (err) {
  console.error(`[FAIL] pywebview test runner failed: ${err.message}`);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  failures++;
}

const REQUIRED_PHASE7_ASSERTIONS = Object.freeze([
  'INIT',
  'P7-FR-N1',
  'P7-FR-N2-STRUCTURAL',
  'P7-FR-N5',
  'P7-FR-N5-GROUPS',
  'P7-FR-N6',
  'P7-FR-N7',
  'P7-FR-N7-CHECKBOX-OFF',
  'P7-FR-N8',
  'P7-FR-N9',
  'P7-FR-N4-MINIMIZE-CLICK',
  'P7-FR-N4-MAXIMIZE-CLICK',
  'P7-FR-F1',
  'P7-FR-F2',
  'P7-FR-F4',
  'P7-FR-F4-REVERSE',
  'P7-FR-F3',
  'P7-FR-F7',
  'P7-FR-F5',
  'P7-FR-F6',
  'P7-FR-M1-MENU',
  'P7-FR-M1-ACTBAR',
  'P7-FR-M4',
  'P7-FR-A1',
  'P7-FR-Q1A',
  'P7-FR-Q1A-ROUNDTRIP',
  'P7-FR-Q1A-NOT-ON-ACTBAR',
  'P7-FR-Q2',
  'P7-FR-N9-PATH',
  'P7-FR-Q5',
  'P7-FR-A7',
  'P7-FR-A13',
  'P7-FR-A18',
  'P7-FR-A2',
  'P7-FR-A3',
  'P7-FR-A4',
  'P7-FR-A5',
  'P7-FR-A8',
  'P7-FR-A16',
  'P7-FR-A17',
  'P7-FR-A9',
  'P7-FR-A10',
  'P7-FR-A11',
  'P7-FR-A12',
  'P7-FR-A19',
  'P7-FR-A15',
  'P7-FR-A20',
  'P7-FR-A21',
  'P7-FR-A22-STATE',
  'P7-FR-A22-NEWROW',
  'P7-FR-A23-OPEN',
  'P7-FR-A23-COMMIT',
  'P7-FR-A23-CANCEL',
  'P7-FR-N6C',
  'P7-FR-G1',
]);

function validateHostContract(hostName, hostResults) {
  assert(hostResults && hostResults.success === true, `${hostName} suite completed with success: true`);
  const list = hostResults.results || [];
  assert(
    list.length === REQUIRED_PHASE7_ASSERTIONS.length,
    `${hostName} executed exact expected count (${list.length} vs expected ${REQUIRED_PHASE7_ASSERTIONS.length})`
  );

  const seen = new Set();
  for (const item of list) {
    assert(!seen.has(item.id), `No duplicate assertion IDs in ${hostName} (duplicate found: ${item.id})`);
    seen.add(item.id);
  }
  for (const reqId of REQUIRED_PHASE7_ASSERTIONS) {
    assert(seen.has(reqId), `Required assertion ${reqId} is present in ${hostName}`);
  }
  const reqSet = new Set(REQUIRED_PHASE7_ASSERTIONS);
  for (const item of list) {
    assert(reqSet.has(item.id), `Assertion ${item.id} in ${hostName} is defined in manifest`);
    assert(item.pass === true, `${hostName} assertion ${item.id} passed (${item.msg})`);
  }
}

if (electronResults) validateHostContract('Electron', electronResults);
if (pywebviewResults) validateHostContract('pywebview', pywebviewResults);

if (electronResults && pywebviewResults) {
  const eList = electronResults.results || [];
  const pList = pywebviewResults.results || [];
  assert(eList.length === pList.length, `Both hosts execute identical assertion count (${eList.length} vs ${pList.length})`);

  let divergences = 0;
  for (let i = 0; i < eList.length; i++) {
    const e = eList[i];
    const p = pList[i];
    if (e.id !== p.id || e.pass !== p.pass) {
      console.error(`[DIVERGENCE] Index ${i}: ID (${e.id} vs ${p.id}) | Pass (${e.pass} vs ${p.pass})`);
      divergences++;
      failures++;
    }
  }
  assert(divergences === 0, `Zero divergence between Electron and pywebview across all Phase 7 assertions (divergences: ${divergences})`);
} else {
  assert(false, 'Unable to compare host parity: one or both test runners failed to produce structured results');
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
console.log('\n----------------------------------------------------');
if (failures === 0) {
  console.log('SUCCESS: All Phase 7 quality checks passed (0 failures).');
  process.exit(0);
} else {
  console.error(`FAILURE: ${failures} check(s) failed.`);
  process.exit(1);
}
