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

// v0.3 Phase 4 restart check needs the SAME userData profile shared across
// two separate `electron` process invocations — the same pattern
// scripts/phase6-electron-runner.cjs already established for FR-K1.
const sharedUserDataDir = process.env.WB_P4_USERDATA_DIR;
app.setPath('userData', sharedUserDataDir || path.join(os.tmpdir(), 'wb-v04p4-userdata-' + Math.random().toString(36).slice(2)));

const mode = process.env.WB_P4_MODE; // undefined | 'launch1' | 'launch2'

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'v04-phase4-suite.js');

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

/**
 * A folder with a sub/ subdirectory and enough root-level files to actually
 * overflow the Explorer's visible height — a tiny fixture made `scrollTop`
 * always clamp to 0, so the scroll-restoration assertion could pass even if
 * scroll persistence were removed entirely (A4 R1 Major finding).
 */
function makeFixture(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'inner.txt'), 'inner');
  for (let i = 0; i < 60; i++) {
    fs.writeFileSync(path.join(dir, `file-${String(i).padStart(2, '0')}.txt`), String(i));
  }
  return dir;
}

app.whenReady().then(async () => {
  // Restart-pair fixtures (env-provided so launch1 and launch2 agree on paths).
  const dirA = mode ? process.env.WB_P4_DIR_A : null;
  const dirB = mode ? process.env.WB_P4_DIR_B : null;
  const dirC = mode ? process.env.WB_P4_DIR_C : null;
  // Single-session fixtures (only used when mode is unset).
  const fixtureDir = mode ? null : makeFixture('wb-v04p4-fixture-');
  const fixtureDir2 = mode ? null : makeFixture('wb-v04p4-fixture2-');

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
    if (mode === 'launch1') {
      const suiteCode = fs.readFileSync(suitePath, 'utf8');
      const result = await win.webContents.executeJavaScript(`
        ${suiteCode}
        window.__runV04Phase4Launch1Setup(${JSON.stringify(dirA)}, ${JSON.stringify(dirB)}, ${JSON.stringify(dirC)});
      `);
      console.log('[electron] v0.3 Phase 4 launch1 Results: ' + JSON.stringify(result));
      assert(result && result.success === true, 'launch1: all setup assertions passed');
    } else if (mode === 'launch2') {
      // Fresh renderer, same userData profile as launch1 (real process
      // relaunch) — startup already kicked off restoreFolderTabs().
      const suiteCode = fs.readFileSync(suitePath, 'utf8');
      const result = await win.webContents.executeJavaScript(`
        ${suiteCode}
        window.__runV04Phase4Launch2Verify(${JSON.stringify(dirA)}, ${JSON.stringify(dirB)}, ${JSON.stringify(dirC)});
      `);
      console.log('[electron] v0.3 Phase 4 launch2 Results: ' + JSON.stringify(result));
      assert(result && result.success === true, 'launch2: restart restored launch1\'s state');
    } else {
      const suiteCode = fs.readFileSync(suitePath, 'utf8');
      const result = await win.webContents.executeJavaScript(`
        window.__testTmpDir = ${JSON.stringify(fixtureDir)};
        window.__testTmpDir2 = ${JSON.stringify(fixtureDir2)};
        ${suiteCode}
        window.__runV04Phase4SingleSession();
      `);
      console.log('[electron] v0.3 Phase 4 single-session Results: ' + JSON.stringify(result));
      assert(result && result.success === true, 'All v0.3 Phase 4 single-session Electron assertions passed');
    }
  } catch (err) {
    console.error(`[FAIL] Error executing in-browser tests: ${err.message}`);
    failureCount++;
  } finally {
    win.destroy();
    if (!mode) {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
        fs.rmSync(fixtureDir2, { recursive: true, force: true });
      } catch {}
    }
    if (failureCount > 0) {
      app.exit(1);
    } else {
      app.quit();
    }
  }
}).catch((err) => {
  console.error(`[FAIL] Electron runner setup failed: ${err && err.stack ? err.stack : err}`);
  app.exit(1);
});
