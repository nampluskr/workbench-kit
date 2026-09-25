// Regression coverage for Explorer create / rename on disk (D-14, user
// request 2026-09-24): New File / New Folder create real entries (the file
// opens in Editor mode), bad or taken names re-open the input with what was
// typed, F2 renames in place (stem pre-selected, Escape cancels, the root
// refuses), and open tabs follow a renamed file or folder with their unsaved
// edits intact. The create / rename IPC runs the real src/hosts/electron/
// fs-ops.cjs.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsOps = require('../src/hosts/electron/fs-ops.cjs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-fileops-profile-'));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-fileops-'));
app.setPath('userData', profileDir);
app.on('quit', () => {
  for (const dir of [profileDir, fixture]) {
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-fileops-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { /* Windows may still hold the profile briefly. */ }
    }
  }
});
fs.mkdirSync(path.join(fixture, 'sub'));
fs.writeFileSync(path.join(fixture, 'sub', 'inner.txt'), 'inner', 'utf8');
fs.writeFileSync(path.join(fixture, 'taken.txt'), 'taken', 'utf8');
fs.writeFileSync(path.join(fixture, 'notes.md'), 'hello', 'utf8');

ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:drive-total-bytes', () => 0);
ipcMain.handle('fs:path-exists', () => true);
ipcMain.handle('fs:read-dir', async (_e, dir) => Promise.all((await fs.promises.readdir(dir, { withFileTypes: true }))
  .map(async (entry) => {
    const full = path.join(dir, entry.name);
    const st = await fs.promises.stat(full);
    return { name: entry.name, path: full, isContainer: entry.isDirectory(),
      size: entry.isDirectory() ? null : st.size, mtimeMs: st.mtimeMs };
  })));
