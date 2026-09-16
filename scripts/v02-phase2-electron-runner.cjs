const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Same fs:read-dir handler as src/hosts/electron/main.cjs — duplicated here
// because this runner is a standalone Electron main process that never
// requires main.cjs (which would also create its own window).
ipcMain.handle('fs:read-dir', async (_e, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return await Promise.all(
      entries.map(async (entry) => {
        let isContainer = entry.isDirectory();
        if (!isContainer && entry.isSymbolicLink()) {
          try {
            const stat = await fs.promises.stat(path.join(dirPath, entry.name));
            isContainer = stat.isDirectory();
          } catch {
            isContainer = false;
          }
        }
        return { name: entry.name, path: path.join(dirPath, entry.name), isContainer };
      })
    );
  } catch (err) {
    throw new Error(`Failed to read directory ${dirPath}: ${err.message}`);
  }
});

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(os.tmpdir(), 'wb-v02p2-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'v02-phase2-suite.js');

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

/** Real files on disk, so the tree reads something that genuinely exists. */
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v02p2-fixture-'));
  fs.writeFileSync(path.join(dir, 'alpha.txt'), 'alpha');
  fs.writeFileSync(path.join(dir, 'beta.txt'), 'beta');
  fs.writeFileSync(path.join(dir, 'gamma.txt'), 'gamma');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'inner.txt'), 'inner');
  // Enough rows that the tree overflows its viewport (FR-F9).
  for (let i = 1; i <= 40; i++) {
    fs.writeFileSync(path.join(dir, 'file-' + String(i).padStart(2, '0') + '.txt'), 'n' + i);
  }
  return dir;
}

app.whenReady().then(async () => {
  const fixtureDir = makeFixture();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // The window has to actually paint: dockview commits tab activation in a
    // requestAnimationFrame callback, which never runs in a hidden or
    // throttled renderer (v0.2 SPEC 3절 제약).
    show: true,
    webPreferences: {
      preload: path.join(rootDir, 'src/hosts/electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      sandbox: true,
    },
  });

  win.webContents.on('console-message', (_event, _level, message) => {
    if (message.includes('Content Security Policy directive')) return;
    if (message.startsWith('[TEST_ASSERT]')) {
      const parts = message.replace('[TEST_ASSERT]', '').split('|||');
      assert(parts[0] === 'PASS', parts[1]);
    } else {
      console.log('BROWSER_LOG:', message);
    }
  });

  await win.loadFile(distIndexPath);

  try {
    const suiteCode = fs.readFileSync(suitePath, 'utf8');
    const testResult = await win.webContents.executeJavaScript(`
      window.__testTmpDir = ${JSON.stringify(fixtureDir)};
      ${suiteCode}
      window.__runV02Phase2Suite();
    `);
    console.log('[electron] v0.2 Phase 2 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All v0.2 Phase 2 Electron assertions passed');
  } catch (err) {
    console.error(`[FAIL] Error executing in-browser tests: ${err.message}`);
    failureCount++;
  } finally {
    win.destroy();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    if (failureCount > 0) {
      app.exit(1);
    } else {
      app.quit();
    }
  }
});
