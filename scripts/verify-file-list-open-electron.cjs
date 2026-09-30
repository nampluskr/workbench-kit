// Folder file-list tab: double-click / Enter on a file hands it to the OS
// default program (fs:open-path), a program or script is refused with a
// message, a folder still steps in. The real host handler is loaded but its
// fs:open-path is replaced by a recorder, so no program is launched; the real
// handler's input validation is checked separately with invalid arguments.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-filelist-open-'));
app.setPath('userData', path.join(fixture, '..', path.basename(fixture) + '-profile'));
fs.writeFileSync(path.join(fixture, 'photo.jpg'), 'x');
fs.writeFileSync(path.join(fixture, 'movie.mp4'), 'x');
fs.writeFileSync(path.join(fixture, 'tool.exe'), 'x');
fs.writeFileSync(path.join(fixture, 'run.bat'), 'x');
fs.mkdirSync(path.join(fixture, 'sub'));

require('../src/hosts/electron/main.cjs');
const opened = [];
ipcMain.removeHandler('fs:open-path');
ipcMain.handle('fs:open-path', (event, target) => { opened.push(target); return true; });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win.webContents.isLoading()) await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  win.show();
  win.focus();
  const result = {};
  try {
    const wc = win.webContents;
    await wc.executeJavaScript(`(async () => {
      const app = window.__workbenchApp;
      await app.editor.openItem(${JSON.stringify(fixture)}, 'fixture', { meta: { kind: 'folder', mode: 'file-list' } });
    })()`);
    await wait(800);
    const ev = (code) => wc.executeJavaScript(code);
    const rowsJs = `(() => {
      const listEl = document.querySelector('.folder-file-list-items .tree-list');
      const rows = () => [...listEl.querySelectorAll('.tree-row[data-id]')];
      const find = (suffix) => rows().find((r) => r.getAttribute('data-id').endsWith(suffix));
      return { listEl, rows, find };
    })()`;
    const status = () => ev(`document.querySelector('.folder-file-list-status')?.hidden ? '' : document.querySelector('.folder-file-list-status').textContent`);
    const dbl = (suffix) => ev(`(() => { const r = ${rowsJs}; r.find(${JSON.stringify(suffix)}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); })()`);

    await dbl('photo.jpg'); await wait(300);
    await dbl('movie.mp4'); await wait(300);
    result.dblclickOpensFiles = opened.length === 2
      && opened[0] === path.join(fixture, 'photo.jpg') && opened[1] === path.join(fixture, 'movie.mp4');

    await ev(`(() => { const r = ${rowsJs}; r.find('movie.mp4').click(); })()`);
    await wait(100);
    await ev(`(() => { const r = ${rowsJs}; r.listEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
    await wait(300);
    result.enterOpensFile = opened.length === 3 && opened[2] === path.join(fixture, 'movie.mp4');

    const before = opened.length;
    await dbl('tool.exe'); await wait(300);
    const exeMessage = await status();
    await dbl('run.bat'); await wait(300);
    result.programsAndScriptsRefused = opened.length === before && /not launched/.test(exeMessage) && /run\.bat/.test(await status());

    await dbl('sub'); await wait(600);
    result.folderStillStepsIn = await ev(`document.querySelector('.folder-file-list-path-input').value.endsWith('sub')`);

    const fsOps = require('../src/hosts/electron/fs-ops.cjs');
    const reject = (value) => fsOps.assertOpenableFile(value).then(() => false, () => true);
    result.hostRejectsRelativeFolderAndNonString = (await reject('relative.txt')) && (await reject(fixture))
      && (await reject(42)) && !(await reject(path.join(fixture, 'photo.jpg')));
    console.log(JSON.stringify(result));
    win.destroy();
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (error) {
    console.error(error, JSON.stringify(result));
    app.exit(1);
  }
});

app.on('quit', () => {
  for (const dir of [fixture, fixture + '-profile']) {
    const resolved = path.resolve(dir);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('wb-filelist-open-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 }); } catch { /* profile may stay locked briefly */ }
    }
  }
});
