// Regression coverage for the global file extension filter (D-12, user
// request 2026-09-23): the Activity Bar button and its filled/unfilled icon,
// the File Filter popup (Include "All files" / extension checklist / typed
// extensions, Exclude, and the [Apply][Clear] buttons — picks are a draft
// until Apply; Escape or a click outside discards them, 2026-09-24),
// Exclude winning over Include, the "(no extension)" entry, folders always staying, the Explorer tree keeping
// its expansion across a filter change, the file-list footer's hidden count,
// View > File Filter's rows, and the filter surviving a reload. Everything
// is driven through the real UI, not the filter module directly.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-filefilter-profile-'));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-filefilter-'));
app.setPath('userData', profileDir);
app.on('quit', () => {
  for (const dir of [profileDir, fixture]) {
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-filefilter-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch { /* Windows may still hold the profile briefly. */ }
    }
  }
});
for (const name of ['a.md', 'b.md', 'c.ts', 'd.py', 'e.log', 'README', '.env']) {
  fs.writeFileSync(path.join(fixture, name), name, 'utf8');
}
const sub = path.join(fixture, 'sub');
fs.mkdirSync(sub);
fs.writeFileSync(path.join(sub, 'inner.md'), 'x', 'utf8');
fs.writeFileSync(path.join(sub, 'inner.ts'), 'x', 'utf8');

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
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