ipcMain.handle('fs:read-text-file', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('fs:write-text-file', async (_e, file, contents) => { await fs.promises.writeFile(file, contents, 'utf8'); return true; });
ipcMain.handle('fs:create-file', (_e, p) => fsOps.createFile(p));
ipcMain.handle('fs:create-folder', (_e, p) => fsOps.createFolder(p));
ipcMain.handle('fs:rename-path', (_e, a, b) => fsOps.renamePath(a, b));
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__workbenchApp;
  const FIX = ${JSON.stringify(fixture)};
  const SUB = ${JSON.stringify(path.join(fixture, 'sub'))};
  const j = (...p) => [FIX, ...p].join('\\\\');
  const input = () => document.querySelector('.sidebar-content .tree-input-field');
  const renameInput = () => document.querySelector('.sidebar-content .tree-rename-field');
  const press = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const typeAndEnter = async (text) => { const i = input(); i.value = text; press(i, 'Enter'); await wait(700); };
  const status = () => document.getElementById('statusbar')?.textContent || '';
  const f2 = async (id) => { a.tree.focusItemById(id); await wait(50); press(document.querySelector('.sidebar-content .tree-list'), 'F2'); await wait(100); };
  const panelOn = (p) => a.editor.getPanels().find((x) => x.params?.targetId === p);
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.focus();
  const run = (body) => win.webContents.executeJavaScript(`(async () => { ${HELPERS} ${body} })()`);
  const exists = (...p) => fs.existsSync(path.join(fixture, ...p));
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const r1 = await run(`
      a.editor.clear();
      await a.handleOpenFolderDialog(FIX);
      await wait(500);
      await a.tree.setExpanded(a.tree.getRoot().id, true);
      await wait(200);
      const r = {};
      // New File at the root.
      a.tree.focusItemById(a.tree.getRoot().id);
      document.getElementById('sidebar-action-new-file').click();
      await wait(100);
      r.newFileInputOpens = Boolean(input());
      await typeAndEnter('created.js');
      r.newFileSelected = a.tree.getFocusedId() === j('created.js');
      const p = a.editor.getActivePanel();
      r.newFileOpensInEditor = p?.params?.targetId === j('created.js') && p?.params?.mode === 'editor';
      // New Folder inside the selected sub folder.
      a.tree.focusItemById(SUB);
      document.getElementById('sidebar-action-new-folder').click();
      await wait(100);
      await typeAndEnter('made');
      r.newFolderSelected = a.tree.getFocusedId() === j('sub', 'made');
      // A taken name: nothing written, the input re-opens with the name.
      a.tree.focusItemById(a.tree.getRoot().id);
      document.getElementById('sidebar-action-new-file').click();
      await wait(100);
      await typeAndEnter('taken.txt');
      r.takenReopensWithName = input()?.value === 'taken.txt' && /already exists/.test(status());
      press(input(), 'Escape');
      await wait(100);
      // An invalid name.
      document.getElementById('sidebar-action-new-file').click();
      await wait(100);
      await typeAndEnter('bad:name.txt');
      r.invalidReopens = input()?.value === 'bad:name.txt' && /cannot contain/.test(status());
      press(input(), 'Escape');
      await wait(100);
      return r;
    `);
    r1.newFileOnDisk = exists('created.js') && fs.readFileSync(path.join(fixture, 'created.js'), 'utf8') === '';
    r1.newFolderOnDisk = fs.statSync(path.join(fixture, 'sub', 'made')).isDirectory();
    r1.takenUntouched = fs.readFileSync(path.join(fixture, 'taken.txt'), 'utf8') === 'taken';
    r1.invalidNotCreated = !fs.readdirSync(fixture).some((n) => n.startsWith('bad'));

    const r2 = await run(`
      const r = {};
      // F2 selects the stem; Escape cancels.
      await f2(j('notes.md'));
      r.f2OpensInput = renameInput()?.value === 'notes.md' &&
        renameInput().selectionStart === 0 && renameInput().selectionEnd === 5;
      press(renameInput(), 'Escape');
      await wait(200);
      r.escapeCancels = !renameInput() && Boolean(a.tree.getNodeById(j('notes.md')));
      // The root refuses.
      await f2(a.tree.getRoot().id);
      r.rootRefuses = !renameInput();
      // Rename a dirty open file: the tab follows with its edits.
      await a.editor.openItem(j('notes.md'), 'notes.md', { meta: { kind: 'file', mode: 'editor' } });
      await wait(700);
      a.kindRegistry.getInnerForTest(panelOn(j('notes.md')).id).appendContentForTest(' world');
      await wait(200);
      await f2(j('notes.md'));
      renameInput().value = 'renamed.md';
      press(renameInput(), 'Enter');
      await wait(900);
      const moved = panelOn(j('renamed.md'));
      r.tabFollowsFile = Boolean(moved) && !panelOn(j('notes.md')) && moved.api.title === 'renamed.md';
      r.tabKeepsEdits = moved?.params?.isDirty === true &&
        a.kindRegistry.getInnerForTest(moved.id).getContentForTest() === 'hello world';
      r.renamedSelected = a.tree.getFocusedId() === j('renamed.md');
      // Save goes to the new path.
      a.editor.getApi().getPanel(moved.id).api.setActive();
      await wait(100);
      a.menu.triggerItem('file:save');
      await wait(500);
      r.saveClearsDirty = moved.params.isDirty === false;
      // Rename a folder with an open file inside and an open file list on it.
      await a.editor.openItem(j('sub', 'inner.txt'), 'inner.txt', { meta: { kind: 'file', mode: 'viewer' } });
      await a.editor.openItem(SUB, 'sub', { meta: { kind: 'folder', mode: 'file-list' } });
      await wait(700);
      await a.tree.setExpanded(SUB, true);
      await f2(SUB);
      r.folderSelectsAll = renameInput()?.selectionEnd === 3;
      renameInput().value = 'sub2';
      press(renameInput(), 'Enter');
      await wait(1000);
      r.folderTabsFollow = Boolean(panelOn(j('sub2', 'inner.txt'))) && Boolean(panelOn(j('sub2'))) &&
        !panelOn(j('sub', 'inner.txt')) && !panelOn(SUB);
      r.folderStaysExpanded = a.tree.isExpanded(j('sub2'));
      // Renaming onto a taken name is refused.
      await f2(j('renamed.md'));
      renameInput().value = 'taken.txt';
      press(renameInput(), 'Enter');
      await wait(600);
      r.renameOntoTakenRefused = /already exists/.test(status()) && Boolean(a.tree.getNodeById(j('renamed.md')));
      // Case-only rename is allowed.
      await f2(j('taken.txt'));
      renameInput().value = 'Taken.txt';
      press(renameInput(), 'Enter');
      await wait(700);
      r.caseOnlyRenameInTree = Boolean(a.tree.getNodeById(j('Taken.txt')));
      return r;
    `);
    const names = fs.readdirSync(fixture);
    r2.fileRenamedOnDisk = names.includes('renamed.md') && !names.includes('notes.md');
    r2.savedToNewPath = fs.readFileSync(path.join(fixture, 'renamed.md'), 'utf8') === 'hello world' && !names.includes('notes.md');
    r2.folderRenamedOnDisk = names.includes('sub2') && !names.includes('sub') && fs.existsSync(path.join(fixture, 'sub2', 'inner.txt'));
    r2.takenStillThere = fs.readFileSync(path.join(fixture, 'Taken.txt'), 'utf8') === 'taken';
    r2.caseOnlyOnDisk = names.includes('Taken.txt') && !names.includes('taken.txt');
    const result = { ...r1, ...r2 };
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
