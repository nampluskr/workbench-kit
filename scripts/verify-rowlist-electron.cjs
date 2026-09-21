// Regression coverage for the folder file-list row parity with the
// Explorer tree (WK-113, user request, 2026-09-21): icon rendering, click
// = preview / dblclick = pinned, ArrowDown/Up keyboard focus, and the
// right-click menu offering the same items the Explorer tree does. Modeled
// on scripts/verify-open-modes-electron.cjs's fixture/IPC-stub pattern.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
// Separate from `fixture` on purpose: `fixture` is the folder the test
// opens and lists, and it must contain ONLY the 3 planted entries below —
// Electron's own userData dir living inside it would show up as a 4th row
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
ipcMain.handle('fs:read-dir', async (_e, dir) => (await fs.promises.readdir(dir, { withFileTypes: true }))
  .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name), isContainer: entry.isDirectory() })));
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
  const win = new BrowserWindow({
    width: 1000, height: 700, show: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  // Without this, this sandboxed test host never grants the window real OS
  // focus, so document.activeElement checks are meaningless — every
  // .focus() call silently no-ops and even a correctly-implemented
  // selectAndFocus() would read back as never-focused.
  win.focus();
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const app = window.__workbenchApp;
      app.editor.clear();
      await app.handleOpenFolderDialog(${JSON.stringify(fixture)});
      await wait(600);
      const folderPanel = app.editor.getActivePanel();
      const listEl = document.querySelector('.folder-file-list-items .tree-list');
      const rows = () => [...listEl.querySelectorAll('.tree-row[data-id]')];
      // Each click/keydown triggers a fresh render() that replaces every
      // row's DOM node (RowListController.render() resets innerHTML), so
      // every check below re-queries by suffix rather than reusing an
      // earlier reference — a stale node reads back as never-selected/
      // -focused, and a detached node's dispatched event never bubbles to
      // the (now different) listEl it would need to reach.
      const findRow = (suffix) => rows().find((r) => r.getAttribute('data-id').endsWith(suffix));

      // Icon: every row carries the same .tree-icon markup the Explorer
      // tree uses (renderIconMarkup(), src/core/rowlist.ts).
      const iconsPresent = rows().length === 3 && rows().every((r) => r.querySelector('.tree-icon'));

      // Sorted container-first then name (existing contract, unchanged):
      // sub-folder, alpha.txt, beta.txt.
      const order = rows().map((r) => r.getAttribute('data-id').split(/[\\\\/]/).pop());
      const sortOrder = order.length === 3 && order[0] === 'sub-folder' && order[1] === 'alpha.txt' && order[2] === 'beta.txt';

      // Click alpha.txt: selects the row AND opens it as the group's
      // preview panel (single click = browsing, v0.2 FR-P1 — the same rule
      // openFromEntry gives the Explorer tree, src/main.ts).
      findRow('alpha.txt').click();
      await wait(200);
      const clickSelectsRow = findRow('alpha.txt').classList.contains('selected');
      const activeGroup = app.editor.getActiveGroup();
      const previewPanel = app.editor.getPreviewPanel(activeGroup);
      const clickOpenedAsPreview = previewPanel?.params?.targetId?.endsWith('alpha.txt') &&
        previewPanel?.params?.isPreview === true;

      // Double click beta.txt: opens it PINNED (not the preview slot) —
      // same v0.2 FR-P4 rule as the Explorer tree's dblclick. A real
      // physical double click delivers click, click, THEN dblclick
      // (Codex A22 R1, Minor) — each click() call here triggers its own
      // synchronous render() that replaces every row's DOM node, so the
      // row is re-queried before each dispatch, same as main.ts's
      // openFromEntry pendingOpen-coalescing (A9 R3) was hardened
      // against exactly this sequence for the Explorer tree.
      folderPanel.api.setActive();
      await wait(100);
      const betaId = findRow('beta.txt').getAttribute('data-id');
      findRow('beta.txt').click();
      findRow('beta.txt').click();
      findRow('beta.txt').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await wait(200);
      const betaPanel = app.editor.getActivePanel();
      const dblclickPinned = betaPanel?.params?.targetId === betaId && betaPanel?.params?.isPreview !== true;

      // ArrowDown/ArrowUp move focus across rows within the list
      // (src/core/rowlist.ts's own keyboard handling, not the Explorer's).
      // No manual listEl.focus() call here (Codex A22 R1, Minor) — the
      // click itself must focus the list, same as the Explorer tree's
      // click does (RowListController.selectAndFocus()'s own call).
      folderPanel.api.setActive();
      await wait(100);
      findRow('sub-folder').click();
      await wait(50);
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await wait(50);
      const arrowDownMovesFocus = findRow('alpha.txt').classList.contains('focused') &&
        !findRow('sub-folder').classList.contains('focused');
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      await wait(50);
      const arrowUpMovesFocusBack = findRow('sub-folder').classList.contains('focused') &&
        !findRow('alpha.txt').classList.contains('focused');

      // The sub-folder click above (like alpha/beta's before it) opened a
      // NEW active panel (its own file-list view), leaving folderPanel
      // inactive/hidden again — a hidden panel's .focus() call is silently
      // dropped by the browser, so document.activeElement checks below
      // would read false regardless of whether selectAndFocus() ran.
      // Re-activate folderPanel first, same as every prior block did.
      folderPanel.api.setActive();
      await wait(100);

      // Right-click a file row: same 2-item menu the Explorer tree offers
      // a file (Open as Viewer / Open as Editor — src/main.ts
      // buildResourceContextMenuItems, shared with the tree). Right-click
      // does not navigate away (unlike a plain click, which immediately
      // opens the target and switches the active panel), so this is where
      // a real document.activeElement check actually proves something
      // (Codex A22 R2, Minor — R1's fix made selectAndFocus() call
      // listEl.focus(), but the R1 regression test only dispatched
      // keydown straight at listEl without ever checking real DOM focus,
      // so a regression here would have kept passing).
      findRow('alpha.txt').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
      await wait(50);
      const rightClickActuallyFocusedList = document.activeElement === listEl;
      const menuLabels = [...document.querySelectorAll('.context-menu-item-row')].map((r) => r.textContent.trim());
      const contextMenuMatchesTree = menuLabels.includes('Open as Viewer') && menuLabels.includes('Open as Editor') && menuLabels.length === 2;
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await wait(50);

      // Right-click sub-folder: same 3-item menu the tree offers a folder.
      findRow('sub-folder').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 80 }));
      await wait(50);
      const folderMenuLabels = [...document.querySelectorAll('.context-menu-item-row')].map((r) => r.textContent.trim());
      const contextMenuFolderMatchesTree = folderMenuLabels.includes('Open File List') &&
        folderMenuLabels.includes('Open Command Prompt') && folderMenuLabels.includes('Open PowerShell') &&
        folderMenuLabels.length === 3;
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      return { iconsPresent, sortOrder, clickSelectsRow, clickOpenedAsPreview, dblclickPinned,
        arrowDownMovesFocus, arrowUpMovesFocusBack, rightClickActuallyFocusedList,
        contextMenuMatchesTree, contextMenuFolderMatchesTree };
    })()`);
    console.log(JSON.stringify(result));
    const allPass = Object.values(result).every(Boolean);
    app.exit(allPass ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
