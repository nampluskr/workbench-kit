const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Robust switches for headless / CI / restricted environments
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(os.tmpdir(), 'wb-phase4-userdata-' + Math.random().toString(36).slice(2)));

const rootDir = path.resolve(__dirname, '..');
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
const suitePath = path.join(__dirname, 'phase4-suite.js');

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
      nodeIntegration: false,
      contextIsolation: false,
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
      window.__runPhase4TestSuite();
    `);

    console.log('[electron] Phase 4 Results: ' + JSON.stringify(testResult));
    assert(testResult && testResult.success === true, 'All Phase 4 Electron in-browser runtime assertions executed successfully');
    assert(BrowserWindow.getAllWindows().length === 1, 'Electron BrowserWindow count strictly remains 1 across all operations (FR-C8)');
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
