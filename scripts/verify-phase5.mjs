import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: Phase 5 (Extension Points) Quality Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

function extractComments(source) {
  const commentRegex = /\/\*[\s\S]*?\*\/|\/\/.*/g;
  return (source.match(commentRegex) || []).join('\n');
}
const koreanCharRegex = /[\uac00-\ud7a3]/;

// --------------------------------------------------------------------------
// 1. Core purity: no resource-kind branching in ANY src/core/*.ts file
//    (NFR-1, INTENT 3). Round-1 finding: a hand-picked file list and an
//    exact-lowercase-literal check both miss real violations. This instead
//    (a) walks every file under src/core/ recursively, and (b) flags the
//    actual hazard — branching keyed on a resource-kind string — rather
//    than the word's mere appearance (which pre-existing, already-reviewed
//    code legitimately uses: menu.ts's File/View/Help group ids, and
//    icontheme.ts's real codicon glyph names 'codicon-file'/'codicon-folder').
// --------------------------------------------------------------------------
console.log('\n--- 1. Core Purity: Zero Resource-Kind Branching in src/core/*.ts (NFR-1) ---');

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const coreDir = path.join(rootDir, 'src/core');
const coreFilePaths = listFilesRecursive(coreDir);
assert(coreFilePaths.length > 0, 'src/core contains at least one .ts file to check');

