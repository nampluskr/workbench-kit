/**
 * Host-neutral v0.2 Phase 4 acceptance suite — 메뉴와 칸 수명.
 *
 * Covers FR-M1 ~ FR-M12, FR-P11, FR-P12.
 *
 * Judged on screen (NFR-3): menu rows are read from the rendered menu (visible
 * labels, order, separators, positions, computed glyphs), results from what the
 * workbench shows afterwards. Commands go through the menu row, header button
 * or key a user presses. The runner provides window.__testTmpDirs (three real
 * folders, each holding one file) and stubs only the native folder picker,
 * which returns window.__nextDialogPath.
 */
window.__runV02Phase4Suite = async function runV02Phase4Suite() {
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
    const dirs = window.__testTmpDirs || [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const byId = (id) => document.getElementById(id);

    function visible(el) {
      if (!el) return false;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    async function clickEl(el) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(80);
    }

    async function press(key, mods) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {})));
      await wait(120);
    }

    async function until(check, ms) {
      const end = Date.now() + (ms || 3000);
      while (Date.now() < end) {
        if (check()) return true;
        await wait(40);
      }
      return Boolean(check());
    }

    const dropdown = () => byId('workbench-menu-dropdown');
    const labelOf = (row) => ((row && row.querySelector(':scope > .menu-item-label')) || { textContent: '' }).textContent.trim();

    async function openCategory(cat) {
      if (!dropdown()) await clickEl(byId('menu-hamburger-btn'));
      const row = document.querySelector('.menu-category-row[data-category-id="' + cat + '"]');
      if (row) await clickEl(row);
      return document.querySelector('.menu-submenu[data-parent-group="' + cat + '"]');
    }

    async function closeMenu() {
      if (dropdown()) await clickEl(byId('menu-hamburger-btn'));
    }

    function topRow(cat, id) {
      return document.querySelector('.menu-submenu[data-parent-group="' + cat + '"] > .menu-item-row[data-item-id="' + id + '"]');
    }

    /** A category's list as shown, top to bottom: labels, with '|' for a separator. */
    async function listOf(cat) {
      const sub = await openCategory(cat);
      if (!sub) return [];
      return Array.from(sub.children).map((el) => (el.classList.contains('menu-separator') ? '|' : labelOf(el)));
    }

    async function clickTop(cat, id) {
      await openCategory(cat);
      const row = topRow(cat, id);
      if (!row) throw new Error('No menu row ' + id);
      await clickEl(row);
    }

    /** Points at a submenu row the way the mouse does; returns its list and rows. */
    async function openChild(cat, id) {
      await openCategory(cat);
      const row = topRow(cat, id);
      if (!row) throw new Error('No menu row ' + id);
      row.dispatchEvent(new MouseEvent('mouseenter'));
      await wait(60);
      const list = row.querySelector(':scope > .menu-child-submenu');
      return { row, list, rows: list ? Array.from(list.querySelectorAll(':scope > .menu-item-row')) : [] };
    }

    const FILE_EXPECTED = ['Open Folder...', '|', 'Recent Folders', '|', 'Split Right', 'Split Down', 'Close Active Tab', 'Close Editor Group', 'Close All Tabs', '|', 'Exit'];
    const VIEW_EXPECTED = ['Color Theme', '|', 'Icon Theme', '|', 'Zen Mode', 'Show Sidebar', 'Show Title Bar', 'Show Status Bar', '|', 'Preset Info'];
    const itemsOnly = (seq) => seq.filter((s) => s !== '|');

    // ------------------------------------------------------------------------
    // FR-M1 · FR-M2 · FR-M3 — the three lists
    // ------------------------------------------------------------------------
    {
      const seq = await listOf('file');
      const rows = Array.from(document.querySelectorAll('.menu-submenu[data-parent-group="file"] > .menu-item-row'));
      record(
        'V2P4-FR-M1',
        JSON.stringify(itemsOnly(seq)) === JSON.stringify(itemsOnly(FILE_EXPECTED)) && rows.length === 8 && rows.every(visible),
        'File shows exactly Open Folder... · Recent Folders · Split Right · Split Down · Close Active Tab · Close Editor Group · Close All Tabs · Exit, all visible, nothing else (FR-M1) ' +
          JSON.stringify(itemsOnly(seq))
      );
    }
    {
      const seq = await listOf('view');
      const rows = Array.from(document.querySelectorAll('.menu-submenu[data-parent-group="view"] > .menu-item-row'));
      record(
        'V2P4-FR-M2',
        JSON.stringify(itemsOnly(seq)) === JSON.stringify(itemsOnly(VIEW_EXPECTED)) && rows.length === 7 && rows.every(visible),
        'View shows exactly Color Theme · Icon Theme · Zen Mode · Show Sidebar · Show Title Bar · Show Status Bar · Preset Info, all visible, nothing else (FR-M2) ' +
          JSON.stringify(itemsOnly(seq))
      );
    }
    {
      const seq = await listOf('help');
      const aboutRow = topRow('help', 'help:about');
      const rowShown = visible(aboutRow);
      if (aboutRow) await clickEl(aboutRow);
      const dialog = document.querySelector('.workbench-about-dialog');
      const dialogShown = visible(dialog);
      const dismiss = dialog ? dialog.querySelector('.confirm-dialog-btn') : null;
      if (dismiss) await clickEl(dismiss);
      record(
        'V2P4-FR-M3',
        JSON.stringify(seq) === JSON.stringify(['About']) && rowShown && dialogShown,
        'Help holds only About, and pressing it puts the About window on screen (FR-M3) list=' + JSON.stringify(seq) + ' dialog=' + dialogShown
      );
    }

    // ------------------------------------------------------------------------
    // FR-M11 — the submenu mark is the chevron glyph, not a character
    // ------------------------------------------------------------------------
    {
      await openCategory('file');
      const arrows = Array.from(document.querySelectorAll('.menu-category-row > .menu-category-arrow'));
      const glyphs = arrows.map((el) => getComputedStyle(el, '::before').content);
      const menuText = dropdown() ? dropdown().textContent : '';
      record(
        'V2P4-FR-M11',
        arrows.length === 3 &&
          arrows.every((el) => el.classList.contains('codicon-chevron-right') && visible(el)) &&
          glyphs.every((g) => g && g !== 'none' && g !== 'normal' && g === glyphs[0]) &&
          !/[▶>›]/.test(menuText),
        'File, View and Help each show the same visible chevron glyph, and the menu contains 0 "▶" and 0 ">" (FR-M11) glyphs=' + JSON.stringify(glyphs)
      );
    }

    // ------------------------------------------------------------------------
    // FR-M4 — shortcuts on exactly five rows, right-aligned
    // ------------------------------------------------------------------------
    {
      const EXPECTED = { 'Open Folder...': 'Ctrl+O', 'Close Active Tab': 'Ctrl+W', Exit: 'Alt+F4', 'Zen Mode': 'F11', 'Show Sidebar': 'Ctrl+B' };
      const found = {};
      let aligned = true;
      for (const cat of ['file', 'view', 'help']) {
        const sub = await openCategory(cat);
        for (const row of sub.querySelectorAll(':scope > .menu-item-row')) {
          const cell = row.querySelector(':scope > .menu-item-shortcut');
          const text = cell ? cell.textContent.trim() : '';
          if (!text) continue;
          found[labelOf(row)] = text;
          const labelRect = row.querySelector(':scope > .menu-item-label').getBoundingClientRect();
          const cellRect = cell.getBoundingClientRect();
          const rowRect = row.getBoundingClientRect();
          if (!(visible(cell) && cellRect.left >= labelRect.right && rowRect.right - cellRect.right <= 20)) aligned = false;
        }
      }
      await closeMenu();
      const exact =
        Object.keys(found).length === 5 && Object.keys(EXPECTED).every((label) => found[label] === EXPECTED[label]);
      record(
        'V2P4-FR-M4',
        exact && aligned,
        'Exactly the five rows show their shortcut, each right of its label at the row\'s right edge; every other row shows no shortcut text (FR-M4) ' +
          JSON.stringify(found)
      );
    }

    // ------------------------------------------------------------------------
    // FR-M6 — separators where the list says
    // ------------------------------------------------------------------------
    {
      const fileSeq = await listOf('file');
      const fileSeps = Array.from(document.querySelectorAll('.menu-submenu[data-parent-group="file"] > .menu-separator'));
      const fileSepsShown = fileSeps.every(visible);
      const viewSeq = await listOf('view');
      const viewSeps = Array.from(document.querySelectorAll('.menu-submenu[data-parent-group="view"] > .menu-separator'));
      const viewSepsShown = viewSeps.every(visible);
      await closeMenu();
      record(
        'V2P4-FR-M6',
        JSON.stringify(fileSeq) === JSON.stringify(FILE_EXPECTED) &&
          JSON.stringify(viewSeq) === JSON.stringify(VIEW_EXPECTED) &&
          fileSeps.length === 3 && viewSeps.length === 3 && fileSepsShown && viewSepsShown,
        'File has visible separators after Open Folder..., Recent Folders and Close All Tabs; View after Color Theme, Icon Theme and Show Status Bar (FR-M6) ' +
          JSON.stringify({ file: fileSeq, view: viewSeq })
      );
    }

    // ------------------------------------------------------------------------
    // FR-M12 — View > Preset Info
    // ------------------------------------------------------------------------
    {
      const messageEl = byId('statusbar-message');
      app.statusMessages.showMessage('');
      const viewSeq = await listOf('view');
      await clickTop('view', 'view:preset-info');
      const shown = await until(() => /Presets/.test(messageEl.textContent) && visible(messageEl), 1500);
      record(
        'V2P4-FR-M12',
        viewSeq[viewSeq.length - 1] === 'Preset Info' && shown,
        'Preset Info is in View, and pressing it shows the preset information in the status bar (FR-M12) text="' + messageEl.textContent + '"'
      );
    }

    // ------------------------------------------------------------------------
    // FR-M8 — Color Theme: White · Gray · Dark
    // ------------------------------------------------------------------------
    {
      let opened = await openChild('view', 'view:color-theme');
      const labels = opened.rows.map(labelOf);
      const listShown = visible(opened.list) && opened.rows.every(visible);
      const paint = {};
      let applied = true;
      let marks = true;
      for (const [label, id] of [['White', 'light'], ['Gray', 'gray'], ['Dark', 'dark']]) {
        opened = await openChild('view', 'view:color-theme');
        const row = opened.rows.find((r) => labelOf(r) === label);
        if (!row) {
          applied = false;
          continue;
        }
        await clickEl(row);
        await wait(40);
        if (document.documentElement.dataset.theme !== id) applied = false;
        paint[id] = getComputedStyle(byId('sidebar')).backgroundColor + '/' + getComputedStyle(byId('titlebar')).backgroundColor;
        opened = await openChild('view', 'view:color-theme');
        const checked = opened.rows.filter((r) => visible(r.querySelector('.menu-item-check .codicon-check'))).map(labelOf);
        if (JSON.stringify(checked) !== JSON.stringify([label])) marks = false;
        await closeMenu();
      }
      record(
        'V2P4-FR-M8',
        JSON.stringify(labels) === JSON.stringify(['White', 'Gray', 'Dark']) && listShown && applied &&
          new Set(Object.values(paint)).size === 3 && marks,
        'Color Theme lists White · Gray · Dark; choosing each paints the workbench in that theme and marks only that row (FR-M8) ' +
          JSON.stringify({ labels, paint, applied, marks })
      );
    }

    // ------------------------------------------------------------------------
    // FR-M7 — Recent Folders
    // ------------------------------------------------------------------------
    // Setup: the list holds exactly the runner's three folders, newest last.
    for (const p of [...app.getRecentFolders()]) app.removeRecentFolder(p);
    for (const d of dirs) await app.openFolder(d);
    await wait(120);
    {
      const opened = await openChild('file', 'file:open-recent');
      const listed = opened.rows.map(labelOf);
      const listShown =
        visible(opened.list) && opened.rows.every(visible) && opened.rows.every((r) => visible(r.querySelector('.menu-item-secondary')));
      record(
        'V2P4-FR-M7-LIST',
        dirs.length === 3 && JSON.stringify(listed) === JSON.stringify([dirs[2], dirs[1], dirs[0]]) && listShown,
        'Recent Folders shows every stored path, newest first, each row with a visible remove button (FR-M7) ' + JSON.stringify(listed)
      );
    }
    {
      let opened = await openChild('file', 'file:open-recent');
      const middle = opened.rows.find((r) => labelOf(r) === dirs[1]);
      if (middle) await clickEl(middle.querySelector('.menu-item-secondary'));
      const rowAfter = topRow('file', 'file:open-recent');
      const listAfter = rowAfter ? rowAfter.querySelector(':scope > .menu-child-submenu') : null;
      const labelsAfter = listAfter ? Array.from(listAfter.querySelectorAll(':scope > .menu-item-row')).map(labelOf) : [];
      const stillOpen = visible(listAfter);
      await closeMenu();
      opened = await openChild('file', 'file:open-recent');
      const reopened = opened.rows.map(labelOf);
      await closeMenu();
      const stored = JSON.parse(localStorage.getItem('workbench:recent-folders') || '[]');
      record(
        'V2P4-FR-M7-REMOVE',
        JSON.stringify(labelsAfter) === JSON.stringify([dirs[2], dirs[0]]) && stillOpen &&
          JSON.stringify(reopened) === JSON.stringify([dirs[2], dirs[0]]) && !stored.includes(dirs[1]),
        'Pressing a row\'s remove button takes that row off the open list, and it is still gone when the menu is opened again (FR-M7) ' +
          JSON.stringify({ labelsAfter, stillOpen, reopened })
      );
    }
    {
      // The keyboard path to the same list (NFR-7): F10, down to Recent
      // Folders, right into the list, Delete on the focused path.
      await closeMenu();
      await press('F10');
      await press('ArrowDown');
      await press('ArrowRight');
      let row = topRow('file', 'file:open-recent');
      let list = row ? row.querySelector(':scope > .menu-child-submenu') : null;
      const focused = list ? list.querySelector(':scope > .menu-item-row.kbd-focused') : null;
      const openedByKeys = visible(list) && visible(focused);
      const focusedLabel = labelOf(focused);
      await press('Delete');
      row = topRow('file', 'file:open-recent');
      list = row ? row.querySelector(':scope > .menu-child-submenu') : null;
      const afterDelete = list ? Array.from(list.querySelectorAll(':scope > .menu-item-row')).map(labelOf) : [];
      await press('Escape');
      record(
        'V2P4-FR-M7-KEYBOARD',
        openedByKeys && focusedLabel === dirs[2] && JSON.stringify(afterDelete) === JSON.stringify([dirs[0]]) && !dropdown(),
        'F10 → ArrowDown → ArrowRight opens Recent Folders on its first path, Delete removes it, Escape closes the menu (FR-M7, NFR-7) ' +
          JSON.stringify({ openedByKeys, focusedLabel, afterDelete })
      );
    }
    {
      for (const p of [...app.getRecentFolders()]) {
        const opened = await openChild('file', 'file:open-recent');
        const row = opened.rows.find((r) => labelOf(r) === p);
        if (row) await clickEl(row.querySelector('.menu-item-secondary'));
      }
      await closeMenu();
      const opened = await openChild('file', 'file:open-recent');
      const labels = opened.rows.map(labelOf);
      const onlyRow = opened.rows[0];
      const emptyShown = opened.rows.length === 1 && visible(onlyRow) && !onlyRow.querySelector('.menu-item-secondary');
      const rootBefore = tree.getRoot() ? tree.getRoot().id : null;
      if (onlyRow) await clickEl(onlyRow);
      const rootAfter = tree.getRoot() ? tree.getRoot().id : null;
      await closeMenu();
      record(
        'V2P4-FR-M7-EMPTY',
        JSON.stringify(labels) === JSON.stringify(['(Empty)']) && emptyShown && rootBefore === rootAfter && app.getRecentFolders().length === 0,
        'With every path removed the list shows only (Empty), which has no remove button and opens nothing (FR-M7) ' + JSON.stringify(labels)
      );
    }

    // ------------------------------------------------------------------------
    // FR-M9 — Icon Theme: VS Code Built-in · VS Code Icons
    // ------------------------------------------------------------------------
    {
      await app.openFolder(dirs[0]);
      await until(() => document.querySelector('#sidebar-content .tree-row .tree-icon'), 2000);
      const iconOf = () => {
        const icon = document.querySelector('#sidebar-content .tree-row .tree-icon');
        return icon ? icon.className + '|' + icon.innerHTML : null;
      };
      let opened = await openChild('view', 'view:icon-theme');
      const labels = opened.rows.map(labelOf);
      const listShown = visible(opened.list) && opened.rows.every(visible);
      const menuText = dropdown() ? dropdown().textContent : '';
      const start = iconOf();
      const pick = async (label) => {
        const o = await openChild('view', 'view:icon-theme');
        const row = o.rows.find((r) => labelOf(r) === label);
        if (row) await clickEl(row);
        await wait(60);
      };
      await pick('VS Code Icons');
      const colored = iconOf();
      opened = await openChild('view', 'view:icon-theme');
      const markedIcons = opened.rows.filter((r) => visible(r.querySelector('.menu-item-check .codicon-check'))).map(labelOf);

      // A12 R3 Major: Delete is the shell's only in Recent Folders (which has a
      // per-row remove). In a theme submenu it must reach the app unprevented.
      let deleteDefaultPrevented = null;
      const iconThemeBefore = app.iconTheme.getTheme();
      const evt = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
      (opened.rows[0] || dropdown()).dispatchEvent(evt);
      deleteDefaultPrevented = evt.defaultPrevented;
      await wait(40);
      const iconThemeUnchangedByDelete = app.iconTheme.getTheme() === iconThemeBefore;
      await closeMenu();
      await pick('VS Code Built-in');
      const back = iconOf();
      record(
        'V2P4-FR-M9',
        JSON.stringify(labels) === JSON.stringify(['VS Code Built-in', 'VS Code Icons']) && listShown && !/Simple/.test(menuText) &&
          Boolean(start) && Boolean(colored) && start !== colored && back === start &&
          JSON.stringify(markedIcons) === JSON.stringify(['VS Code Icons']) &&
          deleteDefaultPrevented === false && iconThemeUnchangedByDelete,
        'Icon Theme lists VS Code Built-in · VS Code Icons and no Simple; choosing each redraws the tree icons, the chosen one is marked, and Delete in this submenu is left to the app (FR-M9, A12 R3) ' +
          JSON.stringify({ labels, changed: start !== colored, restored: back === start, markedIcons, deleteDefaultPrevented })
      );
    }

    // ------------------------------------------------------------------------
    // FR-M5 — a displayed key does what its row does
    // ------------------------------------------------------------------------
    {
      const rootLabel = () => {
        const row = document.querySelector('#sidebar-content .tree-row');
        return row && visible(row) ? row.textContent.trim() : null;
      };
      app.closeFolder();
      await wait(60);
      window.__nextDialogPath = dirs[1];
      await clickTop('file', 'file:open-folder');
      const byMenu = await until(() => tree.getRoot() && tree.getRoot().id === dirs[1], 4000);
      const menuLabel = rootLabel();
      app.closeFolder();
      await wait(60);
      window.__nextDialogPath = dirs[1];
      await press('o', { ctrlKey: true });
      const byKey = await until(() => tree.getRoot() && tree.getRoot().id === dirs[1], 4000);
      const keyLabel = rootLabel();
      window.__nextDialogPath = null;
      record(
        'V2P4-FR-M5-CTRLO',
        byMenu && byKey && Boolean(menuLabel) && menuLabel === keyLabel,
        'Ctrl+O and File > Open Folder... both open the chosen folder as the tree root (FR-M5) ' + JSON.stringify({ menuLabel, keyLabel })
      );
    }
    {
      const shownTabs = () => Array.from(document.querySelectorAll('.dv-tab')).filter(visible).length;
      editor.clear();
      await wait(80);
      const g = editor.getActiveGroup();
      editor.openItem('/v02p4/w-a.txt', 'w-a.txt', { mode: 'pinned' }, g);
      editor.openItem('/v02p4/w-b.txt', 'w-b.txt', { mode: 'pinned' }, g);
      await wait(80);
      await clickTop('file', 'file:close-tab');
      await wait(80);
      const byMenu = editor.getPanels().map((p) => p.params.targetId);
      const tabsByMenu = shownTabs();
      editor.openItem('/v02p4/w-b.txt', 'w-b.txt', { mode: 'pinned' }, g);
      await wait(80);
      await press('w', { ctrlKey: true });
      await wait(80);
      const byKey = editor.getPanels().map((p) => p.params.targetId);
      const tabsByKey = shownTabs();
      record(
        'V2P4-FR-M5-CTRLW',
        JSON.stringify(byMenu) === JSON.stringify(['/v02p4/w-a.txt']) && JSON.stringify(byKey) === JSON.stringify(byMenu) &&
          tabsByMenu === 1 && tabsByKey === 1,
        'Ctrl+W and File > Close Active Tab both close the active tab and leave the same one showing (FR-M5) ' + JSON.stringify({ byMenu, byKey })
      );
    }
    {
      editor.clear();
      await wait(80);
      const dirtyTab = editor.openItem('/v02p4/exit.txt', 'exit.txt', { mode: 'pinned' });
      editor.setTabDirty(dirtyTab.id, true);
      await wait(40);
      let askedByMenu = false;
      let askedByKey = false;
      let stillRunning = false;
      const dialogShown = () => app.confirmDialog.isOpen() && visible(document.querySelector('.workbench-confirm-dialog'));
      const cancel = async () => {
        const btn = document.querySelector('.confirm-dialog-btn[data-choice="cancel"]');
        if (btn) await clickEl(btn);
        await wait(200);
      };
      // Only with unsaved content does an exit stop to ask; without it the
      // host would really close this window and end the run.
      if (editor.hasDirtyPanels()) {
        await clickTop('file', 'file:exit');
        askedByMenu = await until(dialogShown, 4000);
        await cancel();
        await press('F4', { altKey: true });
        askedByKey = await until(dialogShown, 4000);
        await cancel();
        stillRunning = editor.getPanels().some((p) => p.id === dirtyTab.id) && !app.confirmDialog.isOpen();
      }
      editor.setTabDirty(dirtyTab.id, false);
      record(
        'V2P4-FR-M5-ALTF4',
        askedByMenu && askedByKey && stillRunning,
        'Alt+F4 and File > Exit both reach the host close gate, which asks about the unsaved tab, and Cancel keeps the app running (FR-M5) ' +
          JSON.stringify({ askedByMenu, askedByKey, stillRunning })
      );
    }
    {
      const root = byId('workbench-root');
      const titlebar = byId('titlebar');
      await clickTop('view', 'view:zen-mode');
      const menuOn = root.classList.contains('zen-mode') && !visible(titlebar);
      await press('Escape');
      const menuOff = !root.classList.contains('zen-mode') && visible(titlebar);
      await press('F11');
      const keyOn = root.classList.contains('zen-mode') && !visible(titlebar);
      await press('Escape');
      const keyOff = !root.classList.contains('zen-mode') && visible(titlebar);
      record(
        'V2P4-FR-M5-F11',
        menuOn && menuOff && keyOn && keyOff,
        'F11 and View > Zen Mode both enter Zen and hide the title bar (FR-M5) ' + JSON.stringify({ menuOn, menuOff, keyOn, keyOff })
      );
    }
    {
      const sidebar = byId('sidebar');
      const startShown = visible(sidebar);
      await clickTop('view', 'view:toggle-sidebar');
      const menuHidden = !visible(sidebar);
      await clickTop('view', 'view:toggle-sidebar');
      const menuBack = visible(sidebar);
      await press('b', { ctrlKey: true });
      const keyHidden = !visible(sidebar);
      await press('b', { ctrlKey: true });
      const keyBack = visible(sidebar);
      record(
        'V2P4-FR-M5-CTRLB',
        startShown && menuHidden && menuBack && keyHidden && keyBack,
        'Ctrl+B and View > Show Sidebar both hide and then show the explorer (FR-M5) ' + JSON.stringify({ menuHidden, menuBack, keyHidden, keyBack })
      );
    }
    {
      // A12 Critical: a reserved key must reach the shell even when a focused
      // tab view stops the event from propagating. Build exactly that — a real
      // focused element inside a group whose own keydown listener calls
      // stopPropagation — and press the advertised keys from it.
      editor.clear();
      await wait(80);
      editor.openItem('/v02p4/capture.txt', 'capture.txt', { mode: 'pinned' });
      await wait(80);
      const host = editor.getActiveGroup().element.querySelector('.dv-content-container') || editor.getActiveGroup().element;
      host.setAttribute('tabindex', '-1');
      host.focus();
      const swallow = (e) => e.stopPropagation();
      host.addEventListener('keydown', swallow);
      const fire = (key, mods) => {
        host.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {})));
      };
      const sidebar = byId('sidebar');
      if (!visible(sidebar)) { await press('b', { ctrlKey: true }); }
      const sidebarWas = visible(sidebar);
      fire('b', { ctrlKey: true });
      await wait(80);
      const ctrlBReached = visible(sidebar) !== sidebarWas;
      fire('b', { ctrlKey: true });
      await wait(80);
      fire('F11');
      await wait(80);
      const f11Reached = byId('workbench-root').classList.contains('zen-mode');
      fire('Escape');
      await wait(80);
      fire('F10');
      await wait(80);
      const f10Reached = Boolean(byId('workbench-menu-dropdown'));
      fire('Escape');
      await wait(60);
      host.removeEventListener('keydown', swallow);

      // A12 R3 Major: a displayed shortcut pressed while the hamburger menu is
      // open must land on the same screen state as clicking its row — which
      // closes the menu. And a Meta-modified key is the app's, not the shell's.
      await press('F10');
      const menuOpenBeforeShortcut = Boolean(byId('workbench-menu-dropdown'));
      await press('b', { ctrlKey: true });
      await wait(80);
      const menuClosedByShortcut = !byId('workbench-menu-dropdown');
      await press('b', { ctrlKey: true }); // restore sidebar
      const rootEl = byId('workbench-root');
      const zenBefore = rootEl.classList.contains('zen-mode');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', metaKey: true, bubbles: true, cancelable: true }));
      await wait(60);
      const metaF11Ignored = rootEl.classList.contains('zen-mode') === zenBefore;

      record(
        'V2P4-CAPTURE-KEYS',
        ctrlBReached && f11Reached && f10Reached && menuOpenBeforeShortcut && menuClosedByShortcut && metaF11Ignored,
        'Ctrl+B/F11/F10 beat a stopPropagation tab view; a shortcut pressed with the menu open closes it; Meta+F11 is left to the app (A12 Critical + R3, reserved-keys.md §1) ' +
          JSON.stringify({ ctrlBReached, f11Reached, f10Reached, menuClosedByShortcut, metaF11Ignored })
      );
      if (rootEl.classList.contains('zen-mode')) { await press('Escape'); }
    }

    // ------------------------------------------------------------------------
    // FR-M10 — three close commands, three scopes
    // ------------------------------------------------------------------------
    const shownTabs = () => Array.from(document.querySelectorAll('.dv-tab')).filter(visible).length;
    const shownGroups = () => Array.from(document.querySelectorAll('.dv-groupview')).filter(visible).length;
    const openTargets = () => editor.getPanels().map((p) => p.params.targetId).sort();

    /** Three tabs in two groups, the active one being b in the left group: [a, b] | [c]. */
    async function threeTabsInTwoGroups() {
      editor.clear();
      await wait(100);
      const left = editor.getActiveGroup();
      editor.openItem('/v02p4/m10-a.txt', 'm10-a.txt', { mode: 'pinned' }, left);
      await wait(40);
      await clickEl(left.element.querySelector('.tab-action-split-right'));
      const right = editor.getGroups().find((g) => g !== left);
      if (right) editor.openItem('/v02p4/m10-c.txt', 'm10-c.txt', { mode: 'pinned' }, right);
      editor.openItem('/v02p4/m10-b.txt', 'm10-b.txt', { mode: 'pinned' }, left);
      await wait(120);
      return shownTabs() === 3 && shownGroups() === 2 && editor.getActivePanel().params.targetId === '/v02p4/m10-b.txt';
    }
    {
      const ready = await threeTabsInTwoGroups();
      await clickTop('file', 'file:close-tab');
      await wait(150);
      record(
        'V2P4-FR-M10-TAB',
        ready && shownTabs() === 2 && shownGroups() === 2 &&
          JSON.stringify(openTargets()) === JSON.stringify(['/v02p4/m10-a.txt', '/v02p4/m10-c.txt']),
        'Close Active Tab closes only the active tab: 3 tabs in 2 groups become 2 tabs in 2 groups (FR-M10) ' + JSON.stringify(openTargets())
      );
    }
    {
      const ready = await threeTabsInTwoGroups();
      await clickTop('file', 'file:close-editor-group');
      await wait(150);
      record(
        'V2P4-FR-M10-GROUP',
        ready && shownTabs() === 1 && shownGroups() === 1 && JSON.stringify(openTargets()) === JSON.stringify(['/v02p4/m10-c.txt']),
        'Close Editor Group closes the active tab\'s whole group: 3 tabs in 2 groups become 1 tab in 1 group (FR-M10) ' + JSON.stringify(openTargets())
      );
    }
    {
      const ready = await threeTabsInTwoGroups();
      await clickTop('file', 'file:close-all-tabs');
      await wait(150);
      record(
        'V2P4-FR-M10-ALL',
        ready && shownTabs() === 0 && shownGroups() === 1 && editor.getPanelCount() === 0,
        'Close All Tabs closes every open tab: 3 tabs in 2 groups become 0 tabs, leaving one empty group on screen (FR-M10, v0.1 FR-J7)'
      );
    }
    {
      // A12 Major + R2 Critical: a bulk close must not half-empty the workspace
      // and must not leave an earlier tab falsely clean. Group of clean a,
      // dirty b, dirty c. Close Editor Group, Discard b, then Cancel c.
      editor.clear();
      await wait(100);
      const g = editor.getActiveGroup();
      editor.openItem('/v02p4/bulk-a.txt', 'bulk-a.txt', { mode: 'pinned' }, g);
      const tb = editor.openItem('/v02p4/bulk-b.txt', 'bulk-b.txt', { mode: 'pinned' }, g);
      const tc = editor.openItem('/v02p4/bulk-c.txt', 'bulk-c.txt', { mode: 'pinned' }, g);
      editor.setTabDirty(tb.id, true);
      editor.setTabDirty(tc.id, true);
      await wait(60);
      const targetsBefore = openTargets();

      async function answer(choice) {
        const btn = document.querySelector('.confirm-dialog-btn[data-choice="' + choice + '"]');
        if (btn) await clickEl(btn);
        await wait(120);
      }

      clickTop('file', 'file:close-editor-group');
      const asked1 = await until(() => app.confirmDialog.isOpen() && visible(document.querySelector('.workbench-confirm-dialog')), 3000);
      await answer('discard'); // b
      const asked2 = await until(() => app.confirmDialog.isOpen(), 3000);
      await answer('cancel'); // c
      await wait(150);
      const nothingClosed = JSON.stringify(openTargets()) === JSON.stringify(targetsBefore) && !app.confirmDialog.isOpen();

      // R2 Critical: b was discarded but the op was then cancelled — b must NOT
      // be left falsely clean. Closing b on its own still asks.
      const bPanel = editor.getApi().getPanel(tb.id);
      const bStillDirty = Boolean(bPanel && bPanel.params && bPanel.params.isDirty);
      if (bPanel) void editor.closePanel(bPanel);
      const bClosePrompts = await until(() => app.confirmDialog.isOpen(), 2000);
      if (app.confirmDialog.isOpen()) await answer('cancel');

      // Finally a clean run: discard both, group closes.
      clickTop('file', 'file:close-editor-group');
      await until(() => app.confirmDialog.isOpen(), 3000);
      let guard = 0;
      while (app.confirmDialog.isOpen() && guard++ < 5) {
        await answer('discard');
      }
      await wait(150);
      const clearedAfterDiscard = editor.getPanelCount() === 0;

      record(
        'V2P4-FR-M10-CANCEL',
        asked1 && asked2 && nothingClosed && bStillDirty && bClosePrompts && clearedAfterDiscard,
        'Close Editor Group confirms every dirty tab up front; Discard-then-Cancel closes nothing and leaves the discarded tab still dirty (asks again on its own close); a later all-discard run closes the group (A12 Major + R2 Critical, FR-M10) ' +
          JSON.stringify({ asked1, asked2, nothingClosed, bStillDirty, bClosePrompts, clearedAfterDiscard })
      );
    }
    {
      const actionLabels = Array.from(document.querySelectorAll('#activity-bar .activity-bar-item'))
        .filter(visible)
        .map((el) => (el.dataset.itemId || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || ''));
      const headerLabels = Array.from(document.querySelectorAll('.editor-action-btn'))
        .filter(visible)
        .map((el) => (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || ''));

      // The right-click menu, switched on by an app with one item of its own.
      const surface = window.__workbenchAppSurface;
      editor.openItem('/v02p4/ctx.txt', 'ctx.txt', { mode: 'pinned' });
      await wait(80);
      surface.setPanelContextMenuItemsProvider(() => [{ id: 'app:ctx', label: 'App Item', action: () => {} }]);
      surface.setContextMenuEnabled(true);
      const tab = document.querySelector('.dv-tab');
      if (tab) tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
      await wait(60);
      const contextRows = Array.from(document.querySelectorAll('.workbench-context-menu .context-menu-item-row')).map((el) => el.textContent.trim());
      await press('Escape');
      surface.setContextMenuEnabled(false);
      surface.setPanelContextMenuItemsProvider(() => []);
      record(
        'V2P4-FR-M10-ELSEWHERE',
        actionLabels.length > 0 && actionLabels.every((l) => !/close/i.test(l)) &&
          headerLabels.every((l) => !/close.*(group|all)/i.test(l)) &&
          JSON.stringify(contextRows) === JSON.stringify(['App Item']),
        'The Activity Bar and the group header carry 0 close-group commands, and the right-click menu shows only the app\'s item (FR-M10) ' +
          JSON.stringify({ actionLabels, contextRows })
      );
    }

    // ------------------------------------------------------------------------
    // FR-P11 · FR-P12 — a split group starts with its Untitled preview spot
    // ------------------------------------------------------------------------
    function describeGroup(group) {
      if (!group) return null;
      const tabs = Array.from(group.element.querySelectorAll('.dv-tab'));
      const content = tabs[0] ? tabs[0].querySelector('.dv-default-tab-content') : null;
      return {
        panels: group.panels.length,
        shownTabs: tabs.filter(visible).length,
        title: content ? content.textContent.trim() : null,
        previewMark: Boolean(tabs[0] && tabs[0].classList.contains('workbench-preview-tab')),
        slant: content ? getComputedStyle(content).fontStyle : null,
      };
    }
    editor.clear();
    await wait(100);
    const origin = editor.getActiveGroup();
    editor.openItem('/v02p4/p11.txt', 'p11.txt', { mode: 'pinned' }, origin);
    await wait(80);
    const confirmedSlant = getComputedStyle(origin.element.querySelector('.dv-tab .dv-default-tab-content')).fontStyle;
    let rightGroup;
    let belowGroup;
    {
      await clickEl(origin.element.querySelector('.tab-action-split-right'));
      await wait(80);
      rightGroup = editor.getGroups().find((g) => g !== origin);
      const d = describeGroup(rightGroup);
      const isRight = rightGroup && rightGroup.element.getBoundingClientRect().left > origin.element.getBoundingClientRect().left;
      record(
        'V2P4-FR-P11-RIGHT',
        Boolean(d) && isRight && d.panels === 1 && d.shownTabs === 1 && d.title === 'Untitled' && d.previewMark && d.slant !== confirmedSlant,
        'Splitting right from the header makes a group to the right holding one Untitled tab shown as preview (FR-P11) ' +
          JSON.stringify(Object.assign({ confirmedSlant }, d))
      );
    }
    {
      const before = new Set(editor.getGroups());
      await clickTop('file', 'file:split-down');
      await wait(80);
      belowGroup = editor.getGroups().find((g) => !before.has(g));
      const d = describeGroup(belowGroup);
      const isBelow =
        belowGroup && rightGroup && belowGroup.element.getBoundingClientRect().top > rightGroup.element.getBoundingClientRect().top;
      record(
        'V2P4-FR-P11-DOWN',
        Boolean(d) && isBelow && d.panels === 1 && d.shownTabs === 1 && d.title === 'Untitled' && d.previewMark && d.slant !== confirmedSlant,
        'File > Split Down makes a group below holding one Untitled tab shown as preview (FR-P11) ' + JSON.stringify(d)
      );
    }
    {
      const closeTabOf = async (group) => {
        const button = group && group.element.querySelector('.dv-tab .dv-default-tab-action');
        if (!button) return;
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await wait(120);
      };
      const groupsBefore = shownGroups();
      await closeTabOf(belowGroup);
      const afterFirst = shownGroups();
      const belowGone = !document.body.contains(belowGroup.element);
      await closeTabOf(rightGroup);
      const afterSecond = shownGroups();
      record(
        'V2P4-FR-P12',
        groupsBefore === 3 && afterFirst === 2 && belowGone && afterSecond === 1 && editor.getPanelCount() === 1,
        'Closing a split group\'s Untitled tab, with nothing else added, closes that group too (FR-P12) ' +
          JSON.stringify({ groupsBefore, afterFirst, afterSecond })
      );
    }

    const allPassed = results.every((r) => r.pass);
    return { success: allPassed, results };
  } catch (err) {
    record('GLOBAL_EXCEPTION', false, 'Uncaught error in v0.2 Phase 4 suite: ' + (err && err.stack ? err.stack : err));
    return { success: false, results };
  }
};
