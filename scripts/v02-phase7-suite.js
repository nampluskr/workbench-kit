/**
 * Host-neutral v0.2 Phase 7 acceptance suite — 표시 언어와 전건 대조.
 *
 * Covers FR-L1 ~ FR-L3 and the cross-cutting NFRs' Phase-7 obligations:
 *  - every product-provided string is English (0 Hangul), same in both hosts
 *  - every SPEC section-1 command has a mouse-free route whose key is in
 *    docs/reserved-keys.md
 *  - the divergences the doc claims are real on screen (preview tabs exist,
 *    the tab-strip + exists, the five chrome areas are 30)
 *
 * Judged on screen (NFR-3): text is collected from what elements actually
 * show; keys are really dispatched and the resulting state is measured.
 * The runner injects window.__reservedKeysDoc (docs/reserved-keys.md) and
 * window.__testTmpDir (a real folder with a couple of files).
 */
window.__runV02Phase7Suite = async function runV02Phase7Suite() {
  const results = [];
  function record(id, pass, msg) {
    results.push({ id, pass: Boolean(pass), msg });
    console.log('[TEST_ASSERT]' + (pass ? 'PASS' : 'FAIL') + '|||[' + id + '] ' + msg);
  }

  try {
    const app = window.__workbenchApp;
    if (!app) {
      record('INIT', false, 'window.__workbenchApp is defined');
      return { success: false, results };
    }
    record('INIT', true, 'window.__workbenchApp is initialized and accessible');

    const editor = app.editor;
    const tree = app.tree;
    const dir = window.__testTmpDir;
    const reservedDoc = window.__reservedKeysDoc || '';
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const byId = (id) => document.getElementById(id);
    const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;

    async function clickEl(el) {
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(60);
    }
    async function press(key, mods) {
      (document.activeElement || document.body).dispatchEvent(
        new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {}))
      );
      await wait(110);
    }
    async function until(check, ms) {
      const end = Date.now() + (ms || 3000);
      while (Date.now() < end) {
        if (check()) return true;
        await wait(40);
      }
      return Boolean(check());
    }

    await app.openFolder(dir);
    await until(() => tree.getRoot() && tree.getRoot().id === dir, 4000);
    tree.setExpanded(tree.getRoot().id, true);
    await wait(120);
    editor.openItem('/v02p7/probe.txt', 'probe.txt', { mode: 'pinned' });
    await wait(100);

    // ------------------------------------------------------------------------
    // FR-L1 / FR-L2 / FR-L3 + product-text sweep — collect from every surface
    // ------------------------------------------------------------------------
    const collected = []; // { where, text }
    const add = (where, text) => {
      const t = (text == null ? '' : String(text)).trim();
      if (t) collected.push({ where, text: t });
    };
    const sweepEl = (where, rootEl) => {
      if (!rootEl) return;
      // visible text nodes
      const walk = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) add(where, n.nodeValue);
      // title / aria-label / placeholder on every descendant + self
      for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
        add(where + ':title', el.getAttribute && el.getAttribute('title'));
        add(where + ':aria', el.getAttribute && el.getAttribute('aria-label'));
        add(where + ':placeholder', el.getAttribute && el.getAttribute('placeholder'));
      }
    };

    // Title bar, activity bar, status bar, explorer header.
    sweepEl('titlebar', byId('titlebar'));
    sweepEl('activitybar', byId('activity-bar'));
    sweepEl('statusbar', byId('statusbar'));
    sweepEl('explorer-header', byId('sidebar-header'));

    // Menu — every group and every submenu.
    const hamburger = byId('menu-hamburger-btn');
    if (!byId('workbench-menu-dropdown')) await clickEl(hamburger);
    for (const cat of ['file', 'view', 'help']) {
      const catRow = document.querySelector('.menu-category-row[data-category-id="' + cat + '"]');
      if (catRow) await clickEl(catRow);
      const sub = document.querySelector('.menu-submenu[data-parent-group="' + cat + '"]');
      sweepEl('menu:' + cat, sub);
      for (const row of Array.from(document.querySelectorAll('.menu-submenu[data-parent-group="' + cat + '"] > .menu-item-row.has-submenu'))) {
        row.dispatchEvent(new MouseEvent('mouseenter'));
        await wait(50);
        sweepEl('submenu:' + (row.dataset.itemId || ''), row.querySelector(':scope > .menu-child-submenu'));
      }
    }
    if (byId('workbench-menu-dropdown')) await clickEl(hamburger);

    // Confirm dialog (a dirty tab close).
    const dtab = editor.openItem('/v02p7/dirty.txt', 'dirty.txt', { mode: 'pinned' });
    editor.setTabDirty(dtab.id, true);
    await wait(40);
    void editor.closePanel(dtab);
    await until(() => app.confirmDialog.isOpen(), 2000);
    sweepEl('confirm-dialog', document.querySelector('.workbench-confirm-dialog'));
    const dialogButtons = Array.from(document.querySelectorAll('.confirm-dialog-btn')).map((b) => b.textContent.trim());
    const cancelBtn = document.querySelector('.confirm-dialog-btn[data-choice="cancel"]');
    if (cancelBtn) await clickEl(cancelBtn);
    editor.setTabDirty(dtab.id, false);

    // About dialog.
    if (!byId('workbench-menu-dropdown')) await clickEl(hamburger);
    const helpCat = document.querySelector('.menu-category-row[data-category-id="help"]');
    if (helpCat) await clickEl(helpCat);
    const aboutRow = document.querySelector('.menu-item-row[data-item-id="help:about"]');
    if (aboutRow) await clickEl(aboutRow);
    await wait(60);
    sweepEl('about-dialog', document.querySelector('.workbench-about-dialog'));
    const aboutClose = document.querySelector('.workbench-about-dialog .confirm-dialog-btn');
    if (aboutClose) await clickEl(aboutClose);

    // Explorer view actions (New File opens an inline input row).
    await clickEl(byId('sidebar-action-new-file'));
    await wait(40);
    sweepEl('inline-input', document.querySelector('.tree-input-row'));
    const inputRow = document.querySelector('.tree-input-row .tree-input-field');
    if (inputRow) inputRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(40);

    // Find widget.
    tree.openFindWidget();
    await wait(40);
    sweepEl('find-widget', document.querySelector('.tree-find-widget'));
    tree.closeFindWidget();

    // Context menu (FR-G5/FR-G6, D-22 — A15 round-1 Critical finding: this
    // surface was never opened at all). The shell only draws the device;
    // what appears in it is an app decision, and this test build's app
    // registers 0 items (contextMenuItemsForTreeNode / …ForPanel default to
    // () => []) — so the sweep both exercises the device and proves that
    // stays true, rather than silently skipping a real product surface.
    const anyRow = document.querySelector('.tree-row[data-id]');
    if (anyRow) {
      anyRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
      await wait(60);
      sweepEl('tree-context-menu', document.querySelector('.workbench-context-menu'));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(30);
    }
    const anyTabEl = document.querySelector('.dv-tab');
    if (anyTabEl) {
      anyTabEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
      await wait(60);
      sweepEl('tab-context-menu', document.querySelector('.workbench-context-menu'));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(30);
    }

    // Status message.
    app.statusMessages.showMessage('');
    if (!byId('workbench-menu-dropdown')) await clickEl(byId('menu-hamburger-btn'));
    await clickEl(document.querySelector('.menu-category-row[data-category-id="view"]'));
    await clickEl(document.querySelector('.menu-item-row[data-item-id="view:preset-info"]'));
    await wait(40);
    add('status-message', byId('statusbar-message') && byId('statusbar-message').textContent);

    // Empty state (FR-G1, FR-L1, D-20 — A15 round-1 Critical finding: the
    // code used to claim this was tested but only cleared a status message).
    // v0.1 FR-G1 requires literally 0 guidance text and 0 children when no
    // folder is open; that is also the strongest possible Hangul check —
    // prove there is nothing there at all, not just nothing Korean. Re-opens
    // the fixture afterward so the rest of the suite still has a tree.
    app.closeFolder();
    await wait(60);
    const explorerEmptyEl = byId('sidebar-content');
    const explorerEmptyText = (explorerEmptyEl && explorerEmptyEl.textContent.trim()) || '';
    const explorerEmptyChildren = explorerEmptyEl ? explorerEmptyEl.children.length : -1;
    record(
      'V2P7-FR-L1-EMPTY-STATE',
      explorerEmptyText === '' && explorerEmptyChildren === 0,
      'Closing the folder leaves the explorer with 0 text and 0 child elements — no guidance sneaks in (FR-G1, FR-L1, D-20) ' +
        JSON.stringify({ explorerEmptyText, explorerEmptyChildren })
    );
    await app.openFolder(dir);
    await until(() => tree.getRoot() && tree.getRoot().id === dir, 4000);
    tree.setExpanded(tree.getRoot().id, true);
    await wait(80);

    // The whole visible workbench, as a catch-all — every remaining text
    // node and title/aria/placeholder attribute, not just leaf buttons (A15
    // round-1 Critical: the old catch-all only looked at
    // button/title/aria-label elements with no children). Skips real user
    // data the same way the dedicated sweeps above already do: tree rows
    // (file/folder names), tab titles (file names), and monaco's rendered
    // editor content (the opened file's own bytes).
    const isUserDataSurface = (el) => Boolean(el.closest('.tree-row, .dv-tab, .monaco-editor, .view-lines'));
    const catchallRoot = byId('workbench-root');
    if (catchallRoot) {
      const textWalker = document.createTreeWalker(catchallRoot, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && isUserDataSurface(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      let textNode;
      while ((textNode = textWalker.nextNode())) add('catchall:text', textNode.nodeValue);
      for (const el of catchallRoot.querySelectorAll('*')) {
        if (isUserDataSurface(el)) continue;
        add('catchall:title', el.getAttribute('title'));
        add('catchall:aria', el.getAttribute('aria-label'));
        add('catchall:placeholder', el.getAttribute('placeholder'));
      }
    }

    const korean = collected.filter((c) => HANGUL.test(c.text));
    record(
      'V2P7-FR-L1',
      korean.length === 0,
      'Every product-provided string across the title bar, activity bar, status bar, explorer, menu (all groups + submenus), confirm dialog, About dialog, inline input, find widget, right-click menus (tree + tab), status messages, and a full text/title/aria/placeholder sweep of the whole workbench is free of Hangul (FR-L1, D-9). Offenders: ' +
        JSON.stringify(korean.slice(0, 8))
    );
    record(
      'V2P7-FR-L2',
      JSON.stringify(dialogButtons) === JSON.stringify(['Save', "Don't Save", 'Cancel']),
      'The unsaved-changes dialog shows exactly the English buttons Save / Don\'t Save / Cancel (FR-L2) ' + JSON.stringify(dialogButtons)
    );

    // ------------------------------------------------------------------------
    // FR-L3 — a Korean-named file/folder is real USER DATA and must show
    // exactly as-is: in the tree row AND in the tab title it opens into
    // (A15 round-1 Critical finding — v0.2 Phase 7 had no non-ASCII fixture
    // name at all, so FR-L3 was never actually exercised).
    // ------------------------------------------------------------------------
    {
      const krFileName = '한글파일.txt';
      const krFolderName = '한글폴더';
      const rowByNodeId = (nodeId) =>
        Array.from(document.querySelectorAll('.tree-row[data-id]')).find((el) => el.getAttribute('data-id') === nodeId);
      const visible = tree.getVisibleItems();
      const krFileItem = visible.find((it) => it.node.label === krFileName && !it.node.isContainer);
      const krFolderItem = visible.find((it) => it.node.label === krFolderName && it.node.isContainer);

      let krFileRowOk = false;
      let krTabOk = false;
      if (krFileItem) {
        const rowEl = rowByNodeId(krFileItem.node.id);
        const labelEl = rowEl && rowEl.querySelector('.tree-label');
        krFileRowOk = Boolean(labelEl) && labelEl.textContent.trim() === krFileName;
        const panel = editor.openItem(krFileItem.node.id, krFileItem.node.label, { mode: 'pinned' });
        await wait(100);
        const tabTexts = Array.from(document.querySelectorAll('.dv-tab .dv-default-tab-content')).map((t) => t.textContent.trim());
        krTabOk = Boolean(panel) && panel.title === krFileName && tabTexts.includes(krFileName);
      }
      let krFolderRowOk = false;
      if (krFolderItem) {
        const rowEl = rowByNodeId(krFolderItem.node.id);
        const labelEl = rowEl && rowEl.querySelector('.tree-label');
        krFolderRowOk = Boolean(labelEl) && labelEl.textContent.trim() === krFolderName;
      }
      record(
        'V2P7-FR-L3',
        Boolean(krFileItem) && Boolean(krFolderItem) && krFileRowOk && krFolderRowOk && krTabOk,
        'A Korean file/folder name (user data, not product text) shows exactly as-is in its tree row, and the file\'s tab title matches it too (FR-L3, D-9) ' +
          JSON.stringify({ foundFile: Boolean(krFileItem), foundFolder: Boolean(krFolderItem), krFileRowOk, krFolderRowOk, krTabOk })
      );
    }

    // What the collector saw, for the runner's cross-host compare. Drop what
    // legitimately differs by run: the title bar's program-info line (host
    // name, FR-C9), and anything that is USER DATA — the opened folder's path
    // and file names, which FR-L explicitly keeps as-is.
    const programInfo = (byId('window-title') && byId('window-title').textContent.trim()) || '';
    const isUserData = (t) =>
      t === programInfo ||
      /\b(Electron|PyWebView)\b/.test(t) ||
      t.includes(String(dir)) ||
      /wb-v02p7-fixture/.test(t) ||
      /[\\/](Users|home|tmp|Temp)[\\/]/.test(t);
    const stringFingerprint = Array.from(new Set(collected.map((c) => c.text)))
      .filter((t) => !isUserData(t))
      .sort()
      .join('␟');
    record(
      'V2P7-STRINGS-COLLECTED',
      collected.length > 20,
      'Collected ' + collected.length + ' product strings from ' + new Set(collected.map((c) => c.where.split(':')[0])).size + ' surfaces'
    );
    window.__v2p7Strings = stringFingerprint;

    // ------------------------------------------------------------------------
    // Keyboard-path completeness (NFR-8): each command has a mouse-free route
    // and its key is in reserved-keys.md. A15 round-1 Critical finding: only
    // 11 hand-picked commands were covered, several barely — the list below
    // adds the explorer view actions, the resize handle, both submenu
    // choices, Recent Folder removal, both remaining File-menu close scopes,
    // and Split Down; "Exit" now really dispatches Alt+F4 instead of reading
    // its own doc string back; "Confirm tree item" now checks the SPECIFIC
    // item opened, not just that panel count went up.
    // ------------------------------------------------------------------------
    {
      const rootEl = byId('workbench-root');
      const cmds = [];
      // docCheck: optional (doc) => boolean, for a command whose route is
      // documented across more than one literal token. Falls back to the old
      // single-token substring/regex match when omitted.
      const note = (name, keyLabel, run, docCheck) => cmds.push({ name, keyLabel, run, docCheck });

      // Every File/View menu command shares the same mouse-free route: F10
      // opens the menu, arrows move within it, Enter activates — all
      // individually documented in reserved-keys.md §1 and §2. These helpers
      // drive that real route with real KeyboardEvents (menu.ts's own
      // `.kbd-focused` class is read back to confirm each step landed).
      const MENU_ROUTE_DOCUMENTED = (doc) =>
        /F10/.test(doc) && /ArrowUp.*ArrowDown|ArrowDown.*ArrowUp/.test(doc) && /포커스된 항목 실행/.test(doc);
      async function openMenuFresh() {
        if (byId('workbench-menu-dropdown')) await press('Escape');
        await wait(20);
        await press('F10');
        await wait(60);
      }
      async function menuGoToCategory(categoryId) {
        for (let guard = 0; guard < 5; guard++) {
          const active = document.querySelector('.menu-category-row.active');
          if (active && active.getAttribute('data-category-id') === categoryId) return true;
          await press('ArrowRight');
          await wait(30);
        }
        return false;
      }
      async function menuGoToItem(itemId) {
        for (let guard = 0; guard < 15; guard++) {
          const focused = document.querySelector('.menu-item-row.kbd-focused:not(.menu-child-row)');
          if (focused && focused.getAttribute('data-item-id') === itemId) return true;
          await press('ArrowDown');
          await wait(25);
        }
        return false;
      }
      async function menuGoToSubItem(subItemId) {
        for (let guard = 0; guard < 15; guard++) {
          const focused = document.querySelector('.menu-item-row.kbd-focused.menu-child-row');
          if (focused && focused.getAttribute('data-item-id') === subItemId) return true;
          await press('ArrowDown');
          await wait(25);
        }
        return false;
      }
      // F10, arrow to category, arrow to item, (optionally open + arrow to a
      // submenu row), Enter. Returns whether every navigation step actually
      // landed — not just that Enter was eventually pressed somewhere.
      async function activateByMenuKeyboard(categoryId, itemId, subItemId) {
        await openMenuFresh();
        if (!(await menuGoToCategory(categoryId))) return false;
        if (!(await menuGoToItem(itemId))) return false;
        if (subItemId) {
          await press('ArrowRight');
          await wait(60);
          if (!(await menuGoToSubItem(subItemId))) return false;
        }
        await press('Enter');
        await wait(90);
        return true;
      }

      note('Open Folder', 'Ctrl+O', async () => {
        // A15 round-2 Critical finding: the fixture folder was already open
        // when this ran, so `before === dir` let a disabled Ctrl+O handler
        // pass anyway. Close it first so only the key press can reopen it.
        window.__nextDialogPath = dir;
        app.closeFolder();
        await wait(80);
        const closedFirst = !(tree.getRoot() && tree.getRoot().id === dir);
        await press('o', { ctrlKey: true });
        const ok = await until(() => tree.getRoot() && tree.getRoot().id === dir, 3000);
        if (ok) {
          tree.setExpanded(tree.getRoot().id, true);
          await wait(80);
        }
        return closedFirst && ok;
      });
      note('Toggle Sidebar', 'Ctrl+B', async () => {
        const sb = byId('sidebar');
        const vis = () => getComputedStyle(sb).display !== 'none' && !sb.classList.contains('hidden');
        const was = vis();
        await press('b', { ctrlKey: true });
        const changed = vis() !== was;
        await press('b', { ctrlKey: true });
        return changed;
      });
      note('Zen Mode', 'F11', async () => {
        await press('F11');
        const on = rootEl.classList.contains('zen-mode');
        await press('Escape');
        return on;
      });
      note('Open Menu', 'F10', async () => {
        await press('F10');
        const open = Boolean(byId('workbench-menu-dropdown'));
        if (open) await press('Escape');
        return open;
      });
      note('Split editor (right)', 'Ctrl+\\', async () => {
        editor.clear();
        await wait(60);
        await press('\\', { ctrlKey: true });
        await wait(80);
        return editor.getGroupCount() === 2;
      });
      note('Split Down (menu)', 'F10 → File → Split Down → Enter', async () => {
        editor.clear();
        await wait(60);
        const before = editor.getGroupCount();
        const navigated = await activateByMenuKeyboard('file', 'file:split-down');
        await wait(100);
        return navigated && editor.getGroupCount() === before + 1;
      }, MENU_ROUTE_DOCUMENTED);
      note('Close Active Tab', 'Ctrl+W', async () => {
        editor.clear();
        await wait(40);
        editor.openItem('/v02p7/k1.txt', 'k1.txt', { mode: 'pinned' });
        editor.openItem('/v02p7/k2.txt', 'k2.txt', { mode: 'pinned' });
        await wait(60);
        const n = editor.getPanelCount();
        await press('w', { ctrlKey: true });
        await wait(60);
        return editor.getPanelCount() === n - 1;
      });
      note('Close Editor Group (menu)', 'F10 → File → Close Editor Group → Enter', async () => {
        editor.clear();
        await wait(40);
        editor.openItem('/v02p7/ceg1.txt', 'ceg1.txt', { mode: 'pinned' });
        editor.openItem('/v02p7/ceg2.txt', 'ceg2.txt', { mode: 'pinned' });
        await wait(60);
        const before = editor.getPanelCount();
        const navigated = await activateByMenuKeyboard('file', 'file:close-editor-group');
        await wait(100);
        return navigated && before === 2 && editor.getPanelCount() === 0;
      }, MENU_ROUTE_DOCUMENTED);
      note('Close All Tabs (menu)', 'F10 → File → Close All Tabs → Enter', async () => {
        editor.clear();
        await wait(40);
        editor.openItem('/v02p7/cat1.txt', 'cat1.txt', { mode: 'pinned' });
        await press('\\', { ctrlKey: true });
        await wait(80);
        editor.openItem('/v02p7/cat2.txt', 'cat2.txt', { mode: 'pinned' });
        await wait(60);
        const before = editor.getPanelCount();
        const navigated = await activateByMenuKeyboard('file', 'file:close-all-tabs');
        await wait(120);
        return navigated && before > 0 && editor.getPanelCount() === 0;
      }, MENU_ROUTE_DOCUMENTED);
      note('Exit', 'Alt+F4', async () => {
        // A15 round-1 Critical finding: this used to just check the doc
        // string, never dispatching the key. It now really presses Alt+F4
        // with a dirty tab open — the same real close gate FR-L6's Cancel
        // case already proves safe to exercise (phase6-suite.js) — and
        // confirms the confirm dialog actually opened, then cancels so the
        // harness process keeps running.
        editor.clear();
        await wait(40);
        const t = editor.openItem('/v02p7/exit-dirty.txt', 'exit-dirty.txt', { mode: 'pinned' });
        editor.setTabDirty(t.id, true);
        await wait(60);
        await press('F4', { altKey: true });
        await wait(300);
        const shown = app.confirmDialog.isOpen();
        const cancelBtn = document.querySelector('.confirm-dialog-btn[data-choice="cancel"]');
        if (cancelBtn) await clickEl(cancelBtn);
        editor.setTabDirty(t.id, false);
        return shown;
      });
      note('Cycle area', 'F6', async () => {
        // A15 round-2 Critical finding: "still somewhere inside the
        // workbench" was trivially true even with F6 disabled, because the
        // starting focus (the tree list itself) already satisfied it.
        // Compare identity, not just location.
        // A15 round-3 Critical finding: a broken implementation that always
        // focuses one FIXED element (e.g. "always jump to the first editor
        // group") still passed the round-2 fix, since it only compared
        // against the ORIGINAL starting point once. Press F6 twice and
        // require the SECOND press also moves — a fixed-target
        // implementation keeps landing on the same element the second time.
        editor.clear();
        await wait(40);
        editor.openItem('/v02p7/a.txt', 'a.txt', { mode: 'pinned' });
        await wait(60);
        const list = byId('sidebar-content').querySelector('.tree-list');
        if (list) list.focus();
        const p0 = document.activeElement;
        await press('F6');
        const p1 = document.activeElement;
        await press('F6');
        const p2 = document.activeElement;
        return (
          Boolean(p1) && Boolean(p2) &&
          rootEl.contains(p1) && rootEl.contains(p2) &&
          p1 !== document.body && p2 !== document.body &&
          p1 !== p0 && p2 !== p1
        );
      });
      note('Cycle area (reverse)', 'Shift+F6', async () => {
        editor.clear();
        await wait(40);
        editor.openItem('/v02p7/a.txt', 'a.txt', { mode: 'pinned' });
        await wait(60);
        const list = byId('sidebar-content').querySelector('.tree-list');
        if (list) list.focus();
        const before = document.activeElement;
        await press('F6', { shiftKey: true });
        const after = document.activeElement;
        return Boolean(after) && rootEl.contains(after) && after !== document.body && after !== before;
      }, (doc) => /Shift\+F6/.test(doc));
      note('Cycle tab in group', 'Ctrl+Tab', async () => {
        editor.clear();
        await wait(40);
        editor.openItem('/v02p7/t1.txt', 't1.txt', { mode: 'pinned' });
        editor.openItem('/v02p7/t2.txt', 't2.txt', { mode: 'pinned' });
        await wait(60);
        const active0 = editor.getActivePanel() && editor.getActivePanel().params.targetId;
        await press('Tab', { ctrlKey: true });
        await wait(60);
        const active1 = editor.getActivePanel() && editor.getActivePanel().params.targetId;
        return Boolean(active0) && Boolean(active1) && active0 !== active1;
      });
      note('Cycle tab in group (reverse)', 'Ctrl+Shift+Tab', async () => {
        editor.clear();
        await wait(40);
        editor.openItem('/v02p7/rt1.txt', 'rt1.txt', { mode: 'pinned' });
        editor.openItem('/v02p7/rt2.txt', 'rt2.txt', { mode: 'pinned' });
        editor.openItem('/v02p7/rt3.txt', 'rt3.txt', { mode: 'pinned' });
        await wait(60);
        const active0 = editor.getActivePanel() && editor.getActivePanel().params.targetId;
        await press('Tab', { ctrlKey: true, shiftKey: true });
        await wait(60);
        const active1 = editor.getActivePanel() && editor.getActivePanel().params.targetId;
        return Boolean(active0) && Boolean(active1) && active0 !== active1;
      }, (doc) => /Ctrl\+Shift\+Tab/.test(doc));
      note('Confirm tree item', 'Enter', async () => {
        editor.clear();
        await wait(40);
        const firstFile = tree.getVisibleItems().find((it) => !it.node.isContainer);
        if (!firstFile) return false;
        tree.focusItemById ? tree.focusItemById(firstFile.node.id) : null;
        const list = byId('sidebar-content').querySelector('.tree-list');
        if (list) list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await wait(120);
        // A15 round-1 Critical finding: >= 1 panel passed even if Enter did
        // nothing (a stray earlier panel). Check the SPECIFIC item opened.
        const active = editor.getActivePanel();
        return (
          editor.getPanelCount() === 1 &&
          Boolean(active) &&
          Boolean(active.params) &&
          active.params.targetId === firstFile.node.id
        );
      });
      note('Find in tree', 'F3', async () => {
        const list = byId('sidebar-content').querySelector('.tree-list');
        if (list) {
          list.focus();
          list.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true }));
        }
        await wait(80);
        const open = tree.getIsFindOpen && tree.getIsFindOpen();
        if (open) tree.closeFindWidget();
        return Boolean(open);
      });
      note('Resize explorer (keyboard)', 'ArrowLeft/ArrowRight/Home (resize handle)', async () => {
        const handle = byId('sidebar-resize-handle');
        if (!handle) return false;
        handle.focus();
        // Computed, not inline: before the first resize the variable comes
        // only from the stylesheet default, not rootEl.style.
        const widthOf = () => getComputedStyle(rootEl).getPropertyValue('--sidebar-width').trim();
        const before = widthOf();
        await press('ArrowRight');
        await wait(60);
        const afterRight = widthOf();
        await press('Home');
        await wait(60);
        const afterHome = widthOf();
        // Restore, so later tests (the four view-action buttons right below)
        // see the width they started with rather than the MIN this leaves.
        if (before) rootEl.style.setProperty('--sidebar-width', before);
        await wait(40);
        return Boolean(before) && afterRight !== before && afterHome !== afterRight;
      }, (doc) => /탐색기 폭 조절 손잡이/.test(doc) && /ArrowLeft.*ArrowRight|ArrowRight.*ArrowLeft/.test(doc) && /Home/.test(doc));
      // A15 round-3 Critical finding: checking only that these are enabled,
      // focusable native <button>s never proved the CLICK actually does
      // anything — an existence-only check. Empirically verified (a
      // throwaway Electron probe, not part of this suite): a synthetic
      // `KeyboardEvent('keydown', {key:'Enter'})` dispatched at a focused
      // native <button> does NOT fire its click handler in this Chromium
      // build — unlike a real, trusted keypress, native control activation
      // via Enter/Space does not run from script-dispatched events. That is
      // the same class of platform ceiling already accepted for FR-N3's
      // native-resize check (section 2b above): nothing to synthesize. So
      // each row below still confirms the structural precondition (a real,
      // enabled, focusable native <button> — which per platform semantics
      // DOES receive Enter/Space activation from an actual keypress) AND
      // additionally drives `.click()` (the one trusted-independent
      // activation API there is) to prove the handler behind it produces
      // the specific claimed effect — closing the "existence-only" gap as
      // far as this platform allows it to be closed.
      note('New File (view action)', 'Tab → Enter/Space (native button)', async () => {
        const btn = byId('sidebar-action-new-file');
        const structural = Boolean(btn) && btn.tagName === 'BUTTON' && btn.tabIndex !== -1 && !btn.disabled && btn.getAttribute('aria-hidden') !== 'true';
        if (!structural) return false;
        btn.click();
        await wait(60);
        const opened = Boolean(document.querySelector('.tree-input-row'));
        const inputRow = document.querySelector('.tree-input-row .tree-input-field');
        if (inputRow) inputRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await wait(40);
        return opened;
      }, (doc) => /New File[\s\S]{0,80}Refresh[\s\S]{0,80}Collapse All/.test(doc) && /Tab.*Enter.*Space|Enter.*Space/.test(doc));
      note('New Folder (view action)', 'Tab → Enter/Space (native button)', async () => {
        const btn = byId('sidebar-action-new-folder');
        const structural = Boolean(btn) && btn.tagName === 'BUTTON' && btn.tabIndex !== -1 && !btn.disabled && btn.getAttribute('aria-hidden') !== 'true';
        if (!structural) return false;
        btn.click();
        await wait(60);
        const opened = Boolean(document.querySelector('.tree-input-row'));
        const inputRow = document.querySelector('.tree-input-row .tree-input-field');
        if (inputRow) inputRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await wait(40);
        return opened;
      }, (doc) => /New File[\s\S]{0,80}Refresh[\s\S]{0,80}Collapse All/.test(doc) && /Tab.*Enter.*Space|Enter.*Space/.test(doc));
      note('Refresh (view action)', 'Tab → Enter/Space (native button)', async () => {
        const btn = byId('sidebar-action-refresh');
        const structural = Boolean(btn) && btn.tagName === 'BUTTON' && btn.tabIndex !== -1 && !btn.disabled && btn.getAttribute('aria-hidden') !== 'true';
        if (!structural) return false;
        // Swap in a call-counting wrapper around the real data provider so a
        // no-op Refresh handler (button does nothing) is distinguishable
        // from a working one (calls dataProvider.getChildren again).
        const real = tree.getDataProvider();
        if (!real) return false;
        let calls = 0;
        tree.setDataProvider({ getChildren: (n) => { calls++; return real.getChildren(n); } });
        btn.click();
        await until(() => calls > 0, 2000);
        tree.setDataProvider(real);
        return calls > 0;
      }, (doc) => /New File[\s\S]{0,80}Refresh[\s\S]{0,80}Collapse All/.test(doc) && /Tab.*Enter.*Space|Enter.*Space/.test(doc));
      note('Collapse All (view action)', 'Tab → Enter/Space (native button)', async () => {
        const btn = byId('sidebar-action-collapse-all');
        const structural = Boolean(btn) && btn.tagName === 'BUTTON' && btn.tabIndex !== -1 && !btn.disabled && btn.getAttribute('aria-hidden') !== 'true';
        if (!structural) return false;
        const rootId = tree.getRoot() && tree.getRoot().id;
        if (!rootId) return false;
        tree.setExpanded(rootId, true);
        await wait(60);
        const wasExpanded = tree.isExpanded(rootId);
        btn.click();
        await wait(80);
        const isExpandedAfter = tree.isExpanded(rootId);
        tree.setExpanded(rootId, true); // restore for later tests
        await wait(60);
        return wasExpanded && !isExpandedAfter;
      }, (doc) => /New File[\s\S]{0,80}Refresh[\s\S]{0,80}Collapse All/.test(doc) && /Tab.*Enter.*Space|Enter.*Space/.test(doc));
      note('Select Color Theme (menu)', 'F10 → View → Color Theme → item → Enter', async () => {
        const before = app.theme.getTheme();
        const target = before === 'gray' ? 'dark' : 'gray';
        const navigated = await activateByMenuKeyboard('view', 'view:color-theme', `view:color-theme:${target}`);
        await wait(80);
        const ok = navigated && app.theme.getTheme() === target;
        app.theme.setTheme(before); // leave state as found
        return ok;
      }, MENU_ROUTE_DOCUMENTED);
      note('Select Icon Theme (menu)', 'F10 → View → Icon Theme → item → Enter', async () => {
        const before = app.iconTheme.getTheme();
        const target = before === 'seti' ? 'vscode-icons' : 'seti';
        const navigated = await activateByMenuKeyboard('view', 'view:icon-theme', `view:icon-theme:${target}`);
        await wait(80);
        const ok = navigated && app.iconTheme.getTheme() === target;
        app.iconTheme.setTheme(before);
        tree.render();
        return ok;
      }, MENU_ROUTE_DOCUMENTED);
      note('Open Recent Folder (menu, Enter on row)', 'F10 → File → Recent Folders → item → Enter', async () => {
        if (app.getRecentFolders().length === 0) return false;
        app.closeFolder();
        await wait(60);
        const navigated = await activateByMenuKeyboard('file', 'file:open-recent', 'file:open-recent:0');
        const ok = navigated && (await until(() => tree.getRoot() && tree.getRoot().id === dir, 3000));
        tree.setExpanded(tree.getRoot() ? tree.getRoot().id : '', true);
        await wait(80);
        return ok;
      }, MENU_ROUTE_DOCUMENTED);
      note('Remove Recent Folder (Delete, in submenu)', 'Delete', async () => {
        const before = app.getRecentFolders().length;
        if (before === 0) return false;
        await openMenuFresh();
        if (!(await menuGoToCategory('file'))) { await press('Escape'); return false; }
        if (!(await menuGoToItem('file:open-recent'))) { await press('Escape'); return false; }
        await press('ArrowRight');
        await wait(60);
        if (!(await menuGoToSubItem('file:open-recent:0'))) { await press('Escape'); return false; }
        await press('Delete');
        await wait(80);
        await press('Escape');
        return app.getRecentFolders().length === before - 1;
      }, (doc) => /Delete[\s\S]{0,120}Recent Folders/.test(doc));
      note('Toggle Title Bar (menu)', 'F10 → View → Show Title Bar → Enter', async () => {
        const before = app.viewState.getState().titlebarVisible;
        const navigated = await activateByMenuKeyboard('view', 'view:toggle-titlebar');
        await wait(80);
        const after = app.viewState.getState().titlebarVisible;
        const changed = after !== before;
        if (changed) {
          await activateByMenuKeyboard('view', 'view:toggle-titlebar'); // restore
          await wait(80);
        }
        return navigated && changed;
      }, MENU_ROUTE_DOCUMENTED);
      note('Toggle Status Bar (menu)', 'F10 → View → Show Status Bar → Enter', async () => {
        const before = app.viewState.getState().statusbarVisible;
        const navigated = await activateByMenuKeyboard('view', 'view:toggle-statusbar');
        await wait(80);
        const after = app.viewState.getState().statusbarVisible;
        const changed = after !== before;
        if (changed) {
          await activateByMenuKeyboard('view', 'view:toggle-statusbar'); // restore
          await wait(80);
        }
        return navigated && changed;
      }, MENU_ROUTE_DOCUMENTED);
      note('Preset Info (menu)', 'F10 → View → Preset Info → Enter', async () => {
        app.statusMessages.showMessage('');
        await wait(30);
        const navigated = await activateByMenuKeyboard('view', 'view:preset-info');
        await wait(80);
        const text = (byId('statusbar-message') && byId('statusbar-message').textContent) || '';
        return navigated && text.trim().length > 0;
      }, MENU_ROUTE_DOCUMENTED);
      note('About (menu)', 'F10 → Help → About → Enter', async () => {
        const navigated = await activateByMenuKeyboard('help', 'help:about');
        await wait(80);
        const open = app.aboutDialog.isOpen();
        app.aboutDialog.hide();
        return navigated && open;
      }, MENU_ROUTE_DOCUMENTED);
      note('New Tab (tab-strip button)', 'Tab → Enter/Space (native button)', async () => {
        editor.clear();
        await wait(60);
        const btn = document.querySelector('.tab-action-new');
        const structural = Boolean(btn) && btn.tagName === 'BUTTON' && btn.tabIndex !== -1 && !btn.disabled;
        if (!structural) return false;
        const before = editor.getPanelCount();
        btn.click();
        await wait(80);
        const after = editor.getPanelCount();
        return after === before + 1;
      }, (doc) => /Split Right[\s\S]{0,40}Split Down[\s\S]{0,20}New Tab/.test(doc) && /Tab.*Enter.*Space|Enter.*Space/.test(doc));

      const rows = [];
      for (const c of cmds) {
        let works = false;
        try {
          works = await c.run();
        } catch (e) {
          works = false;
        }
        let documented;
        if (typeof c.docCheck === 'function') {
          documented = Boolean(c.docCheck(reservedDoc));
        } else {
          // The key label's core token appears in reserved-keys.md.
          const token = c.keyLabel.replace(/\\/g, '\\\\');
          documented = new RegExp(token.replace(/[.*+?^${}()|[\]]/g, '\\$&').replace('\\\\\\\\', '\\\\')).test(reservedDoc) ||
            reservedDoc.includes(c.keyLabel);
        }
        rows.push({ name: c.name, key: c.keyLabel, works, documented });
      }
      const allWork = rows.every((r) => r.works);
      const allDocumented = rows.every((r) => r.documented);
      record(
        'V2P7-NFR8-KEYBOARD',
        allWork && allDocumented,
        'Every listed SPEC section-1 command has a working mouse-free route AND its key is in docs/reserved-keys.md (NFR-8) ' +
          JSON.stringify(rows.map((r) => [r.name, r.works, r.documented]))
      );
      window.__nextDialogPath = null;
    }

    // ------------------------------------------------------------------------
    // The divergences the comparison doc claims are real on screen (NFR-5)
    // ------------------------------------------------------------------------
    {
      editor.clear();
      await wait(60);
      // Preview tab really exists (v0.2 flipped this from a divergence).
      const firstFile = tree.getVisibleItems().find((it) => !it.node.isContainer);
      let previewSeen = false;
      if (firstFile) {
        tree.getDataProvider(); // no-op
        // single "open" == preview
        app.__workbenchApp; // no-op
        editor.openItem(firstFile.node.id, firstFile.node.label, { mode: 'preview' });
        await wait(80);
        const tab = document.querySelector('.dv-tab');
        const content = tab && tab.querySelector('.dv-default-tab-content');
        previewSeen = Boolean(content) && getComputedStyle(content).fontStyle === 'italic';
      }
      // The tab-strip + button exists (a divergence from VS Code).
      const plusBtn = document.querySelector('.tab-action-new');
      // The five chrome areas are 30 (the new dimension divergence).
      const ts = document.querySelector('.dv-tabs-and-actions-container');
      const areas = {
        titlebar: Math.round(byId('titlebar').getBoundingClientRect().height),
        statusbar: Math.round(byId('statusbar').getBoundingClientRect().height),
        activitybar: Math.round(byId('activity-bar').getBoundingClientRect().width),
        explorerHeader: Math.round(byId('sidebar-header').getBoundingClientRect().height),
        tabStrip: ts ? Math.round(ts.getBoundingClientRect().height) : null,
      };
      record(
        'V2P7-NFR5-DIVERGENCE',
        previewSeen && Boolean(plusBtn) && Object.values(areas).every((v) => v === 30),
        'On screen: the preview tab now exists (the removed divergence), the tab strip + button exists, and the five chrome areas are all 30 (the new divergences) (NFR-5) ' +
          JSON.stringify({ previewSeen, plusBtn: Boolean(plusBtn), areas })
      );
    }

    const allPassed = results.every((r) => r.pass);
    return { success: allPassed, results, strings: window.__v2p7Strings };
  } catch (err) {
    record('GLOBAL_EXCEPTION', false, 'Uncaught error in v0.2 Phase 7 suite: ' + (err && err.stack ? err.stack : err));
    return { success: false, results };
  }
};
