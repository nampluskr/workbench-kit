const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pty = require('node-pty');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-open-modes-'));
app.setPath('userData', path.join(fixture, 'profile'));
app.on('quit', () => {
  const resolved = path.resolve(fixture);
  const expectedParent = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(expectedParent) && path.basename(resolved).startsWith('wb-open-modes-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Windows may still hold the WebView profile briefly. */ }
  }
});
const filePath = path.join(fixture, 'sample.txt');
fs.writeFileSync(filePath, 'first line', 'utf8');

ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:read-dir', async (_e, dir) => (await fs.promises.readdir(dir, { withFileTypes: true }))
  .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name), isContainer: entry.isDirectory() })));
ipcMain.handle('fs:read-text-file', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('fs:write-text-file', async (_e, file, content) => {
  await fs.promises.writeFile(file, content, 'utf8');
  return true;
});
const terminals = new Map();
let nextId = 0;
ipcMain.handle('terminal:start', (e, kind, cwd) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const id = `test-${++nextId}`;
  const proc = pty.spawn(kind === 'cmd' ? 'cmd.exe' : 'powershell.exe', [], {
    cwd, cols: 80, rows: 24, env: process.env,
  });
  const state = { proc, output: '', exited: false };
  proc.onData((data) => {
    state.output += data;
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:data', id, data);
    }
  });
  proc.onExit(() => {
    state.exited = true;
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:exit', id);
    }
  });
  terminals.set(id, state);
  return id;
});
ipcMain.handle('terminal:read', (_e, id) => {
  const state = terminals.get(id);
  if (!state) return { output: '', exited: true };
  const output = state.output;
  state.output = '';
  return { output, exited: state.exited };
});
ipcMain.handle('terminal:write', (_e, id, data) => { terminals.get(id)?.proc.write(data); });
ipcMain.handle('terminal:resize', (_e, id, cols, rows) => { terminals.get(id)?.proc.resize(cols, rows); });
ipcMain.handle('terminal:close', (_e, id) => {
  const state = terminals.get(id);
  terminals.delete(id);
  try { state?.proc.kill(); } catch { /* already exited */ }
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1000, height: 700, show: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const app = window.__workbenchApp;
      app.editor.clear();
      await app.handleOpenFileDialog(${JSON.stringify(filePath)});
      await wait(300);
      const filePanel = app.editor.getActivePanel();
      const fileView = app.kindRegistry.getInnerForTest(filePanel.id);
      const viewer = filePanel.params.mode === 'viewer' && fileView.getContentForTest() === 'first line';
      app.setActivePanelMode('editor');
      fileView.appendContentForTest(' changed');
      const dirty = filePanel.params.isDirty === true;
      const saved = await app.kindRegistry.save(filePanel.id);
      const stayedInTab = app.editor.getActivePanel().id === filePanel.id;
      await app.handleOpenFolderDialog(${JSON.stringify(fixture)});
      await wait(300);
      const folderPanel = app.editor.getActivePanel();
      const fileList = folderPanel.params.mode === 'file-list' &&
        [...document.querySelectorAll('.folder-file-list-row')].some((row) => row.textContent.includes('sample.txt'));
      app.openResource(${JSON.stringify(fixture)}, 'terminal', 'terminal', 'cmd', 'pinned');
      await wait(500);
      const terminalPanel = app.editor.getActivePanel();
      const terminal = terminalPanel.params.kind === 'terminal' &&
        typeof terminalPanel.params.terminalSessionKey === 'string' &&
        Boolean(document.querySelector('.preset-terminal-view .xterm'));
      const separateTabs = folderPanel.id !== terminalPanel.id;
      await app.editor.closeActiveTab();
      await wait(500);
      return { viewer, dirty, saved, stayedInTab, fileList, terminal, separateTabs };
    })()`);
    const diskSaved = fs.readFileSync(filePath, 'utf8').includes('changed');
    const closedTerminal = terminals.size === 0;
    console.log(JSON.stringify({ ...result, diskSaved, closedTerminal }));
    if (!Object.values(result).every(Boolean) || !diskSaved || !closedTerminal) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const state of terminals.values()) {
      try { state.proc.kill(); } catch { /* already exited */ }
    }
    win.destroy();
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
