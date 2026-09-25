// Regression coverage for the folder file-list view's current contract
// (src/core/rowlist.ts + src/presets/folder-preset.ts): icons and
// folder-first order (WK-113/WK-118), click = select only and a file row
// never activates (WK-116), dblclick/Enter on a folder steps in and `..`
// steps back up (WK-116), no right-click menu (WK-115), Space marks
// (WK-125), and the column layout (user request, 2026-09-23 — Name fills
// 150-500px and is the only draggable column; Ext/Size/Date fixed; Size
// right-aligned; the header follows the list's horizontal scroll so no
// ancestor overflows). Rewritten 2026-09-23: the WK-113 version asserted
// preview/pinned opening and a context menu that WK-115/WK-116 removed, and
// opened its tab through Add Folder, which no longer opens a file list.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
// Separate from `fixture` on purpose: `fixture` is the folder the test
// opens and lists, and it must contain ONLY the 3 planted entries below —
// Electron's own userData dir living inside it would show up as an extra row
// and break the exact-order assertions.
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-rowlist-profile-'));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-rowlist-'));
app.setPath('userData', profileDir);
app.on('quit', () => {
  for (const dir of [profileDir, fixture]) {
    const resolved = path.resolve(dir);
    const expectedParent = path.resolve(os.tmpdir()) + path.sep;
    if (resolved.startsWith(expectedParent) && path.basename(resolved).startsWith('wb-rowlist-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { /* Windows may still hold the profile briefly. */ }
    }
  }
});
fs.writeFileSync(path.join(fixture, 'alpha.txt'), 'alpha', 'utf8');
fs.writeFileSync(path.join(fixture, 'beta.txt'), 'beta', 'utf8');
fs.mkdirSync(path.join(fixture, 'sub-folder'));

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
ipcMain.handle('fs:write-text-file', async (_e, file, content) => {
  await fs.promises.writeFile(file, content, 'utf8');
  return true;
});
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

app.whenReady().then(async () => {
  // The app's own default window size (main.cjs), so the column widths
  // measured below are the ones a user actually sees.
  const win = new BrowserWindow({
    width: 1280, height: 800, show: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  // Without this, this sandboxed test host never grants the window real OS
  // focus, so document.activeElement checks are meaningless — every
  // .focus() call silently no-ops.
  win.focus();
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const app = window.__workbenchApp;
      app.editor.clear();
      // Add Folder only adds a rail tab now (WK-114); the file list is its
      // own editor tab, opened the way the rail's "Open File List" does.
      await app.editor.openItem(${JSON.stringify(fixture)}, 'fixture', { meta: { kind: 'folder', mode: 'file-list' } });
      await wait(600);
      const folderPanel = app.editor.getActivePanel();
      const root = document.querySelector('.folder-file-list');
      const listEl = root.querySelector('.folder-file-list-items .tree-list');
      const header = root.querySelector('.rowlist-header');
      // Every click/keydown re-renders every row (innerHTML reset), so rows
      // are always re-queried rather than held across an interaction.
      const rows = () => [...listEl.querySelectorAll('.tree-row[data-id]')];
      const findRow = (suffix) => rows().find((r) => r.getAttribute('data-id').endsWith(suffix));
      const labels = () => rows().map((r) => r.querySelector('.tree-label').textContent);

      // The fixture is not a drive root, so a synthetic ".." row leads.
      const iconsPresent = rows().length === 4 && rows().every((r) => r.querySelector('.tree-icon'));
      const sortOrder = labels().join('|') === '[..]|[sub-folder]|alpha.txt|beta.txt';

      // Click selects and focuses the list, and opens nothing (WK-116).
      findRow('alpha.txt').click();
      await wait(100);
      const clickSelectsRow = findRow('alpha.txt').classList.contains('selected');
      const clickFocusesList = document.activeElement === listEl;
      const clickOpensNothing = app.editor.getActivePanel() === folderPanel;

      // A file row's dblclick does nothing either.
      findRow('beta.txt').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await wait(200);
      const fileDblclickInert = app.editor.getActivePanel() === folderPanel && labels().includes('beta.txt');

      // ArrowDown/ArrowUp move focus between rows.
      findRow('sub-folder').click();
      await wait(50);
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await wait(50);
      const arrowDownMovesFocus = findRow('alpha.txt').classList.contains('focused') &&
        !findRow('sub-folder').classList.contains('focused');
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      await wait(50);
      const arrowUpMovesFocusBack = findRow('sub-folder').classList.contains('focused');

      // Space marks a file row without moving focus; ".." is never markable.
      findRow('alpha.txt').click();
      await wait(50);
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await wait(50);
      const spaceMarksRow = findRow('alpha.txt').classList.contains('marked') &&
        findRow('alpha.txt').classList.contains('focused');
      rows()[0].click();
      await wait(50);
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await wait(50);
      const parentRowNotMarkable = !rows()[0].classList.contains('marked');

      // No right-click menu on a row (WK-115).
      findRow('alpha.txt').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
      await wait(50);
      const noContextMenu = document.querySelectorAll('.context-menu-item-row').length === 0;
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      // dblclick a folder steps into it in the same panel; Enter on ".."
      // steps back up.
      findRow('sub-folder').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await wait(400);
      const folderDblclickStepsIn = app.editor.getActivePanel() === folderPanel && labels().join('|') === '[..]';
      rows()[0].click();
      await wait(50);
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await wait(400);
      const enterOnParentStepsUp = labels().includes('alpha.txt') && labels().includes('[sub-folder]');

      // Columns: header and rows share the same tracks, Name fills up to
      // 500px, only Name has a drag handle, Size is right-aligned.
      const trackWidths = (el) => [...el.children].map((c) => Math.round(c.getBoundingClientRect().width));
      const headerTracks = trackWidths(header);
      const rowTracks = trackWidths(rows()[1]);
      const columnsMatch = headerTracks.join() === rowTracks.join() &&
        headerTracks.slice(1).join() === '55,76,125';
      const nameCappedAt500 = headerTracks[0] === 500;
      const onlyNameResizable = header.querySelectorAll('.rowlist-resize-handle').length === 1 &&
        header.children[0].querySelector('.rowlist-resize-handle') !== null;
      const sizeRightAligned = getComputedStyle(findRow('alpha.txt').children[2]).textAlign === 'right';

      // Dragging Name past the list scrolls the list, the header follows,
      // and nothing above the list overflows (no second, unthemed scrollbar).
      const handle = header.querySelector('.rowlist-resize-handle');
      const hr = handle.getBoundingClientRect();
      const x0 = hr.left + 2;
      const y0 = hr.top + 5;
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x0, clientY: y0, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + 900, clientY: y0, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: x0 + 900, clientY: y0, pointerId: 1 }));
      await wait(100);
      listEl.scrollLeft = 10000;
      await wait(100);
      const headerFollowsScroll = listEl.scrollLeft > 0 && header.scrollLeft === listEl.scrollLeft;
      let ancestorOverflow = 0;
      for (let el = root; el && el !== document.body; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 1) ancestorOverflow++;
      }
      const noOuterOverflow = ancestorOverflow === 0;
      listEl.scrollLeft = 0;
      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await wait(100);
      const dblclickRefits = Math.round(header.children[0].getBoundingClientRect().width) === 500;

      return { iconsPresent, sortOrder, clickSelectsRow, clickFocusesList, clickOpensNothing,
        fileDblclickInert, arrowDownMovesFocus, arrowUpMovesFocusBack, spaceMarksRow,
        parentRowNotMarkable, noContextMenu, folderDblclickStepsIn, enterOnParentStepsUp,
        columnsMatch, nameCappedAt500, onlyNameResizable, sizeRightAligned,
        headerFollowsScroll, noOuterOverflow, dblclickRefits };
    })()`);
    console.log(JSON.stringify(result));
    const allPass = Object.values(result).every(Boolean);
    app.exit(allPass ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
