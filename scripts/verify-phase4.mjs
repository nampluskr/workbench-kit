import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: Phase 4 (Layout, Tabs & Lifespan) Quality Verification ===');
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
// 1. Invariant: Zero Tab-Explorer-Templates Values in CSS (C-10, D-29)
// --------------------------------------------------------------------------
console.log('\n--- 1. Verifying Zero Tab-Explorer-Templates Values in CSS (C-10, D-29) ---');
const cssPath = path.join(rootDir, 'src/style.css');
const css = fs.readFileSync(cssPath, 'utf8');

const forbiddenTokens = ['12px', '4px', '8px', '16px', '6px', '#353b44', 'Segoe UI', 'Cascadia Mono'];
for (const token of forbiddenTokens) {
  const isExactWord = /^[a-zA-Z0-9]/.test(token);
  const regex = isExactWord ? new RegExp(`\\b${token}\\b`, 'g') : new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const matches = css.match(regex);
  assert(!matches || matches.length === 0, `src/style.css contains 0 occurrences of "${token}" (found: ${matches ? matches.length : 0})`);
}

// --------------------------------------------------------------------------
// 2. Core Purity: Zero Extension Tables & Filesystem Agnostic (NFR-1, INTENT 3)
// --------------------------------------------------------------------------
console.log('\n--- 2. Verifying Core Purity in src/core/editor.ts (NFR-1, INTENT 3) ---');
const editorTsPath = path.join(rootDir, 'src/core/editor.ts');
const editorTs = fs.readFileSync(editorTsPath, 'utf8');

assert(!editorTs.includes('fs.') && !editorTs.includes("from 'fs'") && !editorTs.includes('require("fs")'), 'src/core/editor.ts contains 0 fs imports or calls (NFR-1)');
assert(!editorTs.includes('openFolderDialog') && !editorTs.includes('readDir') && !editorTs.includes('open_folder_dialog'), 'src/core/editor.ts contains 0 filesystem host bridge methods (NFR-1)');
assert(!editorTs.includes('extensionMap') && !editorTs.includes('fileExtensions'), 'src/core/editor.ts contains 0 extension mapping tables (NFR-1, INTENT 3)');
assert(editorTs.includes("noPanelsOverlay: 'emptyGroup'"), 'createDockview sets noPanelsOverlay to emptyGroup (FR-C4, FR-J7)');
assert(editorTs.includes('disableFloatingGroups: true'), 'createDockview sets disableFloatingGroups to true (FR-C8)');

// --------------------------------------------------------------------------
// 3. Coding Contracts: English-only Comments
// --------------------------------------------------------------------------
console.log('\n--- 3. Verifying English Comments in src/core/editor.ts ---');
function extractComments(source) {
  const commentRegex = /\/\*[\s\S]*?\*\/|\/\/.*/g;
  const matches = source.match(commentRegex) || [];
  return matches.join('\n');
}
const koreanCharRegex = /[\uac00-\ud7a3]/;
const editorComments = extractComments(editorTs);
assert(!koreanCharRegex.test(editorComments), 'src/core/editor.ts comments are in English (0 Korean characters)');

// --------------------------------------------------------------------------
// 4. UI Structural Invariants: Zero Close Pane Commands & Menu Locality
// --------------------------------------------------------------------------
console.log('\n--- 4. UI Structural Invariants (FR-D8, FR-J3, FR-J6, FR-N6b) ---');
const activityBarTs = fs.readFileSync(path.join(rootDir, 'src/core/activitybar.ts'), 'utf8');
const menuTs = fs.readFileSync(path.join(rootDir, 'src/core/menu.ts'), 'utf8');

// FR-D8 & FR-J6: "칸 닫기/삭제" commands 0 across all places
assert(!activityBarTs.includes('칸 닫기') && !activityBarTs.includes('칸 삭제'), 'Activity bar contains zero 칸 닫기/칸 삭제 items (FR-D8, FR-J6)');
assert(!menuTs.includes('칸 닫기') && !menuTs.includes('칸 삭제'), 'Menu contains zero 칸 닫기/칸 삭제 items (FR-D8, FR-J6)');