// Shared page-side helpers, prepended to each script below.
const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__workbenchApp;
  const FIX = ${JSON.stringify(fixture)};
  const SUB = ${JSON.stringify(sub)};
  const labelsIn = (sel) => [...document.querySelectorAll(sel + ' .tree-row .tree-label')].map((e) => e.textContent);
  // Tree rows below the root; folders read "[name]" there, as in the file list.
  const treeLabels = () => labelsIn('.sidebar-content').slice(1);
  const listLabels = () => labelsIn('.folder-file-list');
  const btn = () => document.querySelector('[data-item-id="activity:file-filter"]');
  const icon = () => btn().querySelector('i').className;
  const panel = () => document.querySelector('.file-filter-panel');
  const ctl = (key) => panel().querySelector('[data-filter-key="' + key + '"]');
  const click = async (el) => { el.click(); await wait(250); };
  const typeInto = async (key, text) => {
    const input = ctl(key); input.focus(); input.value = text;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(250);
  };
  const same = (x, y) => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());
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
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const r1 = await run(`
      localStorage.removeItem('workbench:file-filter');
      a.editor.clear();
      await a.handleOpenFolderDialog(FIX);
      await wait(500);
      // The root can come back collapsed from a fresh profile; open it and
      // one subfolder so both levels of filtering are visible.
      await a.tree.setExpanded(a.tree.getRoot().id, true);
      await a.tree.setExpanded(SUB, true);
      await wait(300);
      await a.editor.openItem(FIX, 'fixture', { meta: { kind: 'folder', mode: 'file-list' } });
      await wait(700);
      const r = {};
      const allTree = ['[sub]', 'a.md', 'b.md', 'c.ts', 'd.py', 'e.log', 'README', '.env', 'inner.md', 'inner.ts'];
      r.defaultIconPlain = icon().includes('codicon-filter') && !icon().includes('filled');
      r.defaultTreeShowsAll = allTree.every((n) => treeLabels().includes(n));
      r.defaultListShowsAll = ['a.md', 'c.ts', 'README', '.env'].every((n) => listLabels().includes(n));

      await click(btn());
      r.buttonOpensPanel = Boolean(panel());
      r.includeAllCheckedByDefault = ctl('include:all').checked && ctl('include:ext:md').disabled;
      r.buttonsApplyThenClear = [...panel().querySelectorAll('.file-filter-actions button')].map((b) => b.textContent).join('|') === 'Apply|Clear';
      r.applyDisabledWithoutChange = ctl('apply').disabled;
      // Include md — a draft until Apply.
      await click(ctl('include:all'));
      r.untickingAllKeepsEverything = listLabels().includes('c.ts') && !ctl('include:ext:md').disabled;
      await click(ctl('include:ext:md'));
      r.draftNotAppliedYet = listLabels().includes('c.ts') && !icon().includes('filled') && !ctl('apply').disabled;
      await click(ctl('apply'));
      r.applyCloses = !panel();
      const t = treeLabels(); const l = listLabels();
      r.includeMdTree = same(t, ['[sub]', 'a.md', 'b.md', 'inner.md']);
      r.includeMdList = same(l, ['[..]', '[sub]', 'a.md', 'b.md']);
      r.iconFilledWhenActive = icon().includes('codicon-filter-filled');
      r.tooltipSpellsFilter = (btn().getAttribute('title') || '').includes('Include: md');
      r.treeExpansionKept = a.tree.isExpanded(SUB);
      r.footerNotesHidden = /5 hidden by filter/.test(document.querySelector('.folder-file-list-footer').textContent);
      // Reopening shows the applied filter.
      await click(btn());
      r.reopenShowsApplied = !ctl('include:all').checked && ctl('include:ext:md').checked && ctl('apply').disabled;
      // Exclude md wins over Include md.
      await click(ctl('exclude:ext:md'));
      await click(ctl('apply'));
      r.excludeWinsOverInclude = same(listLabels(), ['[..]', '[sub]']) && same(treeLabels(), ['[sub]']);
      await click(btn());
      await click(ctl('exclude:ext:md'));
      // Typed extensions add to Include.
      await typeInto('include:add', 'ts; *.py');
      await click(ctl('apply'));
      r.typedExtensionsAdded = same(listLabels(), ['[..]', '[sub]', 'a.md', 'b.md', 'c.ts', 'd.py']);
      // "(no extension)".
      await click(btn());
      await click(ctl('include:ext:'));
      await click(ctl('apply'));
      r.noExtensionEntry = listLabels().includes('README') && listLabels().includes('.env');
      // View > File Filter rows.
      const rows = a.menu.getSubmenuItems('view:file-filter');
      r.menuRows = rows.map((x) => x.label).join('|') === 'Edit Filter...|Clear Filter' &&
        rows[1].disabled === false;
      // Clear resets the draft; Apply commits it.
      await click(btn());
      await click(ctl('clear'));
      r.clearIsDraftUntilApply = ctl('include:all').checked && icon().includes('filled') && !listLabels().includes('e.log');
      await click(ctl('apply'));
      r.clearRestoresAll = allTree.every((n) => treeLabels().includes(n)) && listLabels().includes('e.log');
      r.clearRestoresIcon = !icon().includes('filled');
      r.clearMenuDisabled = a.menu.getSubmenuItems('view:file-filter')[1].disabled === true;
      // Unpicking the last extension goes back to "All files".
      await click(btn());
      await click(ctl('include:all'));
      await click(ctl('include:ext:md'));
      await click(ctl('include:ext:md'));
      r.lastUnpickReturnsToAll = ctl('include:all').checked && ctl('apply').disabled;
      // Escape closes without applying.
      await click(ctl('include:all'));
      await click(ctl('include:ext:md'));
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await wait(100);
      r.escapeClosesWithoutApplying = !panel() && !icon().includes('filled') && listLabels().includes('c.ts');
      // A click outside closes without applying.
      await click(btn());
      await click(ctl('include:all'));
      await click(ctl('include:ext:ts'));
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await wait(100);
      r.outsideClickClosesWithoutApplying = !panel() && !icon().includes('filled');
      // Leave "Include: md" applied for the reload check.
      await click(btn());
      await click(ctl('include:all'));
      await click(ctl('include:ext:md'));
      await click(ctl('apply'));
      r.saved = localStorage.getItem('workbench:file-filter') === JSON.stringify({ include: ['md'], exclude: [] });
      return r;
    `);
    win.webContents.reload();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const r2 = await run(`
      await wait(800);
      const r = {};
      r.reloadKeepsIconFilled = icon().includes('codicon-filter-filled');
      a.editor.clear();
      await a.handleOpenFolderDialog(FIX);
      await wait(500);
      await a.editor.openItem(FIX, 'fixture', { meta: { kind: 'folder', mode: 'file-list' } });
      await wait(700);
      r.reloadKeepsFilter = same(listLabels(), ['[..]', '[sub]', 'a.md', 'b.md']);
      localStorage.removeItem('workbench:file-filter');
      return r;
    `);
    const result = { ...r1, ...r2 };
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (err) {
    console.error('FAILURE:', err);
    app.exit(1);
  }
});
