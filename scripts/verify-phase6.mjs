import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: Phase 6 (Editing, Save Confirm, Notifications, Restart) Quality Verification ===');
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
// 1. FR-P6: zero monaco dependency outside the core's own text-editor module
// --------------------------------------------------------------------------
console.log("\n--- 1. App-Layer monaco Isolation (FR-P6) ---");
function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
const appLayerDirs = ['src/presets', 'src/registry'].map((d) => path.join(rootDir, d));
for (const dir of appLayerDirs) {
  for (const filePath of listFilesRecursive(dir)) {
    const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const src = fs.readFileSync(filePath, 'utf8');
    assert(!/monaco-editor/.test(src), `${rel} contains 0 references to monaco-editor (FR-P6)`);
  }
}
const mainTs = fs.readFileSync(path.join(rootDir, 'src/main.ts'), 'utf8');
assert(!/from 'monaco-editor/.test(mainTs), "src/main.ts contains 0 direct monaco-editor imports (FR-P6)");

// --------------------------------------------------------------------------
// 2. Core purity: no resource-kind branching in ANY src/core/*.ts file
//    (NFR-1, INTENT 3) — same style of check as Phase 5, re-run because
//    Phase 6 added new core files (dialog.ts, statusmessage.ts, texteditor.ts).
// --------------------------------------------------------------------------
console.log('\n--- 2. Core Purity: Zero Resource-Kind Branching in src/core/*.ts (NFR-1) ---');
const coreDir = path.join(rootDir, 'src/core');
const coreFilePaths = listFilesRecursive(coreDir);
const kindBranchRegex = /(={2,3}|!={1,2})\s*['"](file|folder|terminal|session)['"]|['"](file|folder|terminal|session)['"]\s*(={2,3}|!={1,2})|case\s*['"](file|folder|terminal|session)['"]/i;
const extensionTableRegex = /extensionMap|fileExtensions|extensionToIcon|suffixIcons/i;
for (const filePath of coreFilePaths) {
  const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const src = fs.readFileSync(filePath, 'utf8');
  assert(!kindBranchRegex.test(src), `${rel} contains 0 resource-kind branches (NFR-1)`);
  assert(!extensionTableRegex.test(src), `${rel} contains 0 extension-to-icon mapping tables (FR-Q3)`);
  assert(!koreanCharRegex.test(extractComments(src)), `${rel} comments are in English (0 Korean characters)`);
}

// --------------------------------------------------------------------------
// 3. D-18 turned-on / turned-off feature list is actually configured
// --------------------------------------------------------------------------
console.log('\n--- 3. monaco Feature Flags Match D-18 (FR-P5, X-12) ---');
const textEditorTs = fs.readFileSync(path.join(rootDir, 'src/core/texteditor.ts'), 'utf8');
assert(/quickSuggestions:\s*false/.test(textEditorTs), 'quickSuggestions is disabled (X-12, FR-P5)');
assert(/minimap:\s*\{\s*enabled:\s*false\s*\}/.test(textEditorTs), 'minimap is disabled (X-12, FR-P5)');
assert(/hover:\s*\{\s*enabled:\s*'off'\s*\}/.test(textEditorTs), 'hover (language service) is disabled (X-12, FR-P5)');
assert(/onDidChangeCursorSelection/.test(textEditorTs), 'multi-cursor collapse-back invariant is wired (X-12, FR-P5)');

// --------------------------------------------------------------------------
// 4. package.json pins monaco-editor at the SPEC-mandated version (C-4)
// --------------------------------------------------------------------------
console.log('\n--- 4. Dependency Version Pin (C-4) ---');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
assert(pkg.dependencies && pkg.dependencies['monaco-editor'] === '0.56.0', `monaco-editor is pinned at exactly 0.56.0 (C-4) (found: ${pkg.dependencies && pkg.dependencies['monaco-editor']})`);

// --------------------------------------------------------------------------
// 5. dist golden set is preserved (monaco must not fragment the single JS
//    bundle — see vite.config.ts's codeSplitting: false)
// --------------------------------------------------------------------------
console.log('\n--- 5. dist/ Golden Set Preserved After Adding monaco ---');
// Round-1 adversarial finding (Major): this is the only verify script that
// asserts an EXACT file count, so a stale dist/ from an old build (or a
// direct `node scripts/verify-phase6.mjs` invocation that skips verify:dist's
// build) could pass this check without proving anything about current
// source. Rebuild fresh right here instead of trusting npm test's ordering.
execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
const distDir = path.join(rootDir, 'dist');
const distFiles = fs.existsSync(distDir) ? listFilesRecursiveAll(distDir) : [];
function listFilesRecursiveAll(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursiveAll(full));
    else out.push(path.relative(distDir, full).replace(/\\/g, '/'));
  }
  return out;
}
assert(distFiles.length === 3, `dist/ contains exactly 3 files after build (found ${distFiles.length}: ${distFiles.join(', ')})`);

// --------------------------------------------------------------------------
// 6. In-Browser Runtime Verification via Electron
// --------------------------------------------------------------------------
console.log('\n--- 6. Executing In-Browser Runtime Verification via Electron ---');
const runnerPath = path.join(__dirname, 'phase6-electron-runner.cjs');

