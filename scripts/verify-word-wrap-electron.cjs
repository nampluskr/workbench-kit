// Regression coverage for View > Appearance > Word Wrap (user request,
// 2026-09-24): text and document files (txt, md, no extension, ...) wrap
// at the tab width by default, code files do not, the menu row sits just
// above Show Line Numbers and is checked by default, turning it off
// unwraps open views and new ones, the choice survives a reload, and a
// narrower tab (a split) wraps into more lines. Judged by what monaco
// renders — the number of visual lines for one long logical line.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-wordwrap-profile-'));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-wordwrap-'));
app.setPath('userData', profileDir);
app.on('quit', () => {
  for (const dir of [profileDir, fixture]) {
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-wordwrap-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { /* Windows may still hold the profile briefly. */ }
    }
  }
});
const LONG = 'word '.repeat(120).trim();
for (const name of ['notes.md', 'a.txt', 'README', 'code.py', 'b.txt']) {
  // No trailing newline: exactly one logical line, so an unwrapped view renders 1 line.
  fs.writeFileSync(path.join(fixture, name), LONG, 'utf8');
}

ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:drive-total-bytes', () => 0);
ipcMain.handle('fs:path-exists', () => true);
ipcMain.handle('fs:read-dir', () => []);
ipcMain.handle('fs:read-text-file', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__workbenchApp;
  const j = (n) => ${JSON.stringify(fixture)} + '\\\\' + n;
  const open = async (n) => { await a.editor.openItem(j(n), n, { mode: 'pinned', meta: { kind: 'file', mode: 'editor' } }); await wait(700); };
  // Visual lines monaco renders for the active tab (one logical line here).
  const lines = (n) => {
    const p = a.editor.getPanels().find((x) => x.params?.targetId === j(n));
    const el = p && a.editor.getContentRenderer(p.id)?.element;
    return el ? el.querySelectorAll('.view-lines .view-line').length : -1;
  };
  const appearanceRows = () => a.menu.getSubmenuItems('view:appearance').filter((r) => r.type !== 'separator').map((r) => r.label);
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  const run = (body) => win.webContents.executeJavaScript(`(async () => { ${HELPERS} ${body} })()`);
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const r1 = await run(`
      localStorage.removeItem('workbench:word-wrap');
      return true;
    `);
    win.webContents.reload();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const r2 = await run(`
      await wait(500);
      a.editor.clear();
      const r = {};
      const rows = appearanceRows();
      r.rowAboveLineNumbers = rows.indexOf('Word Wrap') >= 0 && rows.indexOf('Word Wrap') + 1 === rows.indexOf('Show Line Numbers');
      // The rendered row carries the check mark (child submenus are drawn with the menu).
      a.menu.openMenu();
      r.checkedByDefault = Boolean(document.querySelector('[data-item-id="view:toggle-word-wrap"] .menu-item-check .codicon-check'));
      a.menu.closeMenu();
      for (const n of ['notes.md', 'a.txt', 'README', 'code.py']) await open(n);
      // Each file opens pinned in turn; measure each while it is the active tab.
      const measure = async (n) => { a.editor.getPanels().find((x) => x.params?.targetId === j(n)).api.setActive(); await wait(250); return lines(n); };
      const md = await measure('notes.md'), txt = await measure('a.txt'), readme = await measure('README'), py = await measure('code.py');
      r.defaultWrapsText = md > 1 && txt > 1 && readme > 1;
      r.defaultCodeUnwrapped = py === 1;
      r.counts = [md, txt, readme, py].join(',');
      // A split makes the tab narrower: more wrapped lines.
      a.editor.getPanels().find((x) => x.params?.targetId === j('a.txt')).api.setActive();
      await wait(200);
      const wide = lines('a.txt');
      a.editor.splitActiveGroup('right');
      await wait(400);
      await open('b.txt');
      const narrow = lines('b.txt');
      r.narrowerWrapsMore = narrow > wide;
      // Turn it off from the menu.
      a.menu.triggerItem('view:toggle-word-wrap');
      await wait(300);
      r.offUnwrapsOpen = lines('b.txt') === 1;
      r.offSaved = localStorage.getItem('workbench:word-wrap') === 'false';
      return r;
    `);
    win.webContents.reload();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const r3 = await run(`
      await wait(500);
      a.editor.clear();
      const r = {};
      await open('notes.md');
      r.reloadKeepsOff = lines('notes.md') === 1;
      a.menu.openMenu();
      a.menu.closeMenu();
      a.menu.triggerItem('view:toggle-word-wrap');
      await wait(300);
      r.onRewrapsOpen = lines('notes.md') > 1;
      localStorage.removeItem('workbench:word-wrap');
      return r;
    `);
    const result = { setup: r1, ...r2, ...r3 };
    const counts = result.counts; delete result.counts;
    console.log(JSON.stringify({ ...result, counts }));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
