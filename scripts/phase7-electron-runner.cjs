const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Same fs:read-dir handler as src/hosts/electron/main.cjs — duplicated here
// because this runner is a standalone Electron main process that never
// requires main.cjs (which would also create its own window). Also used to
// make FR-A22's Refresh check genuine: the shell has 0 file-write API of its
// own (INTENT 7), so an out-of-band real file is dropped into
// testTmpDir3 (a directory used ONLY for this one check, so the injection
// can't shift item counts/indices any other test relies on) right after its
// first real read, simulating a file appearing on disk after the folder was
// already open — the exact scenario FR-A22's own judged method describes
// (round-2 finding, Critical).
let testTmpDir3ReadCount = 0;
ipcMain.handle('fs:read-dir', async (_e, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    // Inject AFTER the read resolves so the 1st (initial-open) response
    // does not include it — only the 2nd read (the Refresh click) will.
    if (dirPath === testTmpDir3) {
      testTmpDir3ReadCount++;
      if (testTmpDir3ReadCount === 1) {
        fs.writeFileSync(path.join(testTmpDir3, 'appeared-on-refresh.txt'), 'new');
      }
    }
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
app.setPath('userData', path.join(os.tmpdir(), 'wb-phase7-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'phase7-suite.js');

// A real folder with enough root-level entries and 1 nested level so the
// icon-theme, view-titlebar, and tree keyboard/mouse navigation checks
// (Home/End/PageUp/PageDown/Shift-range-select) all have something real to
// exercise — a 2-entry folder is too thin for those (round-1 finding).
const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase7-testdir-'));
fs.writeFileSync(path.join(testTmpDir, 'alpha.txt'), 'alpha');
fs.mkdirSync(path.join(testTmpDir, 'beta-folder'));
fs.writeFileSync(path.join(testTmpDir, 'beta-folder', 'gamma.txt'), 'gamma');
fs.writeFileSync(path.join(testTmpDir, 'charlie.txt'), 'charlie');
fs.writeFileSync(path.join(testTmpDir, 'delta.txt'), 'delta');
fs.mkdirSync(path.join(testTmpDir, 'echo-folder'));
fs.writeFileSync(path.join(testTmpDir, 'echo-folder', 'foxtrot.txt'), 'foxtrot');

// A 2nd distinct folder so FR-A1's literal "open P, then open Q, P
// disappears" can be proven, not just "some folder opened" (round-2 finding).
const testTmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase7-testdir2-'));
fs.writeFileSync(path.join(testTmpDir2, 'zulu.txt'), 'zulu');

// A 3rd distinct folder used only for FR-A22's real Refresh check (see the
// fs:read-dir handler above).
const testTmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase7-testdir3-'));
fs.writeFileSync(path.join(testTmpDir3, 'existing.txt'), 'existing');

// Round-2 adversarial finding (Critical): FR-A1 was only exercised via
// app.openFolder() directly, never the real File > Open Folder menu item /
// Ctrl+O path. That path's only truly non-synthesizable segment is the
// native OS picker itself — everything else (menu click, IPC round-trip,
// host bridge) is real production code. Stub ONLY the picker's return value
// (the suite sets window.__nextDialogPath just before triggering the real
// menu click; this handler reads it back from the renderer), keeping the
// entire renderer-to-host chain real. Registered after `win` exists so the
// handler can read that global via executeJavaScript.

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
      preload: path.join(rootDir, 'src/hosts/electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  ipcMain.handle('dialog:open-folder', async () => {
    const selected = await win.webContents.executeJavaScript('window.__nextDialogPath ?? null');
    return selected;
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

  // Round-2 adversarial finding (Critical): the renderer-side click checks
  // alone cannot observe real OS window state (sandboxed renderer). A
  // Node-side win.isMinimized()/isMaximized() check was attempted here,
  // gated behind win.show() (state is unobservable on a never-shown
  // window on some platforms) — but showing a real window in this
  // environment made the whole runner hang (ETIMEDOUT), which is worse
  // than the gap it was trying to close: a flaky/hanging mandatory-phase
  // gate blocks every other check in this file too. Reverted; FR-N4's real
  // OS-level state remains unverified beyond the renderer-side click-
  // dispatch-without-error check in phase7-suite.js. Flagged as an open
  // item for round 3 / human decision rather than risking suite reliability.

  try {
    const suiteCode = fs.readFileSync(suitePath, 'utf8');
    // Round-2 finding: N9's version check accepted any semver string,
    // independent of the actually-running package version. Read the real
    // package.json here (Node-side) and inject it so the suite can compare
    // against the ACTUAL current version, not just a well-formed pattern.
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
    const testResult = await win.webContents.executeJavaScript(`
      window.__testTmpDir = ${JSON.stringify(testTmpDir)};
      window.__testTmpDir2 = ${JSON.stringify(testTmpDir2)};
      window.__testTmpDir3 = ${JSON.stringify(testTmpDir3)};
      window.__expectedVersion = ${JSON.stringify(pkgVersion)};
      ${suiteCode}
      window.__runPhase7TestSuite();
    `);

    console.log('[electron] Phase 7 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All Phase 7 Electron in-browser runtime assertions executed successfully');
  } catch (err) {
    console.error(`[FAIL] Error executing in-browser tests: ${err.message}`);
    failureCount++;
  } finally {
    win.destroy();
    try {
      fs.rmSync(testTmpDir, { recursive: true, force: true });
      fs.rmSync(testTmpDir2, { recursive: true, force: true });
      fs.rmSync(testTmpDir3, { recursive: true, force: true });
    } catch {}
    if (failureCount > 0) {
      app.exit(1);
    } else {
      app.quit();
    }
  }
});