// FR-J3: "활성 칸 탭 모두 닫기" in View menu only
// v0.1 FR-J2/FR-J3's View item became File > Close Editor Group (SPEC 0.1, v0.2 FR-M10).
assert(menuTs.includes('file:close-editor-group') && menuTs.includes('Close Editor Group') && !menuTs.includes('view:close-active-tabs'), 'File menu contains "Close Editor Group" and View no longer has the v0.1 item (FR-J2, FR-J3 → v0.2 FR-M10)');
assert(!activityBarTs.includes('활성 칸 탭 모두 닫기'), 'Activity bar contains zero "활성 칸 탭 모두 닫기" items (FR-J3)');
assert(!editorTs.includes('close-all-tabs') && !editorTs.includes('tab-action-close-all'), 'Tab header actions contain zero "활성 칸 탭 모두 닫기" buttons (FR-J3)');

// FR-N6b: File menu Close Tab
assert(menuTs.includes('file:close-tab') && menuTs.includes('Ctrl+W'), 'File menu contains "탭 닫기" with shortcut Ctrl+W (FR-N6b)');

// Tab Header Actions: +, Split Right, Split Down (FR-C1, FR-D1, FR-D2)
assert(editorTs.includes('tab-action-new') && editorTs.includes('codicon-plus'), 'Tab header actions has New Tab (+) action (FR-C1)');
assert(editorTs.includes('tab-action-split-right') && editorTs.includes('codicon-split-horizontal'), 'Tab header actions has Split Right action (FR-D1)');
assert(editorTs.includes('tab-action-split-down') && editorTs.includes('codicon-split-vertical'), 'Tab header actions has Split Down action (FR-D2)');

// --------------------------------------------------------------------------
// 5. In-Browser Runtime Verification via Electron
// --------------------------------------------------------------------------
console.log('\n--- 5. Executing In-Browser Runtime Verification via Electron ---');
const runnerPath = path.join(__dirname, 'phase4-electron-runner.cjs');

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
  const match = runnerOutput.match(/\[electron\] Phase 4 Results:\s*(\{.*\})/);
  if (match) {
    electronResults = JSON.parse(match[1]);
  }
  assert(runnerOutput.includes('All Phase 4 Electron in-browser runtime assertions executed successfully'), 'Electron test runner completed all assertions successfully');
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
  const pyOutput = execSync(`"${pythonExecutable}" -m src.hosts.pywebview.main --phase4-test`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 35000,
  }).toString();

  const pyMatch = pyOutput.match(/\[pywebview\] Phase 4 Results:\s*(\{.*\})/);
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
// Phase 4 Required Assertion Manifest (Immutable Contract)
// --------------------------------------------------------------------------
// v0.2 removed P4-FR-B3 and P4-FR-B3-DUP: v0.1 FR-B3 (a pick is absorbed by
// the [+] empty tab) is superseded by the preview-spot rule, and is listed in
// v0.2 SPEC 0.1's replacement table. Its successors are asserted in
// scripts/v02-phase1-suite.js.
const REQUIRED_PHASE4_ASSERTIONS = Object.freeze([
  'INIT',
  'P4-INIT-GROUP',
  'P4-INIT-PANEL',
  'P4-INIT-CONTAINER',
  'P4-HEADER-EXISTS',
  'P4-HEADER-COUNT',
  'P4-HEADER-BTN1',
  'P4-HEADER-BTN2',
  'P4-D13-D15',
  'P4-FR-C1',
  'P4-FR-C1-ACTIVE',
  'P4-FR-C2',
  'P4-FR-A6',
  'P4-FR-B1',
  'V2P4-FR-P14-REUSE',
  'V2P4-FR-P14-CONFIRM-REOPEN',
  'P4-FR-C1-2',
  'P4-FR-B2',
  'P4-FR-B4',
  'P4-FR-E4',
  'P4-FR-E5',
  'P4-APP-VIEW',
  'P4-APP-TIMER-RUNNING',
  'P4-FR-E5-TIMER',
  'P4-FR-E5-ISOLATION',
  'P4-FR-E1-UI-ACTIVE',
  'P4-FR-E1-INSTANCE',
  'P4-FR-E1-CREATION',
  'P4-FR-E1-DISPOSAL',
  'P4-FR-E1-DOM-STATE',
  'P4-FR-E2-INSTANCE',
  'P4-FR-E2-CREATION',
  'P4-FR-E2-TIMER',
  'P4-FR-E2-DOM-STATE',
  'P4-FR-C6',
  'P4-FR-E3-UI-CLOSED',
  'P4-FR-E3',
  'P4-MEM-CLEANUP',
  'P4-FR-A14-SPLIT',
  'P4-FR-A14-CONTENT',
  'P4-FR-D6',
  'P4-2D-ACTIVE-MAIN',
  'P4-FR-A14-2D-COUNT',
  'P4-FR-A14-2D-TARGET',
  'P4-FR-A14-DUP-PRECONDITION',
  'P4-FR-A14-DUP',
  'P4-FR-D1',
  'P4-FR-D2',
  'P4-FR-D3-ACTBAR',
  'P4-FR-D3-MENU',
  'P4-FR-D7-INIT',
  'P4-FR-D7',
  'P4-FR-D4-SASH',
  'P4-SEPARATOR-SIZE',
  'P4-SEPARATOR-COLOR',
  'P4-DND-INDICATOR',
  'P4-FR-D4-RESIZE',
  'P4-FR-D5-HEADER',
  'P4-REORDER-INIT',
  'P4-FR-C5-DRAGGABLE',
  'P4-FR-C5',
  'P4-FR-C8',
  'P4-FR-C7',
  'P4-FR-C9',
  'P4-FR-C3-INIT',
  'P4-FR-C3',
  'P4-FR-N6b-KEY',
  'P4-FR-N6b-MENU',
  'P4-MULTI-GROUP-INIT',
  'P4-FR-J1',
  'P4-FR-J1-CTRLW',
  'P4-FR-J7-COUNT',
  'P4-FR-J7-DOM',
  'P4-FR-J4',
  'P4-FR-J2',
  'P4-FR-J5',
  'P4-RESTART-EMPTY',
  'P4-FR-J8-PATH1',
  'P4-FR-J8-PATH2',
  'P4-FR-J8-PATH3',
  'P4-FR-L1-SET',
  'P4-FR-L1-CLEAR',
  'P4-FR-D8-MENU',
  'P4-FR-D8-ACTBAR',
  'P4-FR-J3-ACTBAR',
  'P4-FR-J3-VIEWMENU',
]);

