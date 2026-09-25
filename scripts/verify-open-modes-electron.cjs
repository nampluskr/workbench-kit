const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsOps = require('../src/hosts/electron/fs-ops.cjs');

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
const pythonPath = path.join(fixture, 'sample.py');
const jsonPath = path.join(fixture, 'sample.json');
fs.writeFileSync(pythonPath, 'print("hello")', 'utf8');
fs.writeFileSync(jsonPath, '{"ok": true}', 'utf8');

ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:drive-total-bytes', () => null);
ipcMain.handle('fs:read-dir', async (_e, dir) => (await fs.promises.readdir(dir, { withFileTypes: true }))
  .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name), isContainer: entry.isDirectory() })));
ipcMain.handle('fs:read-text-file', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('fs:probe-text-file', (_e, file) => fsOps.probeTextFile(file));
ipcMain.handle('fs:read-legacy-text-file', (_e, file) => fsOps.readLegacyTextFile(file));
ipcMain.handle('fs:write-text-file', async (_e, file, content) => {
  await fs.promises.writeFile(file, content, 'utf8');
  return true;
});
const terminals = new Map();
let nextId = 0;
ipcMain.handle('terminal:start', (e, kind, cwd) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const id = `test-${++nextId}`;
  const state = { output: 'BOOT_ONCE\r\n', streaming: false, exited: false, win };
  terminals.set(id, state);
  return id;
});
ipcMain.handle('terminal:read', (_e, id) => {
  const state = terminals.get(id);
  if (!state) return { output: '', exited: true };
  const output = state.output;
  state.output = '';
  state.streaming = true;
  setTimeout(() => {
    if (terminals.has(id) && state.win && !state.win.isDestroyed()) {
      state.win.webContents.send('terminal:data', id, 'PUSH_ONCE\r\n');
    }
  }, 50);
  return { output, exited: state.exited };
});
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', (_e, id) => {
  terminals.delete(id);
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
      if (!filePanel) throw new Error('No file panel after Open File');
      const fileView = app.kindRegistry.getInnerForTest(filePanel.id);
      const viewer = filePanel.params.mode === 'viewer' && fileView.getContentForTest() === 'first line';
      const pressInFileTab = (key) => {
        app.kindRegistry.focusPanel(filePanel.id);
        const root = app.editor.getContentRenderer(filePanel.id).element;
        const target = root.contains(document.activeElement) ? document.activeElement : root;
        return target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      };
      pressInFileTab('F4');
      const f4Editor = filePanel.params.mode === 'editor' &&
        document.getElementById('statusbar-mode-btn').textContent === 'File: Editor';
      pressInFileTab('F4');
      const f4Idempotent = filePanel.params.mode === 'editor';
      pressInFileTab('F3');
      const f3Viewer = filePanel.params.mode === 'viewer' &&
        document.getElementById('statusbar-mode-btn').textContent === 'File: Viewer';
      app.menu.openMenu();
      const fileF4BlockedByMenu = !pressInFileTab('F4') && filePanel.params.mode === 'viewer';
      app.menu.closeMenu();
      pressInFileTab('F4');
      fileView.appendContentForTest(' changed');
      const dirty = filePanel.params.isDirty === true;
      const saved = await app.kindRegistry.save(filePanel.id);
      const stayedInTab = app.editor.getActivePanel().id === filePanel.id;
      await app.handleOpenFileDialog(${JSON.stringify(pythonPath)});
      const pyPanel = app.editor.getActivePanel();
      const pyLanguage = app.kindRegistry.getInnerForTest(pyPanel.id).getLanguageForTest();
      await app.handleOpenFileDialog(${JSON.stringify(jsonPath)});
      const jsonPanel = app.editor.getActivePanel();
      const jsonLanguage = app.kindRegistry.getInnerForTest(jsonPanel.id).getLanguageForTest();
      const syntaxLanguages = pyLanguage.id === 'python' && pyLanguage.registered &&
        jsonLanguage.id === 'json' && jsonLanguage.registered;
      await app.handleOpenFolderDialog(${JSON.stringify(fixture)});
      await wait(300);
      app.openResource(${JSON.stringify(fixture)}, 'folder', 'folder', 'file-list', 'pinned');
      await wait(400);
      const folderPanel = app.editor.getActivePanel();
      if (!folderPanel) throw new Error('No folder panel after Open Folder');
      const fileList = folderPanel.params.mode === 'file-list' &&
        [...document.querySelectorAll('.folder-file-list .tree-row')].some((row) => row.textContent.includes('sample.txt'));
      const pressInTree = (key, options = {}) => {
        app.tree.focusTree();
        const list = document.querySelector('.sidebar-content .tree-list');
        return list.dispatchEvent(new KeyboardEvent('keydown', { key, ...options, bubbles: true, cancelable: true }));
      };
      app.tree.focusItemById(${JSON.stringify(filePath)});
      pressInTree('F3');
      await wait(300);
      const treeF3Viewer = app.editor.getActivePanel()?.params?.targetId === ${JSON.stringify(filePath)} &&
        app.editor.getActivePanel()?.params?.mode === 'viewer';
      pressInTree('F4');
      await wait(300);
      const treeF4Editor = app.editor.getActivePanel()?.params?.targetId === ${JSON.stringify(filePath)} &&
        app.editor.getActivePanel()?.params?.mode === 'editor';
      pressInTree('f', { ctrlKey: true });
      const treeCtrlFFind = app.tree.getIsFindOpen();
      if (treeCtrlFFind) app.tree.closeFindWidget();
      app.tree.focusItemById(${JSON.stringify(fixture)});
      const beforeFolderF3 = app.editor.getPanelCount();
      pressInTree('F3');
      const folderF3Ignored = app.editor.getPanelCount() === beforeFolderF3;
      app.tree.focusItemById(${JSON.stringify(filePath)});
      const beforeMenuKeys = app.editor.getPanelCount();
      app.menu.openMenu();
      const hamburgerF3Prevented = !pressInTree('F3');
      const hamburgerSuppressesF3 = hamburgerF3Prevented && app.editor.getPanelCount() === beforeMenuKeys;
      app.menu.closeMenu();
      app.contextMenu.show(0, 0, app.contextMenuItemsForTreeNode(${JSON.stringify(filePath)}));
      const contextF4Prevented = !pressInTree('F4');
      const contextFindPrevented = !pressInTree('f', { ctrlKey: true });
      const contextMenuSuppressesF4 = contextF4Prevented && contextFindPrevented &&
        !app.tree.getIsFindOpen() && app.editor.getPanelCount() === beforeMenuKeys;
      app.contextMenu.hide();
      app.openResource(${JSON.stringify(fixture)}, 'terminal', 'terminal', 'cmd', 'pinned');
      await wait(500);
      const terminalPanel = app.editor.getActivePanel();
      const terminal = terminalPanel.params.kind === 'terminal' &&
        typeof terminalPanel.params.terminalSessionKey === 'string' &&
        Boolean(document.querySelector('.preset-terminal-view .xterm'));
      const separateTabs = folderPanel.id !== terminalPanel.id;
      const statusbarFileOnly = document.getElementById('statusbar-mode-btn').style.display === 'none';
      const terminalF3 = new KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true });
      const terminalF4 = new KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true });
      const terminalElement = app.editor.getContentRenderer(terminalPanel.id).element;
      terminalElement.dispatchEvent(terminalF3);
      terminalElement.dispatchEvent(terminalF4);
      const terminalKeysPassed = !terminalF3.defaultPrevented && !terminalF4.defaultPrevented;
      folderPanel.api.setActive();
      terminalPanel.api.setActive();
      await wait(50);
      const terminalFocused = document.activeElement?.classList.contains('xterm-helper-textarea') === true;
      await wait(150);
      const transcript = app.kindRegistry.getInnerForTest(terminalPanel.id).getContentForTest();
      const streamedOnce = transcript.split('BOOT_ONCE').length === 2 &&
        transcript.split('PUSH_ONCE').length === 2;
      const layout = app.editor.getApi().toJSON();
      app.editor.getApi().fromJSON(layout);
      await wait(150);
      const restoredPanel = app.editor.getActivePanel();
      const restoredTranscript = app.kindRegistry.getInnerForTest(restoredPanel.id).getContentForTest();
      const restoredOnce = restoredPanel.params.terminalSessionKey === terminalPanel.params.terminalSessionKey &&
        restoredTranscript.split('BOOT_ONCE').length === 2 &&
        restoredTranscript.split('PUSH_ONCE').length === 2;
      app.openResource(${JSON.stringify(fixture)}, 'terminal', 'terminal', 'cmd', 'pinned', true);
      await wait(150);
      const forcedNewTab = app.editor.getActivePanel().id !== restoredPanel.id &&
        app.editor.getActiveGroup().panels.filter((panel) => panel.params.kind === 'terminal').length === 2;
      await app.editor.closeActiveTab();
      await app.editor.getApi().getPanel(restoredPanel.id).api.close();
      await wait(500);

      // A preview tab browsing one file after another must show the NEW
      // file's content, not just retitle and re-highlight over the old one.
      // The previous resource's value snapshot used to survive in the
      // panel's params (openItem clears it by sending undefined, which
      // dockview drops when merging), so the file preset saw a snapshot,
      // skipped its disk read, and kept rendering the first file.
      app.editor.clear();
      await wait(100);
      app.editor.openItem(${JSON.stringify(pythonPath)}, 'sample.py', { mode: 'preview', meta: { kind: 'file', mode: 'viewer' } });
      await wait(400);
      const previewFirst = app.editor.getActivePanel();
      const previewFirstText = app.kindRegistry.getInnerForTest(previewFirst.id).getContentForTest();
      app.editor.openItem(${JSON.stringify(jsonPath)}, 'sample.json', { mode: 'preview', meta: { kind: 'file', mode: 'viewer' } });
      await wait(400);
      const previewSecond = app.editor.getActivePanel();
      const previewSecondInner = app.kindRegistry.getInnerForTest(previewSecond.id);
      const previewSwapped = previewSecond.id === previewFirst.id &&
        previewFirstText.includes('print("hello")') &&
        previewSecondInner.getContentForTest().includes('"ok"') &&
        !previewSecondInner.getContentForTest().includes('print("hello")') &&
        previewSecondInner.getLanguageForTest().id === 'json';

      return { viewer, f4Editor, f4Idempotent, f3Viewer, fileF4BlockedByMenu,
        dirty, saved, stayedInTab,
        syntaxLanguages, fileList, treeF3Viewer, treeF4Editor, treeCtrlFFind, folderF3Ignored,
        hamburgerSuppressesF3, contextMenuSuppressesF4,
        terminal, terminalKeysPassed,
        separateTabs, statusbarFileOnly, terminalFocused,
        streamedOnce, restoredOnce, forcedNewTab, previewSwapped };
    })()`);
    const measureAbout = `(() => {
      const app = window.__workbenchApp;
      app.aboutDialog.show();
      const dialog = document.querySelector('.workbench-about-dialog');
      const card = document.querySelector('.about-licenses-card');
      const entries = [...card.querySelectorAll('.about-license-entry')];
      const note = document.querySelector('.about-licenses-note');
      const buttons = document.querySelector('.workbench-about-dialog .confirm-dialog-buttons');
      const dialogRect = dialog.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const noteRect = note.getBoundingClientRect();
      const buttonsRect = buttons.getBoundingClientRect();
      const dialogSize = [dialog.scrollHeight, dialog.clientHeight, dialog.scrollWidth, dialog.clientWidth];
      const cardSize = [card.scrollHeight, card.clientHeight, card.scrollWidth, card.clientWidth];
      const ok = entries.length === 6 &&
        card.scrollHeight <= card.clientHeight + 1 &&
        card.scrollWidth <= card.clientWidth + 1 &&
        dialog.scrollHeight <= dialog.clientHeight + 1 &&
        dialog.scrollWidth <= dialog.clientWidth + 1 &&
        dialogRect.top >= 0 && dialogRect.bottom <= window.innerHeight &&
        dialogRect.left >= 0 && dialogRect.right <= window.innerWidth &&
        noteRect.bottom <= dialogRect.bottom &&
        buttonsRect.bottom <= dialogRect.bottom &&
        entries.every((entry) => {
          const rect = entry.getBoundingClientRect();
          return rect.top >= cardRect.top && rect.bottom <= cardRect.bottom + 1 &&
            rect.left >= cardRect.left && rect.right <= cardRect.right + 1;
        });
      const result = { ok, viewport: [window.innerWidth, window.innerHeight],
        dialog: [...dialogSize, dialogRect.top, dialogRect.bottom],
        card: [...cardSize, cardRect.top, cardRect.bottom],
        noteBottom: noteRect.bottom, buttonsBottom: buttonsRect.bottom, entries: entries.length };
      app.aboutDialog.hide();
      return result;
    })()`;
    win.setSize(800, 600);
    const aboutLayout = await win.webContents.executeJavaScript(measureAbout);
    win.setSize(640, 480);
    const aboutCompactLayout = await win.webContents.executeJavaScript(measureAbout);
    const diskSaved = fs.readFileSync(filePath, 'utf8').includes('changed');
    const closedTerminal = terminals.size === 0;
    console.log(JSON.stringify({ ...result, aboutLayout, aboutCompactLayout, diskSaved, closedTerminal }));
    if (!Object.values(result).every(Boolean) || !aboutLayout.ok || !aboutCompactLayout.ok || !diskSaved || !closedTerminal) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.exit(process.exitCode || 0);
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