// Branching on a resource-kind string: equality (loose or strict, either
// direction) and `switch`/`case` labels, covering the round-2 finding that a
// `switch (kind) { case 'file': ... }` form was missed.
const RESOURCE_KIND_WORDS = '(file|folder|terminal|session)';
const kindBranchRegex = new RegExp(
  `(={2,3}|!={1,2})\\s*['"]${RESOURCE_KIND_WORDS}['"]` +
    `|['"]${RESOURCE_KIND_WORDS}['"]\\s*(={2,3}|!={1,2})` +
    `|case\\s*['"]${RESOURCE_KIND_WORDS}['"]`,
  'i'
);
// A literal extension-to-icon/language mapping table (FR-Q3): named
// extension-map variables, or an object literal keyed by dot-extensions
// (e.g. { '.md': 'markdown', '.py': 'python' }).
const extensionTableRegex = /extensionMap|fileExtensions|extensionToIcon|suffixIcons|['"]\.\w+['"]\s*:/i;

for (const filePath of coreFilePaths) {
  const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const src = fs.readFileSync(filePath, 'utf8');
  assert(!kindBranchRegex.test(src), `${rel} contains 0 resource-kind branches (e.g. kind === "file") (NFR-1)`);
  assert(!extensionTableRegex.test(src), `${rel} contains 0 extension-to-icon mapping tables (FR-Q3)`);
  assert(!koreanCharRegex.test(extractComments(src)), `${rel} comments are in English (0 Korean characters)`);
}

// --------------------------------------------------------------------------
// 2. App-facing surface: presets/registry never manipulate tabs/panes
//    directly (FR-I8, D-19). Only openItem/openBeside/queryPanePlacement
//    and registry.register are used.
// --------------------------------------------------------------------------
console.log('\n--- 2. App-Facing Surface: Zero Direct Tab/Pane Manipulation (FR-I8) ---');
const appLayerFiles = ['src/presets/file-preset.ts', 'src/presets/folder-preset.ts', 'src/registry/kind-registry.ts'];
const forbiddenDirectCalls = ['.closePanel(', '.closeActiveTab(', '.closeAllTabsInGroup(', '.addNewTab(', '.splitGroup(', '.splitActiveGroup('];
for (const rel of appLayerFiles) {
  const src = fs.readFileSync(path.join(rootDir, rel), 'utf8');
  for (const token of forbiddenDirectCalls) {
    assert(!src.includes(token), `${rel} contains 0 occurrences of direct manipulation call "${token}" (FR-I8)`);
  }
}
// The preset helpers must type against the narrow AppEditorSurface, not the
// full EditorController — otherwise the exposed surface is wide even though
// nothing currently calls the extra methods (FR-I8, C-9).
for (const rel of ['src/presets/file-preset.ts', 'src/presets/folder-preset.ts']) {
  const src = fs.readFileSync(path.join(rootDir, rel), 'utf8');
  assert(src.includes('AppEditorSurface') && !src.includes('EditorController'), `${rel} types its open-helper against AppEditorSurface, not the full EditorController (FR-I8)`);
}

// --------------------------------------------------------------------------
// 3. Reserved-key documentation exists exactly once (FR-R1)
// --------------------------------------------------------------------------
console.log('\n--- 3. Reserved-Key Documentation (FR-R1, FR-R1a) ---');
const reservedKeysPath = path.join(rootDir, 'docs/reserved-keys.md');
assert(fs.existsSync(reservedKeysPath), 'docs/reserved-keys.md exists (FR-R1)');
if (fs.existsSync(reservedKeysPath)) {
  const doc = fs.readFileSync(reservedKeysPath, 'utf8');
  for (const key of ['Ctrl+S', 'F2', 'Delete', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+C', 'Ctrl+V']) {
    assert(doc.includes(key), `docs/reserved-keys.md lists "${key}" as not reserved (FR-R1a)`);
  }
}

// --------------------------------------------------------------------------
// 4. CSS invariants: no tab-explorer-templates tokens leaked by new rules
// --------------------------------------------------------------------------
console.log('\n--- 4. CSS Invariants (C-10, D-29) ---');
const css = fs.readFileSync(path.join(rootDir, 'src/style.css'), 'utf8');
const forbiddenTokens = ['12px', '4px', '8px', '16px', '6px', '#353b44', 'Segoe UI', 'Cascadia Mono'];
for (const token of forbiddenTokens) {
  const isExactWord = /^[a-zA-Z0-9]/.test(token);
  const regex = isExactWord ? new RegExp(`\\b${token}\\b`, 'g') : new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const matches = css.match(regex);
  assert(!matches || matches.length === 0, `src/style.css contains 0 occurrences of "${token}"`);
}

// --------------------------------------------------------------------------
// 5. In-Browser Runtime Verification via Electron
// --------------------------------------------------------------------------
console.log('\n--- 5. Executing In-Browser Runtime Verification via Electron ---');
const runnerPath = path.join(__dirname, 'phase5-electron-runner.cjs');

let electronResults = null;
try {
  const runnerOutput = execSync(`npx.cmd electron "${runnerPath}"`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 35000,
  }).toString();

  const lines = runnerOutput.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('[PASS]')) {
      console.log(line);
    } else if (line.startsWith('[FAIL]')) {
      console.error(line);
      failures++;
    }
  }
  const match = runnerOutput.match(/\[electron\] Phase 5 Results:\s*(\{.*\})/);
  if (match) {
    electronResults = JSON.parse(match[1]);
  }
  assert(runnerOutput.includes('All Phase 5 Electron in-browser runtime assertions executed successfully'), 'Electron test runner completed all assertions successfully');
} catch (err) {
  console.error(`[FAIL] Electron test runner failed: ${err.message}`);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  failures++;
}

// --------------------------------------------------------------------------
// 6. In-Browser Runtime Verification via pywebview & Cross-Host Parity
// --------------------------------------------------------------------------
console.log('\n--- 6. Executing In-Browser Runtime Verification via pywebview & Cross-Host Parity ---');

function findPython() {
  if (process.env.WORKBENCH_PYTHON && fs.existsSync(process.env.WORKBENCH_PYTHON)) {
    return process.env.WORKBENCH_PYTHON;
  }
  const winpythonPath = 'C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe';
  if (fs.existsSync(winpythonPath)) {
    return winpythonPath;
  }
  try {
    const which = execSync('where python', { stdio: 'pipe' }).toString().trim().split(/\r?\n/)[0];
    if (which && fs.existsSync(which)) return which;
  } catch {}
  return 'python';
}

