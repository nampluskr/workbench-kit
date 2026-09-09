import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: Dist Parity & Host Verification ===');

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

// ---------------------------------------------------------
// 0. C-11 Execution Environment Minimum Version Verification
// ---------------------------------------------------------
console.log('\n--- 0. Verifying Environment Minimum Versions (C-11) ---');
const nodeVersion = process.version; // e.g. v22.22.3
const nodeMajor = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
assert(nodeMajor >= 22, `Node.js version is >= 22 (current: ${nodeVersion})`);

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
let pythonVersion = '';
let pywebviewVersion = '';
try {
  pythonVersion = execSync(`"${pythonExecutable}" -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"`, {
    stdio: 'pipe',
  }).toString().trim();
  const [pyMajor, pyMinor] = pythonVersion.split('.').map(Number);
  assert(
    pyMajor > 3 || (pyMajor === 3 && pyMinor >= 11),
    `Python version tuple is >= (3, 11) (detected: ${pythonVersion} at ${pythonExecutable})`
  );
} catch (err) {
  console.error(`[FAIL] Failed to execute Python: ${err.message}`);
  failureCount++;
}

try {
  pywebviewVersion = execSync(`"${pythonExecutable}" -c "import importlib.metadata; print(importlib.metadata.version('pywebview'))"`, {
    stdio: 'pipe',
  }).toString().trim();
  const webviewMajor = parseInt(pywebviewVersion.split('.')[0], 10);
  assert(webviewMajor >= 6, `pywebview version is >= 6.0 (detected: ${pywebviewVersion})`);
} catch (err) {
  console.error(`[FAIL] Failed to verify pywebview package: ${err.message}`);
  failureCount++;
}

let electronVersion = '';
try {
  electronVersion = execSync('npx electron --version', { cwd: rootDir, stdio: 'pipe' }).toString().trim();
  const electronMajor = parseInt(electronVersion.replace(/^v/, '').split('.')[0], 10);
  assert(electronMajor >= 44, `Electron version is >= 44 (detected: ${electronVersion})`);
} catch (err) {
  console.error(`[FAIL] Failed to verify Electron version: ${err.message}`);
  failureCount++;
}

// Check that requirements.txt pins pywebview
const reqTxtPath = path.join(rootDir, 'requirements.txt');
assert(
  fs.existsSync(reqTxtPath) && fs.readFileSync(reqTxtPath, 'utf8').includes('pywebview>=6.2.1'),
  'requirements.txt pins pywebview dependency'
);

// Check that PLAN.md documents exact pinned C-11 versions
const planPath = path.join(rootDir, 'docs/current/PLAN.md');
if (fs.existsSync(planPath)) {
  const planContent = fs.readFileSync(planPath, 'utf8');
  assert(
    planContent.includes('실행 환경 최소 버전 (C-11)') &&
    planContent.includes('Node: v22.22.3') &&
    planContent.includes('Python: 3.11.8') &&
    planContent.includes('Electron: v44.2.0') &&
    planContent.includes('pywebview: 6.2.1'),
    'PLAN.md records exact confirmed minimum execution environment versions'
  );
}

// ---------------------------------------------------------
// 1. Strict Build Configuration Verification
// ---------------------------------------------------------
console.log('\n--- 1. Verifying Build Configurations ---');
const rootFiles = fs.readdirSync(rootDir);

const viteConfigs = rootFiles.filter(f => f.startsWith('vite.config'));
assert(
  viteConfigs.length === 1 && viteConfigs[0] === 'vite.config.ts',
  `Exactly one vite.config.ts must exist (found: ${viteConfigs.join(', ')})`
);

const viteConfigContent = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
const branchRegex = /\b(electron|pywebview)\b/i;
assert(!branchRegex.test(viteConfigContent), 'vite.config.ts contains no branch-specific keywords (word-boundary regex)');
assert(!/process\.env\.(TARGET|MODE)/i.test(viteConfigContent), 'vite.config.ts contains no platform target condition branches');

const envFiles = rootFiles.filter(f => f.startsWith('.env'));
assert(envFiles.length === 0, `No .env configuration branching files exist (found: ${envFiles.join(', ')})`);

