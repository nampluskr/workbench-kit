// Regression coverage for Explorer delete (v0.3, user request 2026-09-25):
// disabled-by-default no-op with a discoverable message, enabling via the
// View menu and via the status bar indicator, Delete key deleting the
// entire multi-selection at once, right-click Delete acting on exactly the
// single right-clicked item (WK-123 kept as-is), a dirty open tab on a
// deleted file force-closing with no save prompt, and the confirm dialog's
// Cancel button leaving everything untouched. The delete IPC runs the real
// src/hosts/electron/fs-ops.cjs.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsOps = require('../src/hosts/electron/fs-ops.cjs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-delete-profile-'));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-delete-'));
app.setPath('userData', profileDir);
app.on('quit', () => {
  for (const dir of [profileDir, fixture]) {
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-delete-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { /* Windows may still hold the profile briefly. */ }
    }
  }
});
fs.writeFileSync(path.join(fixture, 'alpha.txt'), 'alpha', 'utf8');
fs.writeFileSync(path.join(fixture, 'beta.txt'), 'beta', 'utf8');
fs.mkdirSync(path.join(fixture, 'gamma'));
fs.writeFileSync(path.join(fixture, 'gamma', 'inner.txt'), 'inner', 'utf8');
fs.writeFileSync(path.join(fixture, 'delta.txt'), 'delta', 'utf8');
fs.writeFileSync(path.join(fixture, 'epsilon.txt'), 'epsilon', 'utf8');
fs.mkdirSync(path.join(fixture, 'zeta'));
fs.writeFileSync(path.join(fixture, 'zeta', 'child.txt'), 'child', 'utf8');
fs.writeFileSync(path.join(fixture, 'eta.txt'), 'eta', 'utf8');
fs.mkdirSync(path.join(fixture, 'theta'));
fs.writeFileSync(path.join(fixture, 'theta', 'keep.txt'), 'keep', 'utf8');

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
ipcMain.handle('fs:delete-path', (_e, p) => fsOps.deletePath(p));
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__workbenchApp;
  const FIX = ${JSON.stringify(fixture)};
  const j = (...p) => [FIX, ...p].join('\\\\');
  const press = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const treeList = () => document.querySelector('.sidebar-content .tree-list');
  const status = () => document.getElementById('statusbar')?.textContent || '';
  const deleteBtn = () => document.querySelector('.workbench-confirm-dialog .confirm-dialog-btn[data-choice="delete"]');
  const cancelBtn = () => document.querySelector('.workbench-confirm-dialog .confirm-dialog-btn[data-choice="cancel"]');
  const statusDeleteEl = () => document.querySelector('.statusbar-delete-indicator');
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

      // 1. Disabled by default: Delete key on a selected item is a no-op
      // on disk, and the app surfaces a discoverable reason.
      a.tree.focusItemById(j('alpha.txt'));
      press(treeList(), 'Delete');
      await wait(200);
      r.disabledByDefault = true; // checked against disk below
      r.disabledShowsMessage = /Delete is disabled/.test(status());

      // 2. Enable via the View menu checkbox row.
      a.menu.triggerItem('view:delete-enabled');
      await wait(100);
      r.enabledViaMenu = statusDeleteEl().textContent === 'Delete: On';

      // 3. Toggle off via the status bar indicator's own click, then back on.
      statusDeleteEl().click();
      await wait(100);
      r.statusToggleOff = statusDeleteEl().textContent === 'Delete: Off';
      statusDeleteEl().click();
      await wait(100);
      r.statusToggleOn = statusDeleteEl().textContent === 'Delete: On';

      // 4. Delete key on a single selection: confirm dialog appears with
      // singular wording, Cancel leaves it untouched.
      a.tree.focusItemById(j('alpha.txt'));
      press(treeList(), 'Delete');
      await wait(150);
      r.singleConfirmWording = /Delete 'alpha.txt'\\?/.test(deleteBtn()?.closest('.workbench-confirm-dialog')?.querySelector('.confirm-dialog-message')?.textContent || '');
      cancelBtn().click();
      await wait(150);
      r.cancelKeepsNode = Boolean(a.tree.getNodeById(j('alpha.txt')));
      return r;
    `);

    r1.disabledByDefault = exists('alpha.txt');

    const r2 = await run(`
      const r = {};
      // Multi-select beta.txt + gamma via the public restoreSelection API
      // (the same one restart/refresh use to re-apply a saved selection),
      // then Delete both at once.
      a.tree.restoreSelection([j('beta.txt'), j('gamma')], j('beta.txt'));
      await wait(50);
      press(treeList(), 'Delete');
      await wait(150);
      r.multiConfirmWording = /1 folder and 1 file/.test(deleteBtn()?.closest('.workbench-confirm-dialog')?.querySelector('.confirm-dialog-message')?.textContent || '');
      deleteBtn().click();
      await wait(600);
      return r;
    `);
    r2.multiDeletedOnDisk = !exists('beta.txt') && !exists('gamma');

    const r3 = await run(`
      const r = {};
      // 6. Right-click Delete acts on exactly the single right-clicked
      // item, even if multiple were selected beforehand (WK-123 kept).
      a.tree.restoreSelection([j('delta.txt'), j('epsilon.txt')], j('delta.txt'));
      await wait(50);
      const row = Array.from(document.querySelectorAll('.tree-row')).find((el) => el.getAttribute('data-id') === j('delta.txt'));
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
      await wait(100);
      const deleteMenuItem = document.querySelector('.workbench-context-menu .context-menu-item-row[data-item-id="explorer:delete"]');
      deleteMenuItem.click();
      await wait(150);
      deleteBtn().click();
      await wait(500);
      return r;
    `);
    r3.rightClickDeletedOnlyOne = !exists('delta.txt') && exists('epsilon.txt');

    const r4 = await run(`
      const r = {};
      // 7. A dirty open tab on the deleted target force-closes, no prompt.
      await a.editor.openItem(j('epsilon.txt'), 'epsilon.txt', { meta: { kind: 'file', mode: 'editor' } });
      await wait(700);
      a.kindRegistry.getInnerForTest(panelOn(j('epsilon.txt')).id).appendContentForTest(' unsaved');
      await wait(200);
      r.tabWasDirty = panelOn(j('epsilon.txt'))?.params?.isDirty === true;
      a.tree.focusItemById(j('epsilon.txt'));
      press(treeList(), 'Delete');
      await wait(150);
      deleteBtn().click();
      await wait(600);
      r.dirtyTabForceClosed = !panelOn(j('epsilon.txt'));
      r.noSavePromptAppeared = !document.querySelector('.workbench-confirm-dialog .confirm-dialog-btn[data-choice="save"]');
      return r;
    `);
    r4.epsilonDeletedOnDisk = !exists('epsilon.txt');

    const r5 = await run(`
      const r = {};
      // 8. The tree's own root is never a delete target (A29 Critical fix):
      // selecting the root and pressing Delete must not touch the open
      // folder itself.
      const rootId = a.tree.getRoot().id;
      a.tree.focusItemById(rootId);
      press(treeList(), 'Delete');
      await wait(150);
      r.rootRefusedNoDialog = !deleteBtn();
      r.rootStatusMessage = /Cannot delete the open folder itself/.test(status());

      // 9. Ancestor + descendant both selected (e.g. Ctrl+A-style): only
      // the ancestor is deleted; the descendant is dropped from the
      // target list rather than attempted afterward and failing (A29
      // Major fix). zeta/ and zeta/child.txt are both selected here.
      a.tree.restoreSelection([j('zeta'), j('zeta', 'child.txt')], j('zeta'));
      await wait(50);
      press(treeList(), 'Delete');
      await wait(150);
      r.dedupSingularWording = /Delete 'zeta'\\?/.test(deleteBtn()?.closest('.workbench-confirm-dialog')?.querySelector('.confirm-dialog-message')?.textContent || '');
      deleteBtn().click();
      await wait(500);
      r.dedupNoSpuriousError = !/Cannot delete/.test(status());
      return r;
    `);
    r5.zetaDeletedOnDisk = !exists('zeta');

    const r6 = await run(`
      const r = {};
      // 10. Turning "Delete enabled" off while the confirm dialog is open
      // must stop the pending delete once accepted (A29 Major fix) — the
      // dialog does not trap focus, so the status bar toggle is still
      // reachable.
      a.tree.focusItemById(j('eta.txt'));
      press(treeList(), 'Delete');
      await wait(150);
      r.dialogOpenBeforeToggle = Boolean(deleteBtn());
      statusDeleteEl().click(); // turn Delete off while the dialog is still showing
      await wait(50);
      deleteBtn().click(); // accept the now-stale dialog
      await wait(400);
      r.midDialogToggleBlocksDelete = /turned off while the confirmation was open/.test(status());
      statusDeleteEl().click(); // restore Delete: On for any later manual use
      await wait(50);
      return r;
    `);
    r6.etaSurvivedMidDialogToggle = exists('eta.txt');

    const r7 = await run(`
      const r = {};
      // 11. A29 round 3 Critical fix: the target's OWN identity is
      // re-checked against the live tree root after the confirm dialog
      // resolves, not only before it was shown. The dialog does not trap
      // focus, so a Folder Tab switch mid-dialog (simulated here directly
      // via tree.setRoot, without needing the full Folder Tabs UI) can
      // make the pending target BECOME the tree's root while its
      // confirmation is still open.
      const targetNode = a.tree.getNodeById(j('theta'));
      a.tree.focusItemById(j('theta'));
      press(treeList(), 'Delete');
      await wait(150);
      r.thetaDialogOpen = Boolean(deleteBtn());
      a.tree.setRoot(targetNode); // theta is now the tree's own root
      await wait(50);
      deleteBtn().click(); // accept the now-stale dialog
      await wait(400);
      r.rootSwapBlocksDelete = /Cannot delete the open folder itself/.test(status());
      return r;
    `);
    r7.thetaSurvivedRootSwap = exists('theta') && exists('theta', 'keep.txt');

    const result = { ...r1, ...r2, ...r3, ...r4, ...r5, ...r6, ...r7 };
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
