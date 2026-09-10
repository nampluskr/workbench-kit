const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Robust switches for headless / CI / restricted environments
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(os.tmpdir(), 'wb-phase5-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'phase5-suite.js');

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
      nodeIntegration: false,
      contextIsolation: false,
      backgroundThrottling: false,
    },
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
    const suiteCode = fs.readFileSync(suitePath, 'utf8');
    const testResult = await win.webContents.executeJavaScript(`
      ${suiteCode}
      window.__runPhase5TestSuite();
    `);

    console.log('[electron] Phase 5 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All Phase 5 Electron in-browser runtime assertions executed successfully');
  } catch (err) {
    console.error(`[FAIL] Error executing in-browser tests: ${err.message}`);
    failureCount++;
  } finally {
    win.destroy();
    if (failureCount > 0) {
      app.exit(1);
    } else {
      app.quit();
    }
  }
});
