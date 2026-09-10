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
app.setPath('userData', path.join(os.tmpdir(), 'wb-v02p4-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'v02-phase4-suite.js');

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

/** Three real folders for Recent Folders (FR-M7), each holding a file whose icon the icon theme draws (FR-M9). */
function makeFolders() {
  return [0, 1, 2].map(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v02p4-recent-'));
    fs.writeFileSync(path.join(dir, 'note.txt'), 'note');
    return dir;
  });
}

app.whenReady().then(async () => {
  const folders = makeFolders();
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

  // The same native close gate as src/hosts/electron/main.cjs, so File > Exit
  // and Alt+F4 are judged against the real "ask before closing" path (FR-M5).
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
        console.error('[electron-runner] confirmQuit() failed; window stays open:', err);
      });
  });
  ipcMain.on('window:close', (e) => {
    if (BrowserWindow.fromWebContents(e.sender) === win) win.close();
  });

  // Only the native folder picker's answer is stubbed (Ctrl+O vs File > Open
  // Folder..., FR-M5); the menu -> IPC -> host chain stays real.
  ipcMain.handle('dialog:open-folder', async () => {
    return win.webContents.executeJavaScript('window.__nextDialogPath ?? null');
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
      window.__testTmpDirs = ${JSON.stringify(folders)};
      ${suiteCode}
      window.__runV02Phase4Suite();
    `);
    console.log('[electron] v0.2 Phase 4 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All v0.2 Phase 4 Electron assertions passed');
  } catch (err) {
    console.error(`[FAIL] Error executing in-browser tests: ${err.message}`);
    failureCount++;
  } finally {
    allowClose = true;
    win.destroy();
    for (const dir of folders) fs.rmSync(dir, { recursive: true, force: true });
    if (failureCount > 0) {
      app.exit(1);
    } else {
      app.quit();
    }
  }
});
