// Regression coverage for "only files that read as text open in a tab"
// (D-15, user request 2026-09-24): text, data and code files open, including
// a README without an extension, a script, a UTF-8 BOM file and a long UTF-8
// file whose character is cut at the 64KB probe boundary. A known binary
// extension is refused even when its content is text. An unknown extension
// with NUL bytes is refused by content. Every open path — tree click,
// double click, Enter, right-click, Open File — refuses with a status
// message and no tab. A CP949 file opens as a read-only Viewer that will not
// switch to Editor. Only the latest of two quick requests opens. The probe
// runs the real src/hosts/electron/fs-ops.cjs.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsOps = require('../src/hosts/electron/fs-ops.cjs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-textopen-profile-'));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-textopen-'));
app.setPath('userData', profileDir);
app.on('quit', () => {
  for (const dir of [profileDir, fixture]) {
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-textopen-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { /* Windows may still hold the profile briefly. */ }
    }
  }
});
const HAN = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]); // "한글" in CP949
const write = (name, data) => fs.writeFileSync(path.join(fixture, name), data);
write('a.txt', 'plain text');
write('data.csv', 'name,value\nalpha,1\n');
write('bom.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('id,이름\n1,가\n', 'utf8')]));
write('README', 'no extension');
write('run.bat', '@echo off\r\necho hi\r\n');
// 65535 ASCII bytes then a 3-byte character straddling the 64KB boundary.
write('long.log', Buffer.concat([Buffer.alloc(65535, 0x61), Buffer.from('한 end', 'utf8')]));
write('app.exe', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0), Buffer.from('This program cannot be run')]));
write('image.png', 'text that is still a png by name');
write('blob.dat', Buffer.from([0x41, 0x42, 0x00, 0x43, 0x44]));
write('korean.csv', Buffer.concat([Buffer.from('name,'), HAN, Buffer.from('\n1,'), HAN, Buffer.from('\n')]));

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
// The same UTF-8 reader as main.cjs: NUL or invalid UTF-8 is an error.
ipcMain.handle('fs:read-text-file', async (_e, file) => {
  const bytes = await fs.promises.readFile(file);
  if (bytes.includes(0)) throw new Error('Binary files cannot be opened as text');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
});
ipcMain.handle('fs:write-text-file', async (_e, file, contents) => { await fs.promises.writeFile(file, contents, 'utf8'); return true; });
ipcMain.handle('fs:probe-text-file', (_e, p) => fsOps.probeTextFile(p));
ipcMain.handle('fs:read-legacy-text-file', (_e, p) => fsOps.readLegacyTextFile(p));
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__workbenchApp;
  const FIX = ${JSON.stringify(fixture)};
  const j = (n) => FIX + '\\\\' + n;
  const status = () => document.getElementById('statusbar')?.textContent || '';
  const row = (n) => document.querySelector('.sidebar-content .tree-row[data-id="' + CSS.escape(j(n)) + '"]');
  const openPanel = (n) => a.editor.getPanels().find((p) => p.params?.targetId === j(n));
  const content = (n) => { const p = openPanel(n); return p ? a.kindRegistry.getInnerForTest(p.id)?.getContentForTest() ?? null : null; };
  const reset = async () => { a.editor.clear(); a.statusMessages.showMessage(''); await wait(150); };
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
    const result = await run(`
      await a.handleOpenFolderDialog(FIX);
      await wait(500);
      await a.tree.setExpanded(a.tree.getRoot().id, true);
      await wait(300);
      const r = {};
      // Files that read as text open on a click.
      for (const n of ['a.txt', 'data.csv', 'bom.csv', 'README', 'run.bat', 'long.log']) {
        await reset();
        row(n).click();
        await wait(500);
        r['opens:' + n] = Boolean(openPanel(n)) && !/Unable to open/.test(content(n));
        // The BOM is dropped, the Korean text kept.
        if (n === 'bom.csv') r.bomContent = content(n) === 'id,이름\\n1,가\\n';
      }
      // Refused files: no tab, a status message, the selection kept.
      for (const n of ['app.exe', 'image.png', 'blob.dat']) {
        await reset();
        row(n).click();
        await wait(400);
        r['refusedClick:' + n] = a.editor.getPanelCount() === 0 &&
          status().includes("Cannot open '" + n + "'") && a.tree.getFocusedId() === j(n);
      }
      // The other open paths refuse too.
      await reset();
      row('app.exe').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await wait(400);
      r.refusedDblclick = a.editor.getPanelCount() === 0;
      await reset();
      a.tree.focusItemById(j('blob.dat'));
      document.querySelector('.sidebar-content .tree-list').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(400);
      r.refusedEnter = a.editor.getPanelCount() === 0;
      await reset();
      a.contextMenuItemsForTreeNode(j('app.exe')).find((i) => i.id === 'open:editor').action();
      await wait(400);
      r.refusedContextMenu = a.editor.getPanelCount() === 0 && status().includes("Cannot open 'app.exe'");
      await reset();
      await a.handleOpenFileDialog(j('image.png'));
      await wait(300);
      r.refusedOpenFile = a.editor.getPanelCount() === 0;
      await reset();
      await a.handleOpenFileDialog(j('a.txt'));
      await wait(400);
      r.openFileStillOpensText = Boolean(openPanel('a.txt'));
      // CP949: read-only Viewer that refuses Editor.
      await reset();
      a.contextMenuItemsForTreeNode(j('korean.csv')).find((i) => i.id === 'open:editor').action();
      await wait(700);
      const k = openPanel('korean.csv');
      r.cp949OpensAsViewer = k?.params?.mode === 'viewer' && k?.params?.encoding === 'cp949';
      r.cp949Content = content('korean.csv') === 'name,한글\\n1,한글\\n';
      const cp949Root = a.editor.getContentRenderer(k.id).element;
      const cp949Input = cp949Root.querySelector('.monaco-editor textarea') || cp949Root;
      cp949Input.focus();
      cp949Input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }));
      await wait(200);
      r.cp949RefusesEditor = k.params.mode === 'viewer' && status().includes('CP949 file');
      // Even with content changed behind the read-only view (a restored,
      // edited snapshot), save refuses rather than write UTF-8 (A24 #2).
      a.kindRegistry.getInnerForTest(k.id).appendContentForTest('X');
      await wait(100);
      r.cp949SaveRefused = (await a.kindRegistry.save(k.id)) === false;
      // Only the latest of two quick requests lands.
      await reset();
      row('data.csv').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      row('README').click();
      await wait(700);
      r.latestRequestWins = Boolean(openPanel('README')) && !openPanel('data.csv');
      return r;
    `);
    // The CP949 bytes on disk are untouched by the refused save.
    result.cp949BytesUntouched = fs.readFileSync(path.join(fixture, 'korean.csv')).equals(
      Buffer.concat([Buffer.from('name,'), HAN, Buffer.from('\n1,'), HAN, Buffer.from('\n')]));
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
