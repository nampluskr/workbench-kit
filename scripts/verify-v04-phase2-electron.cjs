const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsOps = require('../src/hosts/electron/fs-ops.cjs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04-p2-'));
app.setPath('userData', path.join(fixture, 'profile'));
const markdown = path.join(fixture, 'sample.md');
const textFile = path.join(fixture, 'plain.txt');
fs.writeFileSync(markdown, '# Heading\n', 'utf8');
fs.writeFileSync(textFile, 'plain\n', 'utf8');
app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-v04-p2-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Windows may hold the profile briefly. */ }
  }
});
ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:path-exists', () => true);
ipcMain.handle('fs:read-dir', async (_e, dir) => Promise.all((await fs.promises.readdir(dir, { withFileTypes: true })).map(async (entry) => {
  const full = path.join(dir, entry.name);
  const stat = await fs.promises.stat(full);
  return { name: entry.name, path: full, isContainer: entry.isDirectory(), size: entry.isDirectory() ? null : stat.size, mtimeMs: stat.mtimeMs };
})));
ipcMain.handle('fs:read-text-file', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('fs:read-legacy-text-file', (_e, file) => fsOps.readLegacyTextFile(file));
ipcMain.handle('fs:probe-text-file', (_e, file) => fsOps.probeTextFile(file));
ipcMain.handle('fs:write-text-file', async (_e, file, contents) => { await fs.promises.writeFile(file, contents, 'utf8'); return true; });
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: true, webPreferences: {
    preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
  } });
  const run = (body) => win.webContents.executeJavaScript(`(async () => {
    const a = window.__workbenchApp;
    const folder = ${JSON.stringify(fixture)};
    const md = ${JSON.stringify(markdown)};
    const txt = ${JSON.stringify(textFile)};
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const row = p => document.querySelector('.tree-row[data-id="' + CSS.escape(p) + '"]');
    const key = (target, k) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    ${body}
  })()`);
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await run(`
      await a.handleOpenFolderDialog(folder);
      await wait(300);
      const iconButton = document.querySelector('[data-item-id="activity:markdown-rendering"]');
      const r = {};
      r.initialOff = localStorage.getItem('workbench:markdown-rendering') !== 'true' && !!iconButton?.querySelector('svg rect[stroke="currentColor"]');
      r.placementAndLabel = iconButton?.previousElementSibling?.getAttribute('data-item-id') === 'activity:file-filter' &&
        iconButton?.getAttribute('title') === 'Markdown Rendering' && iconButton?.getAttribute('aria-label') === 'Markdown Rendering';
      const offColors = [];
      for (const theme of ['dark', 'light', 'gray']) {
        a.theme.setTheme(theme);
        const stroke = getComputedStyle(iconButton.querySelector('svg rect[stroke]')).stroke;
        offColors.push(stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)' ? stroke : '');
      }
      r.offIconColors = offColors.every(Boolean) && new Set(offColors).size === 3;
      a.theme.setTheme('dark');
      row(md).click(); await wait(350);
      r.offBehavior = a.editor.getActivePanel()?.params?.kind === 'file' && a.editor.getActivePanel()?.params?.mode === 'viewer';
      a.editor.clear(); iconButton.click();
      r.toggleOn = localStorage.getItem('workbench:markdown-rendering') === 'true' && !!iconButton.querySelector('svg mask');
      const themeColors = [];
      for (const theme of ['dark', 'light', 'gray']) {
        a.theme.setTheme(theme);
        const svg = iconButton.querySelector('svg');
        const fill = getComputedStyle(svg?.querySelector('rect[mask]')).fill;
        themeColors.push(svg?.getBoundingClientRect().width > 0 && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)' ? fill : '');
      }
      r.themeColors = themeColors.every(Boolean) && new Set(themeColors).size === 3;
      a.theme.setTheme('dark');
      row(md).click(); await wait(350);
      const panel = a.editor.getActivePanel();
      r.clickRendered = panel?.params?.kind === 'markdown' && panel?.params?.mode === 'rendered';
      const panelId = panel.id;
      const content = () => a.editor.getContentRenderer(panelId).element;
      key(content(), 'F4'); await wait(250);
      r.f4Editor = panel.params.kind === 'file' && panel.params.mode === 'editor' && panel.id === panelId;
      key(content(), 'F3'); await wait(250);
      r.f3Rendered = panel.params.kind === 'markdown' && panel.params.mode === 'rendered' && panel.id === panelId;
      iconButton.click();
      r.noRetroactiveSwitch = panel.params.mode === 'rendered';
      a.editor.clear(); row(md).click(); await wait(350);
      r.offAgain = a.editor.getActivePanel()?.params?.mode === 'viewer';
      a.editor.clear(); iconButton.click();
      a.setDefaultFileMode('editor'); row(md).click(); await wait(350);
      r.overrideDefault = a.editor.getActivePanel()?.params?.mode === 'rendered';
      a.editor.clear(); row(txt).click(); await wait(350);
      r.otherFile = a.editor.getActivePanel()?.params?.kind === 'file';
      a.editor.clear(); a.tree.focusItemById(md);
      key(document.querySelector('.tree-list'), 'F3'); await wait(350);
      r.treeF3 = a.editor.getActivePanel()?.params?.mode === 'rendered';
      a.editor.clear(); a.tree.focusItemById(md);
      key(document.querySelector('.tree-list'), 'F4'); await wait(350);
      r.treeF4 = a.editor.getActivePanel()?.params?.mode === 'editor';
      a.editor.clear(); a.tree.focusItemById(md);
      key(document.querySelector('.tree-list'), 'Enter'); await wait(350);
      r.treeEnter = a.editor.getActivePanel()?.params?.mode === 'rendered';
      a.editor.clear(); a.tree.focusItemById(md);
      key(document.querySelector('.tree-list'), 'F4'); await wait(350);
      const edited = a.editor.getActivePanel();
      a.kindRegistry.getInnerForTest(edited.id).appendContentForTest('dirty');
      const before = a.kindRegistry.getInnerForTest(edited.id).getContentForTest();
      row(md).click(); await wait(350);
      r.dirtySameFileClick = a.editor.getActivePanel()?.id === edited.id && edited.params.mode === 'rendered';
      key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
      r.dirtySameFileRestored = a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before && edited.params.isDirty === true;
      key(a.editor.getContentRenderer(edited.id).element, 'F3'); await wait(200);
      key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
      r.dirtyPreserved = edited.params.isDirty === true && a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before;
      iconButton.click(); a.setDefaultFileMode('viewer');
      row(md).click(); await wait(350);
      r.dirtySameFileOff = a.editor.getActivePanel()?.id === edited.id && edited.params.mode === 'viewer';
      key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
      r.offDirtyRestored = a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before && edited.params.isDirty === true;
      iconButton.click(); a.tree.focusItemById(md);
      key(document.querySelector('.tree-list'), 'F3'); await wait(350);
      r.dirtyTreeF3 = a.editor.getActivePanel()?.id === edited.id && edited.params.mode === 'rendered';
      key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
      r.treeF3DirtyRestored = a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before && edited.params.isDirty === true;
      a.setDefaultFileMode('editor');
      return r;
    `);
    await win.reload();
    result.restartOn = await win.webContents.executeJavaScript(`localStorage.getItem('workbench:markdown-rendering') === 'true' && !!document.querySelector('[data-item-id="activity:markdown-rendering"] svg mask')`);
    result.restartDefaultEditor = await win.webContents.executeJavaScript(`window.__workbenchApp.getDefaultFileMode() === 'editor'`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
