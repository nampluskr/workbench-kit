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
    // A painting window is required: dockview and monaco both commit
    // user input through requestAnimationFrame, which never runs in a hidden
    // or throttled renderer, so UI-path assertions silently measured a
    // workbench that had ignored the press (A7 R1-4 / R3-2).
    show: true,
    webPreferences: {
      // Matches the real app's webPreferences (FR-G2/G3 need the actual
      // window.workbenchHost bridge so fs errors on a bogus path really
      // propagate, instead of the bridge being absent and silently
      // no-op'ing to an empty directory listing).
      preload: path.join(rootDir, 'src/hosts/electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
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

  // FR-G2/FR-G4/FR-K1 used to call app.openFolder() straight from the suite,
  // which skipped the entire menu -> handleOpenFolderDialog() -> IPC -> host
  // chain the user's click actually travels (A7 R1-4). Stub only the native
  // picker's return value, exactly as the Phase 7 runner does, so everything
  // between the menu row and the host stays real production code.
  ipcMain.handle('dialog:open-folder', async () => {
    return win.webContents.executeJavaScript('window.__nextDialogPath ?? null');
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
      // A8 Round-1 (Critical): the setup here went straight to
      // app.openFolder(). Go through the real File > 폴더 열기 menu row
      // instead, with only the native picker's return value stubbed, so what
      // launch2 restores is state the real user path produced.
      const openedRoot = await win.webContents.executeJavaScript(`
        (async () => {
          window.__nextDialogPath = ${JSON.stringify(testTmpDir)};
          const hamburger = document.getElementById('menu-hamburger-btn');
          if (!document.getElementById('workbench-menu-dropdown') && hamburger) {
            hamburger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
          const catRow = document.querySelector('.menu-category-row[data-category-id="file"]');
          if (catRow) catRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          const itemRow = document.querySelector('.menu-item-row[data-item-id="file:open-folder"]');
          if (!itemRow) return null;
          itemRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          let openedId = null;
          for (let i = 0; i < 400; i++) {
            await new Promise((r) => setTimeout(r, 10));
            const root = window.__workbenchApp.tree.getRoot();
            if (root) { openedId = root.id; break; }
          }
          // Leave a tab open, so launch2's FR-K2 check ("prior tabs are not
          // restored") has something that could have come back but must not.
          window.__workbenchApp.editor.addNewTab();
          await new Promise((r) => setTimeout(r, 50));
          return openedId;
        })();
      `);
      assert(
        openedRoot === testTmpDir,
        `launch1: the real File > 폴더 열기 menu path opened ${testTmpDir} before exiting (got: ${openedRoot})`
      );
    } else if (mode === 'launch2') {
      // Fresh renderer, same userData profile as launch1 (real process
      // relaunch, not editor.clear() in the same process). Proves FR-K1's
      // restart claim against real persisted state instead of simulating it.
      // A8 Round-1 (Critical): asserting only "the title is not EXPLORER" let
      // a restore of some entirely different folder pass.
      // A8 Round-2 (Critical): calling restoreLastSession() from here also
      // bypassed the production startup wiring -- deleting the call in
      // src/main.ts left this green -- and it read back only the root, never
      // the pane/tab/expansion state FR-K2 and FR-K3 are about. Observe what
      // normal startup produced instead, and check all three.
      const restored = await win.webContents.executeJavaScript(`
        (async () => {
          const app = window.__workbenchApp;
          // Startup already kicked off restoreLastSession(); wait for it to
          // land rather than invoking it a second time.
          for (let i = 0; i < 200; i++) {
            if (app.tree.getRoot()) break;
            await new Promise((r) => setTimeout(r, 10));
          }
          await new Promise((r) => setTimeout(r, 100));
          const root = app.tree.getRoot();
          return {
            rootId: root ? root.id : null,
            groupCount: app.editor.getGroupCount(),
            panelCount: app.editor.getPanelCount(),
            visibleRows: document.querySelectorAll('.tree-row:not(.tree-input-row)').length,
          };
        })();
      `);
      assert(
        restored.rootId === testTmpDir,
        `launch2 (real process relaunch, same profile): startup alone restores exactly launch1's folder, with no restoreLastSession() call from the harness (restored: ${restored.rootId}, expected: ${testTmpDir}) (FR-K1)`
      );
      assert(
        restored.groupCount === 1 && restored.panelCount === 0,
        `launch2: a real relaunch comes up with 칸 수 1 · 탭 수 0, resurrecting none of launch1's tabs (got ${restored.groupCount} groups / ${restored.panelCount} tabs) (FR-K2, D-27)`
      );
      assert(
        restored.visibleRows <= 1,
        `launch2: a real relaunch shows only the root row; tree expansion is not restored (got ${restored.visibleRows} rows) (FR-K3, D-27)`
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
