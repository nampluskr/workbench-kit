const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isSmokeTest = process.argv.includes('--smoke-test');

ipcMain.on('window:minimize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.minimize();
});

ipcMain.on('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  }
});

ipcMain.on('window:close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

ipcMain.handle('dialog:open-folder', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

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
        return {
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isContainer,
        };
      })
    );
  } catch (err) {
    throw new Error(`Failed to read directory ${dirPath}: ${err.message}`);
  }
});

const INSPECTION_EXPRESSION = `
JSON.stringify({
  href: window.location.href,
  title: document.title,
  statusbarText: document.getElementById('statusbar-message') ? document.getElementById('statusbar-message').textContent.trim() : (document.getElementById('statusbar') ? document.getElementById('statusbar').textContent.trim() : null),
  domAssets: Array.from(document.querySelectorAll('script[src], link[href]')).map(function(el) { return el.getAttribute('src') || el.getAttribute('href'); }),
  styleSheetsCount: document.styleSheets.length,
  styleSheetRulesCount: document.styleSheets.length > 0 && document.styleSheets[0].cssRules ? document.styleSheets[0].cssRules.length : 0,
  computedBg: window.getComputedStyle ? window.getComputedStyle(document.body).backgroundColor : null
})
`.trim();

function hashFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function computeDigestMap(distDir, domAssets) {
  const map = {};
  const indexPath = path.join(distDir, 'index.html');
  map['index.html'] = hashFile(indexPath);

  for (const rawAsset of domAssets) {
    if (!rawAsset) continue;
    const cleanRel = rawAsset.replace(/^\.\//, '').replace(/^\//, '');
    const assetPath = path.join(distDir, cleanRel);
    if (fs.existsSync(assetPath)) {
      const relKey = path.relative(distDir, assetPath).replace(/\\/g, '/');
      map[relKey] = hashFile(assetPath);
    }
  }
  return map;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const rootDir = path.resolve(__dirname, '../../../');
  const distDir = path.join(rootDir, 'dist');
  const distIndexPath = path.join(distDir, 'index.html');
  const realDistIndexPath = fs.existsSync(distIndexPath) ? fs.realpathSync(distIndexPath) : distIndexPath;

  win.webContents.on('did-finish-load', async () => {
    if (isSmokeTest) {
      try {
        const currentUrl = win.webContents.getURL();
        const inspectionJson = await win.webContents.executeJavaScript(INSPECTION_EXPRESSION);
        const inspection = JSON.parse(inspectionJson);
        const digestMap = computeDigestMap(distDir, inspection.domAssets || []);

        process.stdout.write(`[Electron] Local Path: ${realDistIndexPath}\n`);
        process.stdout.write(`[Electron] Loaded URL: ${currentUrl}\n`);
        process.stdout.write(`[Electron] Digest Map: ${JSON.stringify(digestMap)}\n`);
        process.stdout.write(`[Electron] DOM Inspection: ${inspectionJson}\n`, () => {
          app.quit();
        });
      } catch (err) {
        process.stderr.write(`[Electron] Error inspecting loaded DOM: ${err.message}\n`);
        process.exit(1);
      }
    }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    process.stderr.write(`[Electron] Failed to load ${realDistIndexPath}: ${errorDescription} (${errorCode})\n`);
    process.exit(1);
  });

  win.loadFile(distIndexPath);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
