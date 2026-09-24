// Regression coverage for the Edit menu and File > Save (D-13, user request
// 2026-09-24): the File | Edit | View | Help order, the Edit rows and their
// shortcuts, each row acting on the active tab's text view, rows greyed out
// for a read-only Viewer tab and for a tab with no text view (file list),
// Ctrl+/ and Ctrl+D inside the editor, multi-cursor staying on, and Ctrl+S
// / File > Save writing the file and clearing the dirty mark.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-editmenu-profile-'));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-editmenu-'));
app.setPath('userData', profileDir);
app.on('quit', () => {
  for (const dir of [profileDir, fixture]) {
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-editmenu-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { /* Windows may still hold the profile briefly. */ }
    }
  }
});
const jsFile = path.join(fixture, 'sample.js');
const viewFile = path.join(fixture, 'view.js');
fs.writeFileSync(jsFile, 'alpha\nbeta\nalpha\n', 'utf8');
fs.writeFileSync(viewFile, 'read only\n', 'utf8');

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
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__workbenchApp;
  const JS = ${JSON.stringify(jsFile)};
  const VIEW = ${JSON.stringify(viewFile)};
  const FIX = ${JSON.stringify(fixture)};
  const inner = () => a.kindRegistry.getInnerForTest(a.editor.getActivePanel().id);
  const content = () => inner().getContentForTest();
  const openMenu = (cat) => {
    a.menu.openMenu();
    const row = document.querySelector('.menu-category-row[data-category-id="' + cat + '"]');
    row.dispatchEvent(new MouseEvent('mouseenter'));
    row.click();
  };
  const rowEl = (id) => document.querySelector('.menu-item-row[data-item-id="' + id + '"]');
  const disabled = (id) => { openMenu(id.split(':')[0]); const d = rowEl(id).classList.contains('disabled'); a.menu.closeMenu(); return d; };
  const clickRow = async (id) => { openMenu(id.split(':')[0]); rowEl(id).click(); await wait(250); };
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
  // userGesture: clipboard cut/paste from a menu row needs the activation a real click gives.
  const run = (body) => win.webContents.executeJavaScript(`(async () => { ${HELPERS} ${body} })()`, true);
  const sendKey = async (keyCode, modifiers) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    // Typing a character also needs the char event, as a real key press sends.
    if (keyCode.length === 1 && modifiers.length === 0) win.webContents.sendInputEvent({ type: 'char', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await new Promise((r) => setTimeout(r, 250));
  };
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const r1 = await run(`
      a.editor.clear();
      await wait(300);
      const r = {};
      a.menu.openMenu();
      r.groupOrder = [...document.querySelectorAll('.menu-category-row .menu-category-label')].map((e) => e.textContent).join('|') === 'File|Edit|View|Help';
      a.menu.closeMenu();
      r.editRows = a.menu.getEditItems().filter((i) => i.type !== 'separator').map((i) => i.label + '=' + i.shortcut).join('|') ===
        'Undo=Ctrl+Z|Redo=Ctrl+Y|Cut=Ctrl+X|Copy=Ctrl+C|Paste=Ctrl+V|Find=Ctrl+F|Replace=Ctrl+H|' +
        'Toggle Line Comment=Ctrl+/|Toggle Block Comment=Shift+Alt+A|Select All=Ctrl+A|' +
        'Add Next Occurrence=Ctrl+D|Add Cursor Above=Ctrl+Alt+Up|Add Cursor Below=Ctrl+Alt+Down';
      r.noTabAllDisabled = ['edit:undo', 'edit:copy', 'edit:select-all', 'file:save'].every(disabled);

      await a.editor.openItem(JS, 'sample.js', { meta: { kind: 'file', mode: 'editor' } });
      await wait(800);
      r.editorCleanUndoDisabled = disabled('edit:undo') && !disabled('edit:copy') && !disabled('edit:paste') && disabled('file:save');
      // Menu rows act on the text view even though the click took focus.
      document.body.focus();
      await clickRow('edit:comment-line');
      r.menuCommentLine = content().startsWith('// alpha');
      r.saveEnabledWhenDirty = !disabled('file:save') && !disabled('edit:undo');
      await clickRow('edit:undo');
      r.menuUndo = content() === 'alpha\\nbeta\\nalpha\\n';
      await clickRow('edit:redo');
      r.menuRedo = content().startsWith('// alpha');
      await clickRow('edit:undo');
      await clickRow('edit:select-all');
      await clickRow('edit:copy');
      await clickRow('edit:cut');
      r.menuCut = content() === '';
      await clickRow('edit:paste');
      r.menuPaste = content() === 'alpha\\nbeta\\nalpha\\n';
      await clickRow('edit:find');
      r.menuFindOpensWidget = Boolean(document.querySelector('.find-widget.visible'));
      return r;
    `);
    // Real keys (sendInputEvent) inside the editor. A real click puts focus
    // there: monaco 0.56 reads keys through its own edit-context element,
    // so focusing a textarea from script would not do.
    const at = await run(`
      const b = document.querySelector('.editor-panel-content .monaco-editor').getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 3), y: Math.round(b.top + b.height / 2) };
    `);
    win.focus();
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 300));
    await sendKey('Home', ['control']);
    await sendKey('/', ['control']);
    const afterSlash = await run(`return content();`);
    await sendKey('Z', ['control']);
    // Cursor sits on "alpha": the first Ctrl+D selects it, the second adds
    // the "alpha" on line 3.
    await sendKey('D', ['control']);
    await sendKey('D', ['control']);
    const cursors = await run(`return document.querySelectorAll('.editor-panel-content .monaco-editor .cursors-layer .cursor').length;`);
    await sendKey('Escape', []);
    await sendKey('End', ['control']);
    await sendKey('X', []);
    const dirtyBeforeSave = await run(`return a.editor.getActivePanel().params.isDirty === true;`);
    await sendKey('S', ['control']);
    await new Promise((r) => setTimeout(r, 500));
    const r2 = {
      ctrlSlashComments: afterSlash.startsWith('// alpha'),
      ctrlDAddsCursors: cursors >= 2,
      ctrlSSaves: dirtyBeforeSave && fs.readFileSync(jsFile, 'utf8') === 'alpha\nbeta\nalpha\nX',
    };
    r2.ctrlSClearsDirty = await run(`return a.editor.getActivePanel().params.isDirty === false;`);
    const r3 = await run(`
      const r = {};
      // File > Save row.
      const panel = a.editor.getActivePanel();
      inner().appendContentForTest('Y');
      await wait(200);
      await clickRow('file:save');
      await wait(400);
      r.menuSaveClearsDirty = panel.params.isDirty === false;

      // Viewer: write rows greyed out, read rows available.
      await a.editor.openItem(VIEW, 'view.js', { meta: { kind: 'file', mode: 'viewer' } });
      await wait(800);
      r.viewerWriteDisabled = ['edit:cut', 'edit:paste', 'edit:replace', 'edit:comment-line', 'edit:block-comment'].every(disabled);
      r.viewerReadEnabled = !['edit:copy', 'edit:find', 'edit:select-all', 'edit:add-next-occurrence'].some(disabled);

      // A tab with no text view (file list).
      await a.editor.openItem(FIX, 'fixture', { meta: { kind: 'folder', mode: 'file-list' } });
      await wait(700);
      r.fileListAllDisabled = a.menu.getEditItems().filter((i) => i.type !== 'separator').every((i) => disabled(i.id));
      // Keyboard: ArrowRight from File reaches Edit; Enter on a greyed row
      // does nothing, so the menu stays open.
      a.menu.openMenu();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await wait(50);
      r.keyboardReachesEdit = document.querySelector('.menu-category-row.active')?.dataset.categoryId === 'edit';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      r.enterOnGreyedRowIgnored = a.menu.isOpen;
      a.menu.closeMenu();
      return r;
    `);
    const result = { ...r1, ...r2, ...r3 };
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
