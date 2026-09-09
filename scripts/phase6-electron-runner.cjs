const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Same fs:read-dir handler as src/hosts/electron/main.cjs — duplicated
// here because this runner is a standalone Electron main process that
// never requires main.cjs (which would also create its own window).
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

// Robust switches for headless / CI / restricted environments
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// Round-1 adversarial finding (Major): a fresh random userData dir every run
// made a genuine cross-launch persistence test impossible — everything ran
// in one process, so restart was only ever simulated via editor.clear() +
// restoreLastSession() in the same renderer. When WB_PHASE6_USERDATA_DIR is
// set (by the two-launch check in verify-phase6.mjs), reuse that exact
// profile dir across two separate `electron` process invocations instead, so
// FR-K1's localStorage entry survives a real process exit and relaunch.
const sharedUserDataDir = process.env.WB_PHASE6_USERDATA_DIR;
app.setPath('userData', sharedUserDataDir || path.join(os.tmpdir(), 'wb-phase6-userdata-' + Math.random().toString(36).slice(2)));

const mode = process.env.WB_PHASE6_MODE; // undefined | 'launch1' | 'launch2'

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'phase6-suite.js');

// FR-K1 needs one real, readable directory to open and restore. FR-N6a
// needs a second, distinct one so the recent-folders picker test can prove
// selecting a non-most-recent entry actually works.
const testTmpDir = mode ? process.env.WB_PHASE6_TESTDIR : fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase6-testdir-'));
const testTmpDir2 = mode ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase6-testdir2-'));

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      // Matches the real app's webPreferences (FR-G2/G3 need the actual
      // window.workbenchHost bridge so fs errors on a bogus path really
      // propagate, instead of the bridge being absent and silently
      // no-op'ing to an empty directory listing).
      preload: path.join(rootDir, 'src/hosts/electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Same native close gate as src/hosts/electron/main.cjs — duplicated here
  // (round-2 adversarial finding, Major: the standalone runner previously had
  // neither this handler nor the 'window:close' IPC listener, so P6-FR-L6's
  // Cancel case could never actually exercise the real host close gate; only
  // editor.confirmQuit() in isolation was proven, not the gate around it).
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

  win.webContents.on('console-message', (_event, _level, message) => {
    if (message.includes('Content Security Policy directive')) return;
    if (message.startsWith('[TEST_ASSERT]')) {
      const parts = message.replace('[TEST_ASSERT]', '').split('|||');
      const pass = parts[0] === 'PASS';
      const msg = parts[1];
      assert(pass, msg);
    } else {
      console.log('BROWSER_LOG:', message);
    }
  });

  await win.loadFile(distIndexPath);

  try {
    if (mode === 'launch1') {
      // Opens the real folder through the real app, then exits normally
      // (no editor.clear()/state reset) so the ONLY thing carrying state
      // into launch2 is whatever the app itself persisted (localStorage in
      // this profile dir), not anything the test harness injected.
      await win.webContents.executeJavaScript(`
        (async () => {
          await window.__workbenchApp.openFolder(${JSON.stringify(testTmpDir)});
        })();
      `);
      assert(true, 'launch1: opened the real folder through app.openFolder() before exiting');
    } else if (mode === 'launch2') {
      // Fresh renderer, same userData profile as launch1 (real process
      // relaunch, not editor.clear() in the same process). Proves FR-K1's
      // restart claim against real persisted state instead of simulating it.
      const restoredLabel = await win.webContents.executeJavaScript(`
        (async () => {
          await window.__workbenchApp.restoreLastSession();
          await new Promise((r) => setTimeout(r, 150));
          const el = document.getElementById('sidebar-title');
          return el ? el.textContent : null;
        })();
      `);
      assert(
        Boolean(restoredLabel) && restoredLabel !== 'EXPLORER',
        `launch2 (real process relaunch, same profile): restoreLastSession() restores launch1's folder (found sidebar title: ${restoredLabel})`
      );
    } else {
      const suiteCode = fs.readFileSync(suitePath, 'utf8');
      const testResult = await win.webContents.executeJavaScript(`
        window.__testTmpDir = ${JSON.stringify(testTmpDir)};
        window.__testTmpDir2 = ${JSON.stringify(testTmpDir2)};
        ${suiteCode}
        window.__runPhase6TestSuite();
      `);

      console.log('[electron] Phase 6 Results: ' + JSON.stringify(testResult));
      assert(testResult && testResult.success === true, 'All Phase 6 Electron in-browser runtime assertions executed successfully');
    }
  } catch (err) {
    console.error(`[FAIL] Error executing in-browser tests: ${err.message}`);
    failureCount++;
  } finally {
    win.destroy();
    if (!mode) {
      try {
        fs.rmSync(testTmpDir, { recursive: true, force: true });
        fs.rmSync(testTmpDir2, { recursive: true, force: true });
      } catch {}
    }
    if (failureCount > 0) {
      app.exit(1);
    } else {
      app.quit();
    }
  }
});