let electronResults = null;
try {
  const runnerOutput = execSync(`npx.cmd electron "${runnerPath}"`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 40000,
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
  const match = runnerOutput.match(/\[electron\] Phase 6 Results:\s*(\{.*\})/);
  if (match) {
    electronResults = JSON.parse(match[1]);
  }
  assert(runnerOutput.includes('All Phase 6 Electron in-browser runtime assertions executed successfully'), 'Electron test runner completed all assertions successfully');
} catch (err) {
  console.error(`[FAIL] Electron test runner failed: ${err.message}`);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  failures++;
}

// --------------------------------------------------------------------------
// 6b. FR-K1 across a REAL process relaunch (round-1 adversarial finding,
//     Major: the single-process suite above only simulates restart via
//     editor.clear() + restoreLastSession() in the same renderer, and the
//     runner's random-per-run userData dir made a genuine cross-launch check
//     impossible). Two separate `electron` invocations sharing one profile
//     dir: launch1 opens a real folder and exits; launch2 is a fresh
//     process that calls restoreLastSession() and must recover it from
//     what launch1 actually persisted to disk.
// --------------------------------------------------------------------------
console.log('\n--- 6b. FR-K1 Restart Verified Across a Real Process Relaunch ---');
const relaunchUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase6-relaunch-userdata-'));
const relaunchTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase6-relaunch-testdir-'));
try {
  const relaunchEnv = {
    ...process.env,
    WB_PHASE6_USERDATA_DIR: relaunchUserDataDir,
    WB_PHASE6_TESTDIR: relaunchTestDir,
  };
  const launch1Output = execSync(`npx.cmd electron "${runnerPath}"`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 40000,
    env: { ...relaunchEnv, WB_PHASE6_MODE: 'launch1' },
  }).toString();
  for (const line of launch1Output.split(/\r?\n/)) {
    if (line.startsWith('[PASS]')) console.log(line);
    else if (line.startsWith('[FAIL]')) { console.error(line); failures++; }
  }

  const launch2Output = execSync(`npx.cmd electron "${runnerPath}"`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 40000,
    env: { ...relaunchEnv, WB_PHASE6_MODE: 'launch2' },
  }).toString();
  for (const line of launch2Output.split(/\r?\n/)) {
    if (line.startsWith('[PASS]')) console.log(line);
    else if (line.startsWith('[FAIL]')) { console.error(line); failures++; }
  }
} catch (err) {
  console.error(`[FAIL] Two-launch FR-K1 relaunch check failed: ${err.message}`);
  if (err.stdout) console.log(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  failures++;
} finally {
  try {
    fs.rmSync(relaunchUserDataDir, { recursive: true, force: true });
    fs.rmSync(relaunchTestDir, { recursive: true, force: true });
  } catch {}
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
  const pyOutput = execSync(`"${pythonExecutable}" -m src.hosts.pywebview.main --phase6-test`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 40000,
  }).toString();

  const pyMatch = pyOutput.match(/\[pywebview\] Phase 6 Results:\s*(\{.*\})/);
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
// Phase 6 Required Assertion Manifest (Immutable Contract)
// --------------------------------------------------------------------------
const REQUIRED_PHASE6_ASSERTIONS = Object.freeze([
  'INIT',
  'P6-FR-P1-MOUNTED',
  'P6-FR-P1-COLOR',
  'P6-FR-P1-LINENUM',
  'P6-FR-G3',
  'P6-FR-P2-FIND',
  'P6-FR-P2-REPLACE',
  'P6-FR-P3-UNDOREDO',
  'P6-FR-P4',
  'P6-FR-P5-MINIMAP',
  'P6-FR-P5-MULTICURSOR',
  'P6-FR-P5-SUGGEST',
  'P6-FR-P5-HOVER',
  'P6-FR-P5-MARKERS',
  'P6-FR-L1-SET',
  'P6-FR-L1-CLEAR',
  'P6-FR-L7',
  'P6-FR-L2',
  'P6-FR-L5',
  'P6-FR-L4',
  'P6-FR-L3',
  'P6-FR-L6-CANCEL',
  'P6-FR-L6-DISCARD',
  'P6-FR-G4-START',
  'P6-FR-G4-END',
  'P6-FR-G2',
  'P6-FR-N10A',
  'P6-FR-N10B-PERSIST',
  'P6-FR-N10B-STOP',
  'P6-FR-K1-PERSIST',
  'P6-FR-K1-RESTORE',
  'P6-FR-K2',
  'P6-FR-K3',
  'P6-FR-N6A-LIST',
  'P6-FR-N6A-PICKER',
  'P6-FR-N6A',
]);

function validateHostContract(hostName, hostResults) {
  assert(hostResults && hostResults.success === true, `${hostName} suite completed with success: true`);
  const list = hostResults.results || [];
  assert(
    list.length === REQUIRED_PHASE6_ASSERTIONS.length,
    `${hostName} executed exact expected count (${list.length} vs expected ${REQUIRED_PHASE6_ASSERTIONS.length})`
  );

  const seen = new Set();
  for (const item of list) {
    assert(!seen.has(item.id), `No duplicate assertion IDs in ${hostName} (duplicate found: ${item.id})`);
    seen.add(item.id);
  }
  for (const reqId of REQUIRED_PHASE6_ASSERTIONS) {
    assert(seen.has(reqId), `Required assertion ${reqId} is present in ${hostName}`);
  }
  const reqSet = new Set(REQUIRED_PHASE6_ASSERTIONS);
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
  assert(divergences === 0, `Zero divergence between Electron and pywebview across all Phase 6 assertions (divergences: ${divergences})`);
} else {
  assert(false, 'Unable to compare host parity: one or both test runners failed to produce structured results');
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
console.log('\n----------------------------------------------------');
if (failures === 0) {
  console.log('SUCCESS: All Phase 6 quality checks passed (0 failures).');
  process.exit(0);
} else {
  console.error(`FAILURE: ${failures} check(s) failed.`);
  process.exit(1);
}
