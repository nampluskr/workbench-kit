const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
ipcMain.handle('dialog:open-folder', async () => null);

// A15 round-1 Critical finding: the "Exit" NFR-8 row dispatches a real
// Alt+F4 and expects the confirm dialog to appear — but window:close had no
// handler here, so closeWindow()'s IPC message was silently dropped and the
// key path never reached anything. Mirror src/hosts/electron/main.cjs's real
// close gate (window:close -> win.close() -> 'close' event ->
// editor.confirmQuit() via executeJavaScript, Cancel keeps the window open)
// so the test exercises the actual production gate, not a stand-in for it.
ipcMain.on('window:close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.close();
});

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(os.tmpdir(), 'wb-v02p7-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'v02-phase7-suite.js');
const reservedKeysDoc = fs.readFileSync(path.join(rootDir, 'docs', 'reserved-keys.md'), 'utf8');

let failureCount = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v02p7-fixture-'));
  fs.writeFileSync(path.join(dir, 'alpha.txt'), 'a');
  fs.writeFileSync(path.join(dir, 'beta.ts'), 'export {};');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'inner.md'), '# inner');
  // FR-L3 (A15 round-1 Critical finding — was completely untested): a real
  // Korean file/folder name is USER DATA, not product text, and must still
  // show exactly as-is.
  fs.writeFileSync(path.join(dir, '한글파일.txt'), 'k');
  fs.mkdirSync(path.join(dir, '한글폴더'));
  fs.writeFileSync(path.join(dir, '한글폴더', '내용.txt'), 'k2');
  return dir;
}

app.whenReady().then(async () => {
  let fixtureDir;
  try {
    fixtureDir = makeFixture();
  } catch (err) {
    // A7/Major finding: fixture setup used to run unguarded inside the
    // whenReady().then() chain — a failure there (e.g. a locked/denied temp
    // dir) became an unhandled rejection with no structured result line, so
    // verify-v02-phase7.mjs's execSync would sit until the outer 5-minute
    // timeout instead of failing fast with a message.
    console.error(`[FAIL] Could not create the Phase 7 fixture directory: ${err.message}`);
    app.exit(1);
    return;
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(rootDir, 'src/hosts/electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      sandbox: true,
    },
  });
  ipcMain.removeHandler('dialog:open-folder');
  ipcMain.handle('dialog:open-folder', async () => win.webContents.executeJavaScript('window.__nextDialogPath ?? null'));

  // Same gate as src/hosts/electron/main.cjs: intercept close, ask
  // editor.confirmQuit() in the renderer, only actually close if it
  // resolves true (Save/Don't Save). The suite always clicks Cancel, so
  // allowClose never flips and this window stays open for the rest of the
  // run.
  let allowClose = false;
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    win.webContents
      .executeJavaScript('window.__workbenchApp ? window.__workbenchApp.editor.confirmQuit() : true')
      .then((ok) => {
        if (ok) {
          allowClose = true;
          win.close();
        }
      })
      .catch((err) => {
        console.error('[FAIL] confirmQuit() threw during the Exit keyboard-path test:', err);
      });
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
      window.__reservedKeysDoc = ${JSON.stringify(reservedKeysDoc)};
      ${suiteCode}
      window.__runV02Phase7Suite();
    `);
    console.log('[electron] v0.2 Phase 7 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All v0.2 Phase 7 Electron assertions passed');
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
}).catch((err) => {
  // Defense in depth: anything else thrown in the setup path (window
  // creation, loadFile) now fails fast with a message instead of leaving an
  // unhandled rejection for execSync's caller to time out on.
  console.error(`[FAIL] Unhandled error in v0.2 Phase 7 Electron runner: ${err && err.stack ? err.stack : err}`);
  app.exit(1);
});
