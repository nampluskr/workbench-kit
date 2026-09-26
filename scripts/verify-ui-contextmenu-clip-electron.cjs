// Ad-hoc regression check (2026-09-25 user report): right-click menus opened
// near the bottom/right edge of the window — Folder Tabs rail, Explorer tree
// — must flip up/left instead of being clipped. Not wired into package.json;
// run directly with `electron scripts/verify-ui-contextmenu-clip-electron.cjs`.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ctxclip-'));
app.setPath('userData', profileDir);
require('../src/hosts/electron/main.cjs');

const finish = (win, code) => {
  win.destroy();
  app.on('quit', () => {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });
  app.exit(code);
};

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: {
      preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'), contextIsolation: true,
    } });
    const distIndex = path.join(__dirname, '../dist/index.html');
    await win.loadFile(distIndex);
    await new Promise((r) => setTimeout(r, 400));
    const result = await win.webContents.executeJavaScript(`(() => {
      const app = window.__workbenchApp;
      const cm = app.contextMenu;
      cm.setEnabled(true);
      const vh = document.documentElement.clientHeight;
      const vw = document.documentElement.clientWidth;
      // A menu opened right at the bottom-right corner: with no clamping,
      // top/left would equal the click point and the menu would overflow.
      cm.show(vw - 5, vh - 5, [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }, { id: 'c', label: 'Charlie' }]);
      const el = document.querySelector('.workbench-context-menu');
      const rect = el.getBoundingClientRect();
      const bottomClipped = rect.bottom > vh;
      const rightClipped = rect.right > vw;
      const topInBounds = rect.top >= 0;
      const leftInBounds = rect.left >= 0;
      cm.hide();
      return { bottomClipped, rightClipped, topInBounds, leftInBounds };
    })()`);
    console.log(JSON.stringify(result));
    const ok = !result.bottomClipped && !result.rightClipped && result.topInBounds && result.leftInBounds;
    finish(win, ok ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
