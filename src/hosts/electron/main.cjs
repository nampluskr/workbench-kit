const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const pty = require('node-pty');

const isSmokeTest = process.argv.includes('--smoke-test');
if (isSmokeTest) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-smoke-el-'));
  app.setPath('userData', tempDir);
}

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

ipcMain.handle('dialog:open-file', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('fs:read-text-file', async (_e, filePath) => {
  const bytes = await fs.promises.readFile(filePath);
  if (bytes.includes(0)) throw new Error('Binary files cannot be opened as text');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
});

ipcMain.handle('fs:write-text-file', async (_e, filePath, contents) => {
  await fs.promises.writeFile(filePath, contents, 'utf8');
  return true;
});

const terminals = new Map();
let terminalCounter = 0;
ipcMain.handle('terminal:start', async (e, kind, cwd) => {
  if (kind !== 'cmd' && kind !== 'powershell') throw new Error('Unsupported shell');
  if (!(await fs.promises.stat(cwd)).isDirectory()) throw new Error('Terminal working directory is not a folder');
  const win = BrowserWindow.fromWebContents(e.sender);
  const id = `terminal-${++terminalCounter}`;
  const shell = kind === 'cmd' ? 'cmd.exe' : 'powershell.exe';
  const termProcess = pty.spawn(shell, [], { cwd, cols: 80, rows: 24, env: processEnvForTerminal() });
  const state = { process: termProcess, output: '', exited: false };
  termProcess.onData((data) => {
    state.output = (state.output + data).slice(-1_000_000);
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:data', id, data);
    }
  });
  termProcess.onExit(() => {
    state.exited = true;
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:exit', id);
    }
  });
  terminals.set(id, state);
  return id;
});

function processEnvForTerminal() { return { ...process.env }; }
ipcMain.handle('terminal:read', (_e, id) => {
  const state = terminals.get(id);
  if (!state) return { output: '', exited: true };
  const output = state.output;
  state.output = '';
  return { output, exited: state.exited };
});
ipcMain.handle('terminal:write', (_e, id, data) => { terminals.get(id)?.process.write(data); });
ipcMain.handle('terminal:resize', (_e, id, cols, rows) => {
  terminals.get(id)?.process.resize(Math.max(2, cols), Math.max(2, rows));
});
ipcMain.handle('terminal:close', (_e, id) => {
  terminals.get(id)?.process.kill();
  terminals.delete(id);
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

/**
 * Every accessible drive root, with its volume label (v0.3 WK-111 /
 * WK-111 follow-up, user request, 2026-09-17: show it Explorer-style, e.g.
 * "System (C:)") in one PowerShell call —
 * `[System.IO.DriveInfo]::GetDrives()`, .NET's own API, not the `Get-
 * Volume` cmdlet: `Get-Volume` reads the newer Storage Management API,
 * which silently OMITS a virtual/cloud-mounted drive letter (e.g. Google
 * Drive's own drive) entirely — found empirically (2026-09-17) as a real
 * dual-host inconsistency: pywebview's `GetVolumeInformationW` (the
 * classic win32 API `DriveInfo` itself calls under the hood) correctly
 * reported a Google Drive mount's label while `Get-Volume` did not list it
 * at all. `DriveInfo`'s `IsReady` filter also replaces the previous
 * per-letter `fs.promises.access()` loop — both ask the same underlying
 * question ("is this drive actually reachable right now"), so one
 * PowerShell call now does the whole job. Not the `vol` command's free-
 * text output either, since that text is in the OS's OWN display language
 * and would silently fail to parse on a Korean/other non-English system —
 * `DriveInfo`'s property NAMES stay `Name`/`VolumeLabel` regardless.
 */
ipcMain.handle('fs:list-drives', async () => {
  if (process.platform !== 'win32') return Array.from([]);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | Select-Object Name,VolumeLabel | ConvertTo-Json -Compress',
      ],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const parsed = JSON.parse(stdout);
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          resolve(
            rows
              .filter((row) => row && row.Name)
              .map((row) => ({ path: row.Name, label: row.VolumeLabel || '' }))
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
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

  // The window can leave the maximized state through more than the
  // 'window:maximize' IPC above — double-clicking the draggable titlebar
  // region (style.css -webkit-app-region: drag) and an OS-level Snap both
  // call win.maximize()/unmaximize() directly. These native events fire for
  // all of those the same way, so the renderer's button icon (FR request,
  // 2026-09-15) always matches the real window state.
  win.on('maximize', () => win.webContents.send('window:maximized-changed', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false));

  // Native/title-bar close asks first if any tab is dirty, same as File >
  // Exit (FR-L6, D-28). Resolves near-instantly to true for an undirtied
  // session, so this is a no-op for smoke tests and other automated flows.
  // File > Exit routes through this exact same gate (via closeWindow() ->
  // 'window:close' -> win.close(), below) rather than confirming separately,
  // so a dirty tab is asked about exactly once no matter which path
  // triggered the close (round-2 adversarial finding, Major: asking twice).
  let allowClose = false;
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    win.webContents
      .executeJavaScript('window.__workbenchApp ? window.__workbenchApp.confirmQuit() : true')
      .then((ok) => {
        if (ok) {
          allowClose = true;
          win.close();
        }
      })
      .catch((err) => {
        // Round-2 adversarial finding (Critical): this used to close
        // unconditionally, which meant a real save failure during
        // confirmQuit() (the save handler's promise rejecting, propagating
        // through executeJavaScript) closed the window anyway and lost the
        // unsaved edit. Fail closed instead — an unexpected error here must
        // never be treated as permission to discard unsaved content.
        console.error('[Electron] confirmQuit() failed; window stays open:', err);
      });
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

app.on('before-quit', () => {
  for (const state of terminals.values()) {
    try { state.process.kill(); } catch { /* ignore */ }
  }
  terminals.clear();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