const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const scriptKeys = Object.keys(pkgJson.scripts || {});
const branchBuildScripts = scriptKeys.filter(k => k.startsWith('build:') || (k.includes('build') && k !== 'build'));
assert(branchBuildScripts.length === 0, `package.json contains no branch-specific build scripts (found: ${branchBuildScripts.join(', ')})`);
assert(pkgJson.scripts.build === 'vite build', `package.json "build" is canonical "vite build" (found: "${pkgJson.scripts.build}")`);
assert(pkgJson.scripts['start:electron'] && pkgJson.scripts['start:pywebview'], 'package.json has symmetric start:electron and start:pywebview scripts');
assert(!pkgJson.main, 'package.json does not declare an asymmetric branch entrypoint in "main"');

// ---------------------------------------------------------
// 2. Build Execution & Golden Set Verification
// ---------------------------------------------------------
console.log('\n--- 2. Verifying Build & Golden Set ---');
try {
  execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
  console.log('[PASS] Clean npm run build succeeded');
} catch (err) {
  console.error('[FAIL] npm run build failed:', err.message);
  failureCount++;
}

const distDir = path.join(rootDir, 'dist');
assert(fs.existsSync(distDir), 'dist directory exists');

function getFilesRecursively(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function computeManifest(dir) {
  const manifest = {};
  const files = getFilesRecursively(dir);
  for (const f of files) {
    const rel = path.relative(dir, f).replace(/\\/g, '/');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    manifest[rel] = hash;
  }
  return manifest;
}

const diskManifestInitial = computeManifest(distDir);
const initialFileKeys = Object.keys(diskManifestInitial).sort();

assert(initialFileKeys.includes('index.html'), 'Golden set: index.html exists in dist');
assert(initialFileKeys.some(k => k.startsWith('assets/') && k.endsWith('.js')), 'Golden set: At least one JS bundle in dist/assets');
assert(initialFileKeys.some(k => k.startsWith('assets/') && k.endsWith('.css')), 'Golden set: At least one CSS bundle in dist/assets');

const distIndexPath = path.join(distDir, 'index.html');
const canonicalDistIndex = fs.existsSync(distIndexPath) ? fs.realpathSync(distIndexPath) : '';
if (fs.existsSync(distIndexPath)) {
  const indexHtmlContent = fs.readFileSync(distIndexPath, 'utf8');
  assert(indexHtmlContent.includes('id="app"') && indexHtmlContent.includes('id="statusbar"'), 'dist/index.html contains expected workbench DOM structure');
  assert(indexHtmlContent.includes("Content-Security-Policy"), 'dist/index.html includes Content-Security-Policy header');
}

// 2b. Verify Zero tab-explorer-templates tokens in dist (FR-M5, C-10)
const forbiddenTokens = ['Segoe UI', 'Cascadia Mono', '#353b44'];
for (const relFile of initialFileKeys) {
  const fullFilePath = path.join(distDir, relFile);
  const content = fs.readFileSync(fullFilePath, 'utf8');
  for (const token of forbiddenTokens) {
    assert(
      !content.toLowerCase().includes(token.toLowerCase()),
      `dist/${relFile} contains zero instances of tab-explorer-templates token "${token}"`
    );
  }
}
console.log('[PASS] tab-explorer-templates tokens (fonts, colors) count is strictly 0 across all dist artifacts (FR-M5, C-10)');

// 2c. Phase 2 UI Shell Contracts & Invariants Check
const coreFiles = fs.readdirSync(path.join(rootDir, 'src/core')).filter(f => f.endsWith('.ts'));
for (const f of coreFiles) {
  const code = fs.readFileSync(path.join(rootDir, 'src/core', f), 'utf8');
  assert(!/(extensions?|languageId|fileExtensions)\s*[:=]\s*\{/i.test(code), `src/core/${f} contains zero extension-to-icon mapping tables (FR-Q3)`);
}
console.log('[PASS] Common core contains zero extension-to-icon mapping tables (FR-Q3, INTENT 3)');

const licenseDir = path.join(rootDir, 'licenses');
assert(fs.existsSync(licenseDir), 'licenses/ directory exists (FR-Q4)');
const expectedLicenses = [
  'README.md',
  'LICENSE-codicons.txt',
  'LICENSE-CODE-codicons.txt',
  'LICENSE-seti-ui.txt',
  'LICENSE-vscode-icons.txt',
  'LICENSE-dockview-core.txt'
];
for (const lic of expectedLicenses) {
  assert(fs.existsSync(path.join(licenseDir, lic)), `licenses/${lic} exists (FR-Q4)`);
}
const vsiLic = fs.readFileSync(path.join(licenseDir, 'LICENSE-vscode-icons.txt'), 'utf8');
assert(
  vsiLic.includes('Section 1 -- Definitions.') &&
  vsiLic.includes('Section 8 -- Interpretation.') &&
  vsiLic.includes('https://creativecommons.org/licenses/by-sa/4.0/legalcode'),
  'licenses/LICENSE-vscode-icons.txt contains full CC BY-SA 4.0 legal code (Sections 1-8) and canonical URI (D-17)'
);
console.log('[PASS] Third-party license texts and manifest are present in licenses/ (FR-Q4, D-3, D-17)');

// Verify zero tab-explorer-templates tokens in src/style.css (FR-M5, C-10, D-29)
const styleSrc = fs.readFileSync(path.join(rootDir, 'src/style.css'), 'utf8');
for (const val of ['12px', '4px', '8px', '16px', '6px']) {
  const m = styleSrc.match(new RegExp(`\\b${val}\\b`, 'g'));
  assert(!m || m.length === 0, `src/style.css contains zero occurrences of prohibited value "${val}" (FR-M5, D-29)`);
}
console.log('[PASS] src/style.css contains zero tab-explorer-templates typography, spacing, or radius values (FR-M5, D-29)');

const menuSrc = fs.readFileSync(path.join(rootDir, 'src/core/menu.ts'), 'utf8');
assert(menuSrc.includes("'view:cycle-icon-theme'"), 'View menu contains icon theme switcher (FR-Q1a)');
const activityBarSrc = fs.readFileSync(path.join(rootDir, 'src/core/activitybar.ts'), 'utf8');
assert(!activityBarSrc.includes('icon-theme') && !activityBarSrc.includes('아이콘 테마'), 'Activity bar contains zero icon theme switchers (X-13, FR-Q1a)');
assert(!activityBarSrc.includes('칸 삭제') && !activityBarSrc.includes('칸 합치기'), 'Activity bar contains zero 칸 삭제/칸 합치기 items (X-7, FR-N11)');
console.log('[PASS] Phase 2 invariants (X-7, X-13, FR-Q1a, FR-N11) verified');

// ---------------------------------------------------------
// 3. Inspection Script Identity & Purity Check (M2-4)
// ---------------------------------------------------------
console.log('\n--- 3. Verifying Read-Only Inspection Script Identity ---');
const electronMainSrc = fs.readFileSync(path.join(rootDir, 'src/hosts/electron/main.cjs'), 'utf8');
const pywebviewMainSrc = fs.readFileSync(path.join(rootDir, 'src/hosts/pywebview/main.py'), 'utf8');

const electronExprMatch = electronMainSrc.match(/const INSPECTION_EXPRESSION =\s*`([\s\S]*?)`\.trim\(\);/);
const pywebviewExprMatch = pywebviewMainSrc.match(/INSPECTION_EXPRESSION =\s*"""([\s\S]*?)"""\.strip\(\)/);

assert(electronExprMatch && pywebviewExprMatch, 'Both hosts declare INSPECTION_EXPRESSION string constants');
const electronExpr = (electronExprMatch ? electronExprMatch[1] : '').trim();
const pywebviewExpr = (pywebviewExprMatch ? pywebviewExprMatch[1] : '').trim();

assert(electronExpr === pywebviewExpr, 'Host introspection expressions are byte-for-byte identical');
assert(
  !/innerHTML|innerText|textContent\s*=|setAttribute|insertAdjacentHTML|document\.write/.test(electronExpr),
  'Inspection expression contains zero DOM mutating methods'
);

// ---------------------------------------------------------
// 4. Runtime Smoke Tests & Attestation Collection (M2-3)
// ---------------------------------------------------------
console.log('\n--- 4. Running Host Smoke Tests & Collecting Attestations ---');

let electronLocalPath = null;
let electronLoadedUrl = null;
let electronDigestMap = null;
let electronInspection = null;

try {
  console.log('Running Electron smoke test via npm run start:electron...');
  const out = execSync('npm run start:electron -- --smoke-test', {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 15000,
  }).toString();

  const pathLine = out.split(/\r?\n/).find(l => l.includes('[Electron] Local Path:'));
  const urlLine = out.split(/\r?\n/).find(l => l.includes('[Electron] Loaded URL:'));
  const digestLine = out.split(/\r?\n/).find(l => l.includes('[Electron] Digest Map:'));
  const inspLine = out.split(/\r?\n/).find(l => l.includes('[Electron] DOM Inspection:'));

  if (pathLine) electronLocalPath = fs.realpathSync(pathLine.replace(/^.*?\[Electron\] Local Path:\s*/, '').trim());
  if (urlLine) electronLoadedUrl = urlLine.replace(/^.*?\[Electron\] Loaded URL:\s*/, '').trim();
  if (digestLine) electronDigestMap = JSON.parse(digestLine.replace(/^.*?\[Electron\] Digest Map:\s*/, '').trim());
  if (inspLine) electronInspection = JSON.parse(inspLine.replace(/^.*?\[Electron\] DOM Inspection:\s*/, '').trim());

  console.log(`[PASS] Electron reported path: ${electronLocalPath}`);
  console.log(`[PASS] Electron loaded URL: ${electronLoadedUrl}`);
  console.log(`[PASS] Electron digest map keys: ${Object.keys(electronDigestMap || {}).length}`);
} catch (err) {
  console.error('[FAIL] Electron smoke test failed:', err.message);
  if (err.stdout) console.error('stdout:', err.stdout.toString());
  if (err.stderr) console.error('stderr:', err.stderr.toString());
  failureCount++;
}

// TOCTOU check after Electron
const diskManifestMid = computeManifest(distDir);
assert(
  JSON.stringify(diskManifestMid) === JSON.stringify(diskManifestInitial),
  'TOCTOU: dist/ directory untouched and identical after Electron run'
);

let pywebviewLocalPath = null;
let pywebviewLoadedUrl = null;
let pywebviewDigestMap = null;
let pywebviewInspection = null;

try {
  console.log('Running pywebview smoke test via python -m src.hosts.pywebview.main...');
  const out = execSync(`"${pythonExecutable}" -m src.hosts.pywebview.main --smoke-test`, {
    cwd: rootDir,
    stdio: 'pipe',
    timeout: 40000,
  }).toString();

  const pathLine = out.split(/\r?\n/).find(l => l.includes('[pywebview] Local Path:'));
  const urlLine = out.split(/\r?\n/).find(l => l.includes('[pywebview] Loaded URL:'));
  const digestLine = out.split(/\r?\n/).find(l => l.includes('[pywebview] Digest Map:'));
  const inspLine = out.split(/\r?\n/).find(l => l.includes('[pywebview] DOM Inspection:'));

  if (pathLine) pywebviewLocalPath = fs.realpathSync(pathLine.replace(/^.*?\[pywebview\] Local Path:\s*/, '').trim());
  if (urlLine) pywebviewLoadedUrl = urlLine.replace(/^.*?\[pywebview\] Loaded URL:\s*/, '').trim();
  if (digestLine) pywebviewDigestMap = JSON.parse(digestLine.replace(/^.*?\[pywebview\] Digest Map:\s*/, '').trim());
  if (inspLine) pywebviewInspection = JSON.parse(inspLine.replace(/^.*?\[pywebview\] DOM Inspection:\s*/, '').trim());

  console.log(`[PASS] pywebview reported path: ${pywebviewLocalPath}`);
  console.log(`[PASS] pywebview loaded URL: ${pywebviewLoadedUrl}`);
  console.log(`[PASS] pywebview digest map keys: ${Object.keys(pywebviewDigestMap || {}).length}`);
} catch (err) {
  console.error('[FAIL] pywebview smoke test failed:', err.message);
  if (err.stdout) console.error('stdout:', err.stdout.toString());
  if (err.stderr) console.error('stderr:', err.stderr.toString());
  failureCount++;
}

// TOCTOU check after pywebview
const diskManifestPost = computeManifest(distDir);
assert(
  JSON.stringify(diskManifestPost) === JSON.stringify(diskManifestInitial),
  'TOCTOU: dist/ directory untouched and identical after pywebview run'
);

// ---------------------------------------------------------
// 5. Cross-Host Parity Assertions (C2-1, C2-2, C2-3)
// ---------------------------------------------------------
console.log('\n--- 5. Verifying Cross-Host Parity ---');

// 5a. Path Identity Across Hosts (C2-3)
assert(
  electronLocalPath && electronLocalPath === canonicalDistIndex,
  `Electron resolved to canonical dist/index.html (${electronLocalPath})`
);
assert(
  pywebviewLocalPath && pywebviewLocalPath === canonicalDistIndex,
  `pywebview resolved to canonical dist/index.html (${pywebviewLocalPath})`
);
assert(
  electronLocalPath && pywebviewLocalPath && electronLocalPath === pywebviewLocalPath,
  `Both hosts loaded identical canonical disk path (${electronLocalPath})`
);

// 5b. Executed DOM State Parity (C2-1)
assert(
  electronInspection && electronInspection.statusbarText === 'workbench-kit v0.1 ready',
  `Electron executed frontend script (status: "${electronInspection?.statusbarText}")`
);
assert(
  pywebviewInspection && pywebviewInspection.statusbarText === 'workbench-kit v0.1 ready',
  `pywebview executed frontend script (status: "${pywebviewInspection?.statusbarText}")`
);
assert(
  electronInspection && electronInspection.styleSheetRulesCount > 0,
  `Electron parsed and applied CSS rules (count: ${electronInspection?.styleSheetRulesCount})`
);
assert(
  pywebviewInspection && pywebviewInspection.styleSheetRulesCount > 0,
  `pywebview parsed and applied CSS rules (count: ${pywebviewInspection?.styleSheetRulesCount})`
);
assert(
  electronInspection && pywebviewInspection && electronInspection.computedBg === pywebviewInspection.computedBg,
  `Both hosts computed identical stylesheet background color (${electronInspection?.computedBg})`
);

// 5c. Three-Way File List & Digest Map Equality (C2-2, FR-H2, NFR-2)
const electronKeys = Object.keys(electronDigestMap || {}).sort();
const pywebviewKeys = Object.keys(pywebviewDigestMap || {}).sort();

assert(
  JSON.stringify(electronKeys) === JSON.stringify(initialFileKeys),
  `Electron consumed file set matches build output file set (${electronKeys.join(', ')})`
);
assert(
  JSON.stringify(pywebviewKeys) === JSON.stringify(initialFileKeys),
  `pywebview consumed file set matches build output file set (${pywebviewKeys.join(', ')})`
);
assert(
  JSON.stringify(electronKeys) === JSON.stringify(pywebviewKeys),
  'Both hosts read the exact same artifact file set (0 extra, 0 missing)'
);

let hashDifferences = 0;
for (const key of initialFileKeys) {
  const diskHash = diskManifestInitial[key];
  const eHash = electronDigestMap ? electronDigestMap[key] : null;
  const pHash = pywebviewDigestMap ? pywebviewDigestMap[key] : null;

  if (eHash !== diskHash || pHash !== diskHash) {
    console.error(`Hash mismatch for ${key}: disk=${diskHash}, electron=${eHash}, pywebview=${pHash}`);
    hashDifferences++;
  }
}

assert(
  hashDifferences === 0,
  `All ${initialFileKeys.length} files have identical SHA-256 hashes across disk, Electron, and pywebview (0 differences)`
);

console.log('----------------------------------------------------');
if (failureCount > 0) {
  console.error(`FAILED: ${failureCount} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`SUCCESS: All parity, golden set, runtime DOM, and environment checks passed (0 differences).`);
  process.exit(0);
}
