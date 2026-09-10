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

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(os.tmpdir(), 'wb-v02p5-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'v02-phase5-suite.js');

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

/** A real folder three levels deep, so FR-X8/FR-X9 have depths 0, 1, 2 to measure. */
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v02p5-fixture-'));
  fs.writeFileSync(path.join(dir, 'root-file.txt'), 'root');
  const l1 = path.join(dir, 'level-one');
  fs.mkdirSync(l1);
  fs.writeFileSync(path.join(l1, 'one.txt'), 'one');
  const l2 = path.join(l1, 'level-two');
  fs.mkdirSync(l2);
  fs.writeFileSync(path.join(l2, 'two.txt'), 'two');
  const l3 = path.join(l2, 'level-three');
  fs.mkdirSync(l3);
  fs.writeFileSync(path.join(l3, 'three.txt'), 'three');
  return dir;
}

function createWindow(quiet) {
  const w = new BrowserWindow({
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
  w.webContents.on('console-message', (_event, _level, message) => {
    if (quiet) return;
    if (message.includes('Content Security Policy directive')) return;
    if (message.startsWith('[TEST_ASSERT]')) {
      const parts = message.replace('[TEST_ASSERT]', '').split('|||');
      assert(parts[0] === 'PASS', parts[1]);
    } else {
      console.log('BROWSER_LOG:', message);
    }
  });
  return w;
}

// Keep the app alive across the window recreate in the FR-X7 restart check.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const fixtureDir = makeFixture();
  let win = createWindow(false);

  await win.loadFile(distIndexPath);

  try {
    const suiteCode = fs.readFileSync(suitePath, 'utf8');
    const testResult = await win.webContents.executeJavaScript(`
      window.__testTmpDir = ${JSON.stringify(fixtureDir)};
      ${suiteCode}
      window.__runV02Phase5Suite();
    `);
    console.log('[electron] v0.2 Phase 5 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All v0.2 Phase 5 Electron assertions passed');

    // FR-X7 / SPEC divergence X-5: a genuine reopen. Resize the explorer
    // through the real handler (End -> 40% of the window), then TEAR DOWN the
    // window and create a brand-new one against the SAME userData profile —
    // an actual app-window restart, not a page reload. localStorage and any
    // host-side state survive; the CSS variable and the DOM do not. The new
    // window must start the explorer at its initial width.
    const widthBeforeRestart = await win.webContents.executeJavaScript(`
      (() => {
        const h = document.getElementById('sidebar-resize-handle');
        h.focus();
        h.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        return document.getElementById('sidebar').getBoundingClientRect().width;
      })()
    `);
    // Create the fresh window BEFORE tearing the old one down, so the app is
    // never at zero windows (which would auto-quit and skip this check).
    const win2 = createWindow(true);
    await win2.loadFile(distIndexPath);
    await new Promise((r) => setTimeout(r, 500));
    const reopenState = await win2.webContents.executeJavaScript(`
      (() => {
        const sb = document.getElementById('sidebar');
        const root = document.getElementById('workbench-root');
        return {
          width: sb ? sb.getBoundingClientRect().width : null,
          inlineVar: root ? root.style.getPropertyValue('--sidebar-width') : 'n/a',
        };
      })()
    `);
    console.log('[electron] FR-X7 restart: ' + JSON.stringify({ widthBeforeRestart, reopenState }));
    assert(
      reopenState.width !== null && reopenState.width >= 274 && reopenState.width <= 286 &&
        reopenState.inlineVar === '' && Math.abs(widthBeforeRestart - 280) > 30,
      `The explorer was resized to ${Math.round(widthBeforeRestart)}px, then a fresh app window in the same profile starts it back at its initial ~280px with no --sidebar-width override (FR-X7, SPEC X-5)`
    );
    win.destroy();
    win = win2;
  } catch (err) {
    console.error(`[FAIL] Error executing in-browser tests: ${err.message}`);
    failureCount++;
  } finally {
    for (const w of BrowserWindow.getAllWindows()) w.destroy();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    if (failureCount > 0) {
      app.exit(1);
    } else {
      app.quit();
    }
  }
});