function validateHostContract(hostName, hostResults) {
  assert(hostResults && hostResults.success === true, `${hostName} suite completed with success: true`);
  const list = hostResults.results || [];
  assert(
    list.length === REQUIRED_PHASE4_ASSERTIONS.length,
    `${hostName} executed exact expected count (${list.length} vs expected ${REQUIRED_PHASE4_ASSERTIONS.length})`
  );

  // Check for duplicates
  const seen = new Set();
  for (const item of list) {
    assert(!seen.has(item.id), `No duplicate assertion IDs in ${hostName} (duplicate found: ${item.id})`);
    seen.add(item.id);
  }

  // Check for missing required IDs
  for (const reqId of REQUIRED_PHASE4_ASSERTIONS) {
    assert(seen.has(reqId), `Required assertion ${reqId} is present in ${hostName}`);
  }

  // Check for unexpected IDs
  const reqSet = new Set(REQUIRED_PHASE4_ASSERTIONS);
  for (const item of list) {
    assert(reqSet.has(item.id), `Assertion ${item.id} in ${hostName} is defined in manifest`);
    assert(item.pass === true, `${hostName} assertion ${item.id} passed (${item.msg})`);
  }
}

// Validate individual host contracts against the immutable manifest
if (electronResults) {
  validateHostContract('Electron', electronResults);
}
if (pywebviewResults) {
  validateHostContract('pywebview', pywebviewResults);
}

// Validate cross-host parity
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
  assert(divergences === 0, `Zero divergence between Electron and pywebview across all Phase 4 assertions (divergences: ${divergences})`);
} else {
  assert(false, 'Unable to compare host parity: one or both test runners failed to produce structured results');
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
console.log('\n----------------------------------------------------');
if (failures === 0) {
  console.log('SUCCESS: All Phase 4 quality checks passed (0 failures).');
  process.exit(0);
} else {
  console.error(`FAILURE: ${failures} check(s) failed.`);
  process.exit(1);
}