const pythonExecutable = findPython();
let pywebviewResults = null;
try {
  const pyOutput = execSync(`"${pythonExecutable}" -m src.hosts.pywebview.main --phase5-test`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 35000,
  }).toString();

  const pyMatch = pyOutput.match(/\[pywebview\] Phase 5 Results:\s*(\{.*\})/);
  if (pyMatch) {
    pywebviewResults = JSON.parse(pyMatch[1]);
  }
  assert(pywebviewResults && pywebviewResults.success === true, 'pywebview test runner completed all assertions successfully');
} catch (err) {
  console.error(`[FAIL] pywebview test runner failed: ${err.message}`);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  failures++;
}

// --------------------------------------------------------------------------
// Phase 5 Required Assertion Manifest (Immutable Contract)
// --------------------------------------------------------------------------
const REQUIRED_PHASE5_ASSERTIONS = Object.freeze([
  'INIT',
  'P5-FR-I1-REGISTER',
  'P5-FR-I2',
  'P5-FR-I3',
  'P5-FR-I4',
  'P5-FR-I5-OWN',
  'P5-FR-I5-BESIDE',
  'P5-FR-R1A',
  'P5-FR-I7',
  'P5-FR-R1-GLOBAL',
  'P5-NFR7-MENU-NAV',
  'P5-NFR7-NATIVE-BUTTONS',
  'P5-FR-G5-DEFAULT-OFF',
  'P5-FR-G6-ITEM-COUNT',
  'P5-WK030-KEYBOARD',
  'P5-WK030-CLOSE-AFTER-TRIGGER',
  'P5-FR-G5-DISABLE',
  'P5-FR-N10-APPEND',
  'P5-FR-N10-SLOTS',
  'P5-FR-N12-SWAP',
  'P5-FR-N12-MENU-UNCHANGED',
  'P5-FR-I9-CORE-ORDER',
  'P5-FR-I9-SEPARATOR',
  'P5-FR-I9-APP-ITEM',
  'P5-FR-I10-POSITION',
  'P5-FR-I10-COUNT',
  'P5-FR-I11',
  'P5-FR-I8-SURFACE-EDITOR',
  'P5-FR-I8-SURFACE-NO-MENU-CONTROL',
  'P5-FR-I8-SURFACE-HANDLE',
]);

function validateHostContract(hostName, hostResults) {
  assert(hostResults && hostResults.success === true, `${hostName} suite completed with success: true`);
  const list = hostResults.results || [];
  assert(
    list.length === REQUIRED_PHASE5_ASSERTIONS.length,
    `${hostName} executed exact expected count (${list.length} vs expected ${REQUIRED_PHASE5_ASSERTIONS.length})`
  );

  const seen = new Set();
  for (const item of list) {
    assert(!seen.has(item.id), `No duplicate assertion IDs in ${hostName} (duplicate found: ${item.id})`);
    seen.add(item.id);
  }
  for (const reqId of REQUIRED_PHASE5_ASSERTIONS) {
    assert(seen.has(reqId), `Required assertion ${reqId} is present in ${hostName}`);
  }
  const reqSet = new Set(REQUIRED_PHASE5_ASSERTIONS);
  for (const item of list) {
    assert(reqSet.has(item.id), `Assertion ${item.id} in ${hostName} is defined in manifest`);
    assert(item.pass === true, `${hostName} assertion ${item.id} passed (${item.msg})`);
  }
}

if (electronResults) {
  validateHostContract('Electron', electronResults);
}
if (pywebviewResults) {
  validateHostContract('pywebview', pywebviewResults);
}

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
  assert(divergences === 0, `Zero divergence between Electron and pywebview across all Phase 5 assertions (divergences: ${divergences})`);
} else {
  assert(false, 'Unable to compare host parity: one or both test runners failed to produce structured results');
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
console.log('\n----------------------------------------------------');
if (failures === 0) {
  console.log('SUCCESS: All Phase 5 quality checks passed (0 failures).');
  process.exit(0);
} else {
  console.error(`FAILURE: ${failures} check(s) failed.`);
  process.exit(1);
}
