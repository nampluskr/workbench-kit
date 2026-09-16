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
app.setPath('userData', path.join(os.tmpdir(), 'wb-v02p6-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'v02-phase6-suite.js');
const comparisonDoc = fs.readFileSync(path.join(rootDir, 'docs', 'vscode-comparison.md'), 'utf8');
const setiData = fs.readFileSync(path.join(rootDir, 'src', 'icons', 'data', 'seti.json'), 'utf8');

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

/** Representative names, plus enough files that the tree v-scrolls. */
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v02p6-fixture-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# readme');
  fs.writeFileSync(path.join(dir, 'index.ts'), 'export {};');
  fs.writeFileSync(path.join(dir, 'app.spec.ts'), 'test');
  fs.writeFileSync(path.join(dir, 'agents.md'), 'agents'); // has a vscode-icons LIGHT variant
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'main.ts'), 'main');
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(dir, `file-${i}.txt`), String(i));
  fs.writeFileSync(
    path.join(dir, 'a-deliberately-very-long-file-name-to-force-the-explorer-horizontal-scrollbar.txt'),
    'x'
  );
  return dir;
}

app.whenReady().then(async () => {
  const fixtureDir = makeFixture();
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
      window.__vscodeComparison = ${JSON.stringify(comparisonDoc)};
      window.__setiData = ${setiData};
      ${suiteCode}
      window.__runV02Phase6Suite();
    `);
    console.log('[electron] v0.2 Phase 6 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All v0.2 Phase 6 Electron assertions passed');

    // FR-D2: an ACTUAL maximize / restore, not a synthetic resize event. The
    // five chrome areas must still measure 30 in every state.
    const measure = () =>
      win.webContents.executeJavaScript(`
        (() => {
          const ts = document.querySelector('.dv-tabs-and-actions-container');
          return {
            titlebar: Math.round(document.getElementById('titlebar').getBoundingClientRect().height),
            statusbar: Math.round(document.getElementById('statusbar').getBoundingClientRect().height),
            activitybar: Math.round(document.getElementById('activity-bar').getBoundingClientRect().width),
            explorerHeader: Math.round(document.getElementById('sidebar-header').getBoundingClientRect().height),
            tabStrip: ts ? Math.round(ts.getBoundingClientRect().height) : null,
          };
        })()
      `);
    const normal = await measure();
    win.maximize();
    await new Promise((r) => setTimeout(r, 400));
    const maximized = await measure();
    win.unmaximize();
    await new Promise((r) => setTimeout(r, 400));
    const restored = await measure();
    // System-scale change: setZoomFactor is the renderer-side stand-in — it
    // scales device pixels exactly the way a system-DPI change does, while CSS
    // px (what FR-D1 measures) must stay 30 (FR-D2).
    win.webContents.setZoomFactor(1.5);
    await new Promise((r) => setTimeout(r, 400));
    const scaledUp = await measure();
    win.webContents.setZoomFactor(0.8);
    await new Promise((r) => setTimeout(r, 400));
    const scaledDown = await measure();
    win.webContents.setZoomFactor(1.0);
    await new Promise((r) => setTimeout(r, 300));
    const scaleRestored = await measure();
    const all30 = (o) => o && Object.values(o).every((v) => v === 30);
    console.log('[electron] FR-D2 maximize/restore/scale: ' + JSON.stringify({ normal, maximized, restored, scaledUp, scaledDown, scaleRestored }));
    assert(
      [normal, maximized, restored, scaledUp, scaledDown, scaleRestored].every(all30),
      'The five chrome areas stay exactly 30 CSS px through a real window maximize/restore AND a system-scale (zoom) change up and down (FR-D2)'
    );
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
