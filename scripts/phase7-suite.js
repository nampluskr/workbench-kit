/**
 * Host-neutral Phase 7 Acceptance Test Suite for workbench-kit.
 *
 * Closes gaps the 133-item cross-reference (WK-041) found: several FR rows
 * (screen skeleton, folding/Zen, theme cycling, icon-theme cycling, Help >
 * info) had only static/source-grep coverage in earlier phases, never a
 * genuine simulated user action in a running host. This suite adds that.
 *
 * Can be executed in any browser environment (Electron, pywebview/WebView2).
 * Returns a structured array of assertion results:
 *   { success: boolean, results: [{ id: string, pass: boolean, msg: string }] }
 */
window.__runPhase7TestSuite = async function runPhase7TestSuite() {
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

    const tree = app.tree;
    const menu = app.menu;
    const activityBar = app.activityBar;
    const viewState = app.viewState;
    const theme = app.theme;
    const iconTheme = app.iconTheme;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function clickEl(el) {
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }

    function clickMenuRow(categoryId, itemId) {
      const hamburger = document.getElementById('menu-hamburger-btn');
      if (!document.getElementById('workbench-menu-dropdown')) {
        clickEl(hamburger);
      }
      const catRow = document.querySelector(`.menu-category-row[data-category-id="${categoryId}"]`);
      if (catRow) clickEl(catRow);
      const itemRow = document.querySelector(`.menu-item-row[data-item-id="${itemId}"]`);
      if (!itemRow) throw new Error(`Menu row for ${itemId} not found in DOM`);
      clickEl(itemRow);
    }

    function openMenuCategory(categoryId) {
      const hamburger = document.getElementById('menu-hamburger-btn');
      if (!document.getElementById('workbench-menu-dropdown')) {
        clickEl(hamburger);
      }
      const catRow = document.querySelector(`.menu-category-row[data-category-id="${categoryId}"]`);
      if (catRow) clickEl(catRow);
      // Every group's rows exist in the DOM simultaneously (only the active
      // group's .menu-submenu is shown via CSS), so the listing must be
      // scoped to this category's own submenu, not a global query.
      // Direct children only: since v0.2 a row can hold its own submenu
      // (Recent Folders, Color Theme, Icon Theme), whose rows are not items of
      // this category.
      const rows = Array.from(document.querySelectorAll(`.menu-submenu[data-parent-group="${categoryId}"] > .menu-item-row`));
      // Round-1 adversarial finding (Major): comparing only dataset.itemId
      // strings could pass even if the rendered label text were wrong (e.g.
      // "정보" replaced by an empty string) — return the visible label text
      // alongside each id so callers can check both.
      return rows.map((el) => ({
        id: el.dataset.itemId,
        label: (el.querySelector('.menu-item-label')?.textContent || '').trim(),
      }));
    }

    function closeMenuIfOpen() {
      const dropdown = document.getElementById('workbench-menu-dropdown');
      if (dropdown) clickEl(document.getElementById('menu-hamburger-btn'));
    }

    function dispatchTreeKey(key, opts) {
      const target = document.querySelector('.tree-list') || document.getElementById('sidebar-content') || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, opts || {})));
    }

    // ------------------------------------------------------------------------
    // 1. Screen skeleton (FR-N1, FR-N5 ~ FR-N9)
    // ------------------------------------------------------------------------
    const titlebar = document.getElementById('titlebar');
    const hamburgerBtn = document.getElementById('menu-hamburger-btn');
    const windowTitle = document.getElementById('window-title');
    const winMin = document.getElementById('window-min-btn');
    const winMax = document.getElementById('window-max-btn');
    const winClose = document.getElementById('window-close-btn');
    const titlebarLeft = document.querySelector('.titlebar-left');
    const titlebarRight = document.querySelector('.titlebar-right');
    record(
      'P7-FR-N1',
      Boolean(titlebar && hamburgerBtn && windowTitle && winMin && winMax && winClose) &&
        Boolean(titlebarLeft && titlebarLeft.contains(hamburgerBtn)) &&
        // v0.1 FR-N1 is replaced (SPEC 0.1): the centred title became the
        // program information line, left-aligned after the hamburger (FR-C7).
        titlebarLeft.contains(windowTitle) &&
        windowTitle.classList.contains('titlebar-program-info') &&
        Boolean(titlebarRight && titlebarRight.contains(winMin) && titlebarRight.contains(winMax) && titlebarRight.contains(winClose)),
      'Title bar has the hamburger and the program information in its left zone and all 3 window buttons in its right zone (v0.1 FR-N1 → v0.2 FR-C1 · FR-C7)'
    );

    // Structural proof of native drag-move support (FR-N2): the titlebar's
    // own computed style opts the OS into treating it as a drag handle.
    // Real OS-level drag itself cannot be synthesized (same class of
    // limitation Phase 4/A4 already accepted for real drag-and-drop).
    const titlebarDragRegion = getComputedStyle(titlebar).getPropertyValue('-webkit-app-region').trim();
    record(
      'P7-FR-N2-STRUCTURAL',
      titlebarDragRegion === 'drag',
      "Title bar's computed -webkit-app-region is 'drag', the OS-level mechanism that makes empty title bar area move the window (FR-N2; real OS drag itself is not synthesizable, same accepted limitation as A4's real drag-and-drop)"
    );
    // FR-N3 (resizing by dragging a window edge) has 0 workbench-kit-owned
    // JS event path to intercept — it is entirely native OS chrome resize,
    // gated only by the host's `resizable` window-creation flag. That flag
    // is verified from the host source directly in verify-phase7.mjs
    // (Node-side, not here) rather than recorded as a bare `true` in this
    // suite — a hardcoded pass here would stay green even if resizing were
    // fully broken (round-1 adversarial finding, Critical).

    menu.closeMenu();
    record(
      'P7-FR-N5',
      document.querySelectorAll('.workbench-menu-bar, .menu-bar-row').length === 0,
      'There is no permanently-visible horizontal menu bar row anywhere in the DOM before the hamburger is even clicked (FR-N5)'
    );

    const fileRows = openMenuCategory('file');
    const categoryLabels = Array.from(document.querySelectorAll('.menu-category-row .menu-category-label')).map((el) => el.textContent.trim());
    record(
      'P7-FR-N5-GROUPS',
      JSON.stringify(categoryLabels) === JSON.stringify(['File', 'View', 'Help']),
      // Round-2 finding: a raw element count doesn't prove WHICH 3 groups
      // they are — check the actual visible labels.
      `Opening the hamburger reveals exactly the 3 top-level groups with correct labels, in order: ${JSON.stringify(categoryLabels)} (FR-N5)`
    );
    // v0.1 FR-N6 is replaced by v0.2 FR-M1 (SPEC 0.1): the shell's File list
    // is now eight items. The ID is kept so the v0.1 matrix still resolves.
    // App items below a separator are v0.1 FR-I9's, proven in the Phase 5
    // suite through the app surface; this build adds none, so the rendered
    // list must be exactly the eight, with their visible labels.
    const shellFileExpected = [
      { id: 'file:open-folder', label: 'Open Folder...' },
      { id: 'file:open-recent', label: 'Recent Folders' },
      { id: 'file:split-right', label: 'Split Right' },
      { id: 'file:split-down', label: 'Split Down' },
      { id: 'file:close-tab', label: 'Close Active Tab' },
      { id: 'file:close-editor-group', label: 'Close Editor Group' },
      { id: 'file:close-all-tabs', label: 'Close All Tabs' },
      { id: 'file:exit', label: 'Exit' },
    ];
    record(
      'P7-FR-N6',
      JSON.stringify(fileRows) === JSON.stringify(shellFileExpected),
      `File menu renders exactly the 8 shell items with their visible labels, in order (v0.1 FR-N6 → v0.2 FR-M1): ${JSON.stringify(fileRows.map((r) => r.label))}`
    );
    closeMenuIfOpen();

    const viewRows = openMenuCategory('view');
    // v0.1 FR-N7 is replaced by v0.2 FR-M2 (SPEC 0.1).
    const viewExpected = [
      { id: 'view:color-theme', label: 'Color Theme' },
      { id: 'view:icon-theme', label: 'Icon Theme' },
      { id: 'view:zen-mode', label: 'Zen Mode' },
      { id: 'view:toggle-sidebar', label: 'Show Sidebar' },
      { id: 'view:toggle-titlebar', label: 'Show Title Bar' },
      { id: 'view:toggle-statusbar', label: 'Show Status Bar' },
      { id: 'view:preset-info', label: 'Preset Info' },
    ];
    record(
      'P7-FR-N7',
      JSON.stringify(viewRows) === JSON.stringify(viewExpected),
      `View menu has exactly the 7 shell items with their visible labels, in order (v0.1 FR-N7 → v0.2 FR-M2): ${JSON.stringify(viewRows.map((r) => r.label))}`
    );
    // v0.1's "우클릭 메뉴 사용" switch is gone from View (SPEC 0.1, v0.1 FR-G6 → v0.2
    // FR-M2). What stays is the right-click device being off by default (D-22).
    record(
      'P7-FR-N7-CHECKBOX-OFF',
      !viewRows.some((r) => r.id === 'view:toggle-context-menu') && app.contextMenu.isEnabled() === false,
      'View has 0 right-click switches, and the right-click menu starts disabled (D-22; v0.1 FR-N7 switch → v0.2 FR-M2)'
    );
    closeMenuIfOpen();

    const helpRows = openMenuCategory('help');
    record(
      'P7-FR-N8',
      JSON.stringify(helpRows) === JSON.stringify([{ id: 'help:about', label: 'About' }]),
      'Help menu has exactly 1 item with the correct visible label: About (v0.1 FR-N8 → v0.2 FR-M3)'
    );
    closeMenuIfOpen();

    const statusbarPath = document.getElementById('statusbar-path');
    const statusbarAppInfo = document.getElementById('statusbar-app-info');
    const isElectronHost = Boolean(window.workbenchHost);
    const isPywebviewHost = Boolean(window.pywebview);
    // Round-2 finding: any well-formed semver satisfied the old regex,
    // independent of the actually-running package version (main.ts's
    // displayed version is a hardcoded string, not read from package.json).
    // The runner injects the real package.json version so a future drift
    // between the two is actually caught.
    const expectedVersion = window.__expectedVersion;
    // v0.1 FR-N9 is replaced (SPEC 0.1): the app-info slot left the status
    // bar (FR-C10) and the same information now reads in the title bar
    // (FR-C7). The version is still checked against the real package.json.
    const programInfo = document.getElementById('window-title');
    const programText = programInfo ? programInfo.textContent : '';
    const majorMinor = expectedVersion ? expectedVersion.split('.').slice(0, 2).join('.') : null;
    record(
      'P7-FR-N9',
      Boolean(statusbarPath) &&
        statusbarAppInfo === null &&
        Boolean(majorMinor) &&
        programText.startsWith(`Workbench-Kit v${majorMinor}`) &&
        (isElectronHost ? programText.endsWith(' - Electron') : true) &&
        (isPywebviewHost ? programText.endsWith(' - PyWebView') : true),
      `Status bar keeps its path slot with no app-info slot, and the title bar's program information shows "Workbench-Kit v${majorMinor}" from the real package.json plus the running host branch (found: "${programText}") (v0.1 FR-N9 → v0.2 FR-C7 · FR-C10)`
    );

    // ------------------------------------------------------------------------
    // 2. Window buttons (FR-N4). Close is exercised elsewhere (Phase 6
    //    P6-FR-L6) since clicking it for real would end this host process.
    //    Clicking here dispatches the real click through the real
    //    workbenchHost/pywebview.api bridge, which is genuine (not a no-op
    //    stub) — but this renderer-side check alone cannot observe whether
    //    the OS window actually minimized/maximized (round-1 finding,
    //    Critical). scripts/phase7-electron-runner.cjs supplements this
    //    with a real BrowserWindow.isMinimized()/isMaximized() check from
    //    the Node side, which the sandboxed renderer cannot do itself.
    //    pywebview has no equivalent easy introspection, so it stays at
    //    this click-dispatches level (documented asymmetry).
    // ------------------------------------------------------------------------
    let minimizeClickError = null;
    try {
      clickEl(winMin);
    } catch (e) {
      minimizeClickError = e;
    }
    record('P7-FR-N4-MINIMIZE-CLICK', minimizeClickError === null, 'Clicking the minimize button dispatches through the real host bridge without error (FR-N4) — see the Electron runner for real OS-state confirmation');
    await wait(50);
    let maximizeClickError = null;
    try {
      clickEl(winMax);
      clickEl(winMax); // toggle back so later window-relative assertions are unaffected
    } catch (e) {
      maximizeClickError = e;
    }
    record('P7-FR-N4-MAXIMIZE-CLICK', maximizeClickError === null, 'Clicking the maximize button dispatches through the real host bridge without error and toggles back on a 2nd click (FR-N4) — see the Electron runner for real OS-state confirmation');

    // ------------------------------------------------------------------------
    // 3. Folding & Zen mode (FR-F1 ~ FR-F7)
    // ------------------------------------------------------------------------
    if (!viewState.getState().sidebarVisible) clickMenuRow('view', 'view:toggle-sidebar');
    if (!viewState.getState().titlebarVisible) clickMenuRow('view', 'view:toggle-titlebar');
    if (!viewState.getState().statusbarVisible) clickMenuRow('view', 'view:toggle-statusbar');

    const mainAreaWidthBeforeF1 = document.getElementById('main-area').getBoundingClientRect().width;
    clickMenuRow('view', 'view:toggle-sidebar');
    await wait(20);
    const mainAreaWidthAfterF1 = document.getElementById('main-area').getBoundingClientRect().width;
    record(
      'P7-FR-F1',
      getComputedStyle(document.getElementById('sidebar')).display === 'none' &&
        getComputedStyle(document.getElementById('activity-bar')).display !== 'none' &&
        mainAreaWidthAfterF1 > mainAreaWidthBeforeF1,
      // Round-1 adversarial finding (Minor): checking only the .hidden class
      // (not computed visibility) and never checking the required editor
      // area width increase both left room for a CSS regression to pass.
      `Toggling the sidebar computes to display:none, the activity bar stays visible, and the tab/editor area's real rendered width actually increases (${mainAreaWidthBeforeF1} -> ${mainAreaWidthAfterF1}) (FR-F1)`
    );
    clickMenuRow('view', 'view:toggle-sidebar');
    await wait(20);

    const actTitlebarBtn = document.querySelector('.activity-bar-item[data-item-id="activity:toggle-titlebar"]');
    clickEl(actTitlebarBtn);
    await wait(20);
    const titlebarHiddenOk = getComputedStyle(document.getElementById('titlebar')).display === 'none';
    clickEl(actTitlebarBtn);
    await wait(20);
    // Round-2 finding: also click a 2nd time and prove it actually restores
    // — the round-1 version only ever checked the hidden state.
    record(
      'P7-FR-F2',
      titlebarHiddenOk && getComputedStyle(document.getElementById('titlebar')).display !== 'none',
      'Toggling the titlebar computes to display:none; a 2nd toggle restores it to visible (FR-F2)'
    );

    const actStatusbarBtn = document.querySelector('.activity-bar-item[data-item-id="activity:toggle-statusbar"]');
    clickEl(actStatusbarBtn);
    await wait(20);
    const statusbarHiddenOk = getComputedStyle(document.getElementById('statusbar')).display === 'none';

    record(
      'P7-FR-F4',
      getComputedStyle(document.getElementById('titlebar')).display !== 'none' && getComputedStyle(document.getElementById('statusbar')).display === 'none',
      'Hiding the statusbar alone leaves the titlebar visible and unaffected (FR-F4, direction 1 of 2)'
    );
    // Round-2 finding: also check the reverse direction (hide titlebar only,
    // statusbar unaffected) — the round-1 version only tested one direction.
    clickEl(actStatusbarBtn);
    await wait(20);
    clickEl(actTitlebarBtn);
    await wait(20);
    record(
      'P7-FR-F4-REVERSE',
      getComputedStyle(document.getElementById('titlebar')).display === 'none' && getComputedStyle(document.getElementById('statusbar')).display !== 'none',
      'Hiding the titlebar alone leaves the statusbar visible and unaffected (FR-F4, direction 2 of 2)'
    );
    clickEl(actTitlebarBtn);
    await wait(20);
    record(
      'P7-FR-F3',
      statusbarHiddenOk && getComputedStyle(document.getElementById('statusbar')).display !== 'none',
      'Toggling the statusbar computes to display:none; state is restored to visible by the end of this check (FR-F3)'
    );

    record(
      'P7-FR-F7',
      document.querySelectorAll('.activity-bar-item[data-item-id*="hide"]').length === 0 &&
        !Array.from(document.querySelectorAll('.menu-item-row')).some((el) => el.textContent.includes('세로 띠 감추기')),
      'No means exists to hide the activity bar itself, in the activity bar or View menu (FR-F7)'
    );

    // Real F11 → Zen mode, real Escape → exit (dispatched on window, matching
    // ViewStateManager's actual listener target).
    const sizeBeforeZen = [window.outerWidth, window.outerHeight];
    const editorAreaVisibleBeforeZen = getComputedStyle(document.getElementById('main-area')).display !== 'none';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true, cancelable: true }));
    await wait(30);
    const zenActive = document.getElementById('workbench-root').classList.contains('zen-mode');
    const chromeHiddenInZen = ['titlebar', 'activity-bar', 'sidebar', 'statusbar'].every((id) => {
      const el = document.getElementById(id);
      return el && getComputedStyle(el).display === 'none';
    });
    const editorAreaVisibleInZen = getComputedStyle(document.getElementById('main-area')).display !== 'none';
    const sizeDuringZen = [window.outerWidth, window.outerHeight];
    // window.outerWidth/outerHeight was observed to report unstable,
    // unrelated-to-the-actual-window values in pywebview's WebView2
    // embedding (e.g. jumping to exactly the configured 1280x800 only once
    // Zen's chrome is hidden, suggesting it isn't reading true OS outer
    // bounds there) — so the strict before/after size-equality check is
    // Electron-only; pywebview still gets the chrome/editor-visibility
    // checks, just not this specific measurement.
    const sizeCheckOk = isPywebviewHost || (sizeDuringZen[0] === sizeBeforeZen[0] && sizeDuringZen[1] === sizeBeforeZen[1]);
    record(
      'P7-FR-F5',
      zenActive && chromeHiddenInZen && editorAreaVisibleInZen && sizeCheckOk,
      `F11 enters Zen mode: titlebar, activity bar, sidebar, and statusbar all compute to display:none, the tab/editor area (#main-area) stays visible, and the window's outer size is unchanged (${sizeBeforeZen} -> ${sizeDuringZen}; size equality only asserted on Electron — pywebview's WebView2 outerWidth/outerHeight was found unreliable) (FR-F5)`
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(30);
    const chromeRestoredAfterEscape = ['titlebar', 'activity-bar', 'sidebar', 'statusbar'].every((id) => {
      const el = document.getElementById(id);
      return el && getComputedStyle(el).display !== 'none';
    });
    record(
      'P7-FR-F6',
      !document.getElementById('workbench-root').classList.contains('zen-mode') && chromeRestoredAfterEscape,
      'Escape exits Zen mode and restores ALL 4 previously-hidden chrome pieces (titlebar, activity bar, sidebar, statusbar), not just the titlebar (FR-F6)'
    );

    // ------------------------------------------------------------------------
    // 4. Theme cycling (FR-M1, FR-M4)
    // ------------------------------------------------------------------------
    // v0.1 FR-M1's View menu path became a choice of three in v0.2 (SPEC 0.1,
    // FR-M8): the same themes, in the same order, each picked from the list.
    theme.setTheme('light');
    await wait(10);
    clickMenuRow('view', 'view:color-theme');
    clickMenuRow('view', 'view:color-theme:gray');
    const afterFirstCycle = document.documentElement.dataset.theme;
    clickMenuRow('view', 'view:color-theme');
    clickMenuRow('view', 'view:color-theme:dark');
    const afterSecondCycle = document.documentElement.dataset.theme;
    clickMenuRow('view', 'view:color-theme');
    clickMenuRow('view', 'view:color-theme:light');
    const afterThirdCycle = document.documentElement.dataset.theme;
    record(
      'P7-FR-M1-MENU',
      afterFirstCycle === 'gray' && afterSecondCycle === 'dark' && afterThirdCycle === 'light',
      'Choosing Gray, Dark, White from View > Color Theme applies white -> gray -> dark -> white via document.documentElement.dataset.theme (v0.1 FR-M1 menu path → v0.2 FR-M8)'
    );

    // v0.1 FR-M1's second path moved (SPEC 0.1): from the bottom of the
    // Activity Bar to the title bar (FR-C3, D-3). The ID is kept for the v0.1
    // matrix; the cycle it must produce is unchanged.
    const titlebarThemeBtn = document.getElementById('titlebar-theme-btn');
    clickEl(titlebarThemeBtn);
    record(
      'P7-FR-M1-ACTBAR',
      Boolean(titlebarThemeBtn) && document.documentElement.dataset.theme === 'gray',
      'Clicking the title bar theme button cycles the theme the same way as the View menu item (v0.1 FR-M1 Activity Bar path → v0.2 FR-C3)'
    );
    theme.setTheme('dark');

    // Round-1 adversarial finding (Minor): checking "some codicon exists"
    // doesn't prove the SAME glyph survives a theme change unmodified — pick
    // one real, persistent icon and track its glyph class + computed color
    // across all 3 themes.
    const m4Icon = document.querySelector('.activity-bar-item[data-item-id="activity:toggle-sidebar"] i');
    const m4Glyphs = [];
    const m4Colors = [];
    for (const t of ['light', 'gray', 'dark']) {
      theme.setTheme(t);
      await wait(10);
      const iconNow = document.querySelector('.activity-bar-item[data-item-id="activity:toggle-sidebar"] i');
      m4Glyphs.push(iconNow ? Array.from(iconNow.classList).filter((c) => c.startsWith('codicon-')).join(' ') : null);
      m4Colors.push(iconNow ? getComputedStyle(iconNow).color : null);
    }
    theme.setTheme('dark');
    record(
      'P7-FR-M4',
      Boolean(m4Icon) &&
        m4Glyphs.every((g) => g === m4Glyphs[0] && g) &&
        new Set(m4Colors).size >= 2,
      `The same codicon glyph class (${m4Glyphs[0]}) renders in all 3 themes while its computed color actually differs between at least 2 of them (colors: ${JSON.stringify(m4Colors)}) (FR-M4)`
    );

    // ------------------------------------------------------------------------
    // 4b. FR-A1: open P, then open Q through the REAL File > 폴더 열기 menu
    //    path, and prove P disappears. Round-2 adversarial finding
    //    (Critical): this used to only call app.openFolder() directly. The
    //    real click -> handleOpenFolderDialog() -> promptOpenFolderDialog()
    //    -> host bridge -> IPC chain is entirely real production code; only
    //    the native OS picker's own return value is stubbed (the runner
    //    reads window.__nextDialogPath), the same technique already used
    //    for Phase 6's real cross-process relaunch check.
    // ------------------------------------------------------------------------
    const testDir = window.__testTmpDir;
    const testDir2 = window.__testTmpDir2;
    if (testDir && testDir2) {
      await app.openFolder(testDir); // sets up P
      await wait(60);
      const rootBeforeA1 = tree.getRoot();
      window.__nextDialogPath = testDir2;
      clickMenuRow('file', 'file:open-folder');
      await wait(150);
      delete window.__nextDialogPath;
      const rootAfterA1 = tree.getRoot();
      record(
        'P7-FR-A1',
        Boolean(rootBeforeA1) &&
          rootBeforeA1.id === testDir &&
          Boolean(rootAfterA1) &&
          rootAfterA1.id === testDir2 &&
          tree.findNodeById(tree.getRoot(), testDir) === null,
        `Real File > 폴더 열기 menu click (real menu -> handleOpenFolderDialog() -> host bridge chain; only the native picker's return value is stubbed) replaces the tree root from P (${testDir}) to Q (${testDir2}), with P referenced nowhere afterward (FR-A1)`
      );
      await app.openFolder(testDir); // switch back to the richer fixture for the rest of the suite
      await wait(60);
    } else {
      record('P7-FR-A1', false, 'window.__testTmpDir/__testTmpDir2 were not provided by the runner');
    }

    // ------------------------------------------------------------------------
    // 5. Icon-theme cycling (FR-Q1, FR-Q1a, FR-Q2)
    // ------------------------------------------------------------------------
    let iconBefore = null;
    let iconAfter = null;
    let iconBackToStart = null;
    let trackedRowId = null;
    // Round-1 adversarial finding (Major): comparing className without
    // pinning which tree row is being read can't rule out comparing two
    // different rows, or a coincidental class match. Track one row's
    // data-id explicitly and always re-query THAT exact row.
    function iconClassForTrackedRow() {
      if (!trackedRowId) return null;
      const row = document.querySelector(`.tree-row[data-id="${CSS.escape(trackedRowId)}"] .tree-icon`);
      return row ? row.className : null;
    }
    if (testDir) {
      const firstRowEl = document.querySelector('.tree-row');
      trackedRowId = firstRowEl ? firstRowEl.dataset.id : null;
      // v0.1 FR-Q1a's toggle became a choice of two in v0.2 (SPEC 0.1, FR-M9).
      iconBefore = iconClassForTrackedRow();
      clickMenuRow('view', 'view:icon-theme');
      clickMenuRow('view', 'view:icon-theme:vscode-icons');
      await wait(30);
      iconAfter = iconClassForTrackedRow();
      clickMenuRow('view', 'view:icon-theme');
      clickMenuRow('view', 'view:icon-theme:seti');
      await wait(30);
      iconBackToStart = iconClassForTrackedRow();
    }
    record(
      'P7-FR-Q1A',
      Boolean(testDir) && Boolean(trackedRowId) && iconBefore !== null && iconBefore !== iconAfter && iconAfter !== null,
      `Choosing VS Code Icons in View > Icon Theme actually changes the rendered icon class for the SAME tracked row (data-id="${trackedRowId}", before: ${iconBefore}, after: ${iconAfter}) — Phase 7 finding: switching alone did not re-render until main.ts also called tree.render() (FR-Q1, FR-Q1a → v0.2 FR-M9)`
    );
    record(
      'P7-FR-Q1A-ROUNDTRIP',
      Boolean(testDir) && iconBackToStart === iconBefore,
      'Choosing VS Code Built-in again returns the SAME tracked row to its original icon class (v0.1 FR-Q1a round trip → v0.2 FR-M9)'
    );
    record(
      'P7-FR-Q1A-NOT-ON-ACTBAR',
      document.querySelectorAll('.activity-bar-item[data-item-id*="icon-theme"]').length === 0,
      'The icon-theme toggle exists only in the View menu, with 0 equivalent in the Activity Bar (FR-Q1a)'
    );

    // Round-1 adversarial finding (Critical): this used to be a bare
    // `record(id, true, ...)` — a hardcoded pass proving nothing. Actually
    // drive all 3 color themes x 2 icon themes and check each combination
    // renders with the state it was just set to, proving the two axes don't
    // clobber each other.
    let q2Ok = true;
    let q2VisuallyValid = true;
    const q2Combos = [];
    const sidebarEl = document.getElementById('sidebar');
    const editorContainerEl = document.getElementById('editor-container');
    for (const colorT of ['light', 'gray', 'dark']) {
      for (let i = 0; i < 2; i++) {
        theme.setTheme(colorT);
        clickMenuRow('view', 'view:icon-theme');
        clickMenuRow('view', i === 1 ? 'view:icon-theme:vscode-icons' : 'view:icon-theme:seti');
        await wait(20);
        const rowIcon = iconClassForTrackedRow();
        const combo = { colorT, appliedColor: document.documentElement.dataset.theme, iconClass: rowIcon };
        q2Combos.push(combo);
        if (combo.appliedColor !== colorT || !rowIcon) q2Ok = false;
        // Round-2 finding: also probe NFR-6's literal "0 overlaps 또는
        // 읽을 수 없는 화면" (0 overlapping/unreadable screens) in each of
        // the 6 combinations — the round-2-critiqued version only checked
        // internal state, never anything about the rendered screen itself.
        if (sidebarEl && editorContainerEl) {
          const sidebarRect = sidebarEl.getBoundingClientRect();
          const editorRect = editorContainerEl.getBoundingClientRect();
          const overlaps = sidebarRect.left < editorRect.right && editorRect.left < sidebarRect.right && sidebarRect.top < editorRect.bottom && editorRect.top < sidebarRect.bottom;
          if (overlaps) q2VisuallyValid = false;
        }
        const trackedRowLabelEl = trackedRowId ? document.querySelector(`.tree-row[data-id="${CSS.escape(trackedRowId)}"] .tree-label`) : null;
        if (trackedRowLabelEl) {
          const fg = getComputedStyle(trackedRowLabelEl).color;
          const bg = getComputedStyle(sidebarEl).backgroundColor;
          if (fg === bg) q2VisuallyValid = false;
        }
      }
    }
    // Restore the icon theme to its starting set (2 toggles happened above
    // per color, i.e. an even number overall, so it's already back) and a
    // sane color theme.
    theme.setTheme('dark');
    const distinctIconClasses = new Set(q2Combos.map((c) => c.iconClass)).size;
    record(
      'P7-FR-Q2',
      Boolean(testDir) && q2Ok && distinctIconClasses === 2 && q2VisuallyValid,
      `All 3 color themes x 2 icon-theme states rendered independently (color theme always matched what was just set, exactly 2 distinct icon-theme classes across all 6 combinations) and — in every one of the 6 combinations — the sidebar and editor never overlap and the tracked tree label's text color never equals its background (NFR-6) (FR-Q2; combos: ${JSON.stringify(q2Combos)})`
    );

    // FR-N9's left zone (statusbarPath): now that a real folder/tree is
    // open, select a real row for real and confirm the status bar reflects
    // that exact node — not just "some non-empty text" (round-1 Minor).
    if (testDir && trackedRowId) {
      const rowEl = document.querySelector(`.tree-row[data-id="${CSS.escape(trackedRowId)}"]`);
      clickEl(rowEl);
      await wait(30);
      const statusbarPathEl = document.getElementById('statusbar-path');
      record(
        'P7-FR-N9-PATH',
        Boolean(statusbarPathEl) && statusbarPathEl.textContent === trackedRowId,
        `Selecting a real tree row updates the status bar's left zone to that row's real target (expected "${trackedRowId}", found "${statusbarPathEl ? statusbarPathEl.textContent : null}") (FR-N9)`
      );
    } else {
      record('P7-FR-N9-PATH', false, 'window.__testTmpDir was not provided by the runner');
    }

    // ------------------------------------------------------------------------
    // 6. Help > 정보 attribution (FR-Q5)
    // ------------------------------------------------------------------------
    closeMenuIfOpen();
    clickMenuRow('help', 'help:about');
    await wait(30);
    const aboutText = document.body.textContent;
    record(
      'P7-FR-Q5',
      app.aboutDialog.isOpen() && aboutText.includes('codicons') && aboutText.includes('CC BY 4.0') && aboutText.includes('vscode-icons') && aboutText.includes('CC BY-SA'),
      'Help > 정보 shows attribution for both CC-licensed icon sets (codicons: CC BY 4.0, vscode-icons: CC BY-SA) (FR-Q5)'
    );
    app.aboutDialog.hide();

    // ------------------------------------------------------------------------
    // 7. Tree keyboard gaps found by the 133-item cross-reference
    //    (FR-A7, FR-A13, FR-A18 — previously judged only via a different
    //    trigger, e.g. a button click, not the actual key itself)
    // ------------------------------------------------------------------------
    if (testDir) {
      tree.focusTree();
      const before = tree.getVisibleItems().length;
      // Expand whatever is expandable so Ctrl+ArrowLeft has something to collapse
      dispatchTreeKey('ArrowRight');
      await wait(20);
      dispatchTreeKey('ArrowLeft', { ctrlKey: true });
      await wait(20);
      record(
        'P7-FR-A7',
        tree.getExpandedIds().length === 0,
        'Real Ctrl+ArrowLeft keydown on the tree collapses every expanded node (FR-A7) — previously only the View-titlebar Collapse All button (FR-A21) exercised this result'
      );

      dispatchTreeKey('F3');
      await wait(20);
      record('P7-FR-A13', tree.getIsFindOpen(), 'Real F3 keydown on the tree opens the inline find widget (FR-A13) — previously only tree.openFindWidget() was called directly');
      tree.closeFindWidget();

      const visible = tree.getVisibleItems();
      if (visible.length > 0) {
        tree.focusItemById(visible[0].id);
        tree.clearSelection();
        const selectedBefore = tree.getSelectedIds().length;
        dispatchTreeKey('Enter', { ctrlKey: true, shiftKey: true });
        await wait(20);
        const selectedAfterFirstPress = tree.getSelectedIds().length;
        // Round-2 finding: also press it a 2nd time and prove the toggle
        // actually reverses (-1), not just that the first press adds (+1).
        dispatchTreeKey('Enter', { ctrlKey: true, shiftKey: true });
        await wait(20);
        record(
          'P7-FR-A18',
          selectedAfterFirstPress === selectedBefore + 1 && tree.getSelectedIds().length === selectedBefore,
          'Real Ctrl+Shift+Enter keydown toggles the focused item into the selection (+1), and a 2nd press toggles it back out (-1) (FR-A18)'
        );
      } else {
        record('P7-FR-A18', false, 'No visible tree item to focus for the Ctrl+Shift+Enter check');
      }
    } else {
      record('P7-FR-A7', false, 'window.__testTmpDir was not provided by the runner');
      record('P7-FR-A13', false, 'window.__testTmpDir was not provided by the runner');
      record('P7-FR-A18', false, 'window.__testTmpDir was not provided by the runner');
    }

    // ------------------------------------------------------------------------
    // 8. Real-host tree keyboard/mouse navigation (FR-A2 ~ FR-A5, A8 ~ A12,
    //    A16, A17, A19). Round-1 adversarial finding (Critical): these were
    //    previously judged ONLY by verify-phase3.mjs's Mock DOM Environment
    //    — a Node-side global.document shim with 0 real browser/host
    //    participating, not genuine user-behavior coverage (see
    //    docs/checklist.md's "로직 수준 시뮬레이션" category). This section
    //    re-proves them for real, in the actual running Electron/pywebview
    //    host, against the real rendered tree DOM.
    // ------------------------------------------------------------------------
    if (testDir) {
      // getVisibleItems() traverses starting at the ROOT node itself (it is
      // the first visible row, per FR-A1's "트리 맨 위가 그 폴더가 되고 자식이
      // 보인다"), so tree.collapseAll() — which also collapses root — would
      // hide every child and break all the index math below. Keep root
      // expanded (its normal post-openFolder state) and only reason about
      // its children as a separate slice.
      tree.clearSelection();
      const rootNode = tree.getRoot();
      if (rootNode && !tree.isExpanded(rootNode.id)) {
        await tree.setExpanded(rootNode.id, true);
      }
      await wait(20);
      const childItems = tree.getVisibleItems().slice(1);
      // folders sort first (providers/filesystem.ts): beta-folder,
      // echo-folder, alpha.txt, charlie.txt, delta.txt
      const [betaFolder, echoFolder, alphaFile] = childItems;

      // FR-A2: ArrowDown/ArrowUp move focus one item at a time
      tree.focusItemById(betaFolder.node.id);
      dispatchTreeKey('ArrowDown');
      await wait(15);
      dispatchTreeKey('ArrowDown');
      await wait(15);
      const focusAfterTwoDown = tree.getFocusedId();
      dispatchTreeKey('ArrowUp');
      await wait(15);
      record(
        'P7-FR-A2',
        focusAfterTwoDown === alphaFile.node.id && tree.getFocusedId() === echoFolder.node.id,
        `Real ArrowDown x2 then ArrowUp moves focus item-by-item through the real rendered tree (FR-A2)`
      );

      // FR-A3/A4: ArrowRight expands a collapsed folder / moves to first
      // child if already expanded; ArrowLeft collapses / moves to parent
      tree.focusItemById(betaFolder.node.id);
      dispatchTreeKey('ArrowRight');
      await wait(20);
      const expandedAfterRight = tree.isExpanded(betaFolder.node.id);
      dispatchTreeKey('ArrowRight');
      await wait(20);
      const focusedFirstChild = tree.getFocusedId();
      const childOfBeta = tree.getVisibleItems().find((it) => it.parent && it.parent.id === betaFolder.node.id);
      record(
        'P7-FR-A3',
        expandedAfterRight && Boolean(childOfBeta) && focusedFirstChild === childOfBeta.node.id,
        'Real ArrowRight on a collapsed folder expands it; a 2nd real ArrowRight moves focus to its first child (FR-A3)'
      );
      dispatchTreeKey('ArrowLeft');
      await wait(20);
      const focusedParentAfterLeft = tree.getFocusedId();
      dispatchTreeKey('ArrowLeft');
      await wait(20);
      record(
        'P7-FR-A4',
        focusedParentAfterLeft === betaFolder.node.id && !tree.isExpanded(betaFolder.node.id),
        'Real ArrowLeft on a leaf moves focus to its parent; a 2nd real ArrowLeft on the now-focused expanded folder collapses it (FR-A4)'
      );

      // FR-A5: Space toggles expand/collapse
      dispatchTreeKey(' ');
      await wait(20);
      const expandedAfterSpace1 = tree.isExpanded(betaFolder.node.id);
      dispatchTreeKey(' ');
      await wait(20);
      record(
        'P7-FR-A5',
        expandedAfterSpace1 === true && tree.isExpanded(betaFolder.node.id) === false,
        'Real Space keydown twice on a folder toggles it expanded then collapsed (FR-A5)'
      );

      // FR-A8: Home/End jump to first/last visible item
      tree.focusItemById(betaFolder.node.id);
      dispatchTreeKey('Home');
      await wait(15);
      const focusAfterHome = tree.getFocusedId();
      dispatchTreeKey('End');
      await wait(15);
      const visibleNow = tree.getVisibleItems();
      record(
        'P7-FR-A8',
        focusAfterHome === visibleNow[0].node.id && tree.getFocusedId() === visibleNow[visibleNow.length - 1].node.id,
        'Real Home moves focus to the first visible item, real End to the last (FR-A8)'
      );

      // FR-A16: PageDown/PageUp move focus by a page (or clamp to the ends,
      // per FR-A16's own literal "닿으면 마지막 항목" clause) — with only 5
      // root items this environment cannot force true multi-page scrolling,
      // so this proves the clamp-to-end behavior specifically.
      tree.focusItemById(visibleNow[0].node.id);
      dispatchTreeKey('PageDown');
      await wait(15);
      const focusAfterPageDown = tree.getFocusedId();
      dispatchTreeKey('PageUp');
      await wait(15);
      record(
        'P7-FR-A16',
        focusAfterPageDown === visibleNow[visibleNow.length - 1].node.id && tree.getFocusedId() === visibleNow[0].node.id,
        'Real PageDown moves focus toward the end (clamped to the last item in this small tree), real PageUp moves it back (FR-A16)'
      );

      // FR-A17: Ctrl+ArrowDown/Up must NOT move focus (scroll-only) — with
      // only 5 root items nothing here needs to scroll, so this checks the
      // one part of FR-A17 that always holds regardless of viewport size:
      // focus staying put.
      tree.focusItemById(visibleNow[0].node.id);
      dispatchTreeKey('ArrowDown', { ctrlKey: true });
      await wait(15);
      record(
        'P7-FR-A17',
        tree.getFocusedId() === visibleNow[0].node.id,
        'Real Ctrl+ArrowDown does not move focus (scroll-only) (FR-A17) — true multi-page scroll-position movement is not exercised here (only 5 root items, nothing to scroll)'
      );

      // FR-A9: Shift+ArrowDown extends a contiguous selection range —
      // round-2 finding: check the ACTUAL 3 ids match the expected
      // contiguous range, not just a count of 3 (any 3 items would pass a
      // count-only check).
      tree.clearSelection();
      tree.focusItemById(visibleNow[0].node.id);
      const rowEl0 = document.querySelector(`.tree-row[data-id="${CSS.escape(visibleNow[0].node.id)}"]`);
      clickEl(rowEl0);
      await wait(15);
      dispatchTreeKey('ArrowDown', { shiftKey: true });
      await wait(15);
      dispatchTreeKey('ArrowDown', { shiftKey: true });
      await wait(15);
      const expectedA9Range = [visibleNow[0].node.id, visibleNow[1].node.id, visibleNow[2].node.id].sort();
      record(
        'P7-FR-A9',
        JSON.stringify(tree.getSelectedIds().sort()) === JSON.stringify(expectedA9Range),
        `Real Shift+ArrowDown x2 selects exactly the 3 contiguous items ${JSON.stringify(expectedA9Range)}, not merely "some 3 items" (FR-A9)`
      );

      // FR-A10: Ctrl+A selects every visible item
      tree.clearSelection();
      dispatchTreeKey('a', { ctrlKey: true });
      await wait(15);
      record(
        'P7-FR-A10',
        tree.getSelectedIds().length === visibleNow.length,
        `Real Ctrl+A selects all ${visibleNow.length} visible items (FR-A10)`
      );

      // FR-A11: Ctrl+click adds a 2nd item, Shift+click range-selects —
      // round-2 finding: check the ACTUAL ids selected, not just counts.
      tree.clearSelection();
      const rowElA = document.querySelector(`.tree-row[data-id="${CSS.escape(visibleNow[0].node.id)}"]`);
      clickEl(rowElA);
      await wait(15);
      const rowElB = document.querySelector(`.tree-row[data-id="${CSS.escape(visibleNow[2].node.id)}"]`);
      rowElB.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      await wait(15);
      const ctrlClickIds = tree.getSelectedIds().sort();
      const expectedCtrlClickIds = [visibleNow[0].node.id, visibleNow[2].node.id].sort();
      tree.clearSelection();
      clickEl(rowElA);
      await wait(15);
      rowElB.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
      await wait(15);
      const shiftClickIds = tree.getSelectedIds().sort();
      const expectedShiftClickIds = [visibleNow[0].node.id, visibleNow[1].node.id, visibleNow[2].node.id].sort();
      record(
        'P7-FR-A11',
        JSON.stringify(ctrlClickIds) === JSON.stringify(expectedCtrlClickIds) &&
          JSON.stringify(shiftClickIds) === JSON.stringify(expectedShiftClickIds),
        `Real Ctrl+click selects exactly the 2 distinct clicked items ${JSON.stringify(expectedCtrlClickIds)}; real Shift+click selects exactly the range between them ${JSON.stringify(expectedShiftClickIds)} (FR-A11)`
      );

      // FR-A12: Escape clears the selection
      dispatchTreeKey('Escape');
      await wait(15);
      record('P7-FR-A12', tree.getSelectedIds().length === 0, 'Real Escape keydown clears a multi-item selection (FR-A12)');

      // FR-A19: Ctrl+Alt+F opens the find widget (same result as FR-A13's F3)
      dispatchTreeKey('f', { ctrlKey: true, altKey: true });
      await wait(20);
      record('P7-FR-A19', tree.getIsFindOpen(), 'Real Ctrl+Alt+F keydown on the tree opens the inline find widget, same as F3 (FR-A19)');
      tree.closeFindWidget();

      // FR-A15: no means exists to change the tree root from inside the
      // tree itself. Round-2 finding: promote from Phase 3's Mock DOM
      // (logic-level simulation) to this real host — check the real
      // rendered DOM has 0 "go up"/"go to parent" affordance, and that a
      // real navigation/expand/select sequence never changes tree.getRoot().
      const rootBeforeA15 = tree.getRoot();
      const hasUpAffordance =
        document.querySelectorAll('[data-item-id*="go-up"], [data-item-id*="parent"], .tree-go-up, .tree-up-btn').length > 0 ||
        Array.from(document.querySelectorAll('.menu-item-row, .sidebar-action-btn')).some((el) => /상위|go up|go to parent/i.test(el.textContent || el.title || ''));
      dispatchTreeKey('ArrowUp');
      await wait(15);
      dispatchTreeKey('ArrowLeft');
      await wait(15);
      dispatchTreeKey('Home');
      await wait(15);
      record(
        'P7-FR-A15',
        !hasUpAffordance && tree.getRoot() === rootBeforeA15,
        'The real rendered tree has 0 "go up to parent" UI affordance, and real keyboard navigation (ArrowUp/ArrowLeft/Home) never changes tree.getRoot() (FR-A15)'
      );

      // v0.1 FR-A20/FR-A24 -> v0.2 FR-X2 (SPEC 0.1): the view titlebar's shell
      // actions are now New File, New Folder, Refresh, Collapse All — driven by
      // real clicks on the real rendered buttons.
      tree.setExpanded(betaFolder.node.id, true);
      tree.setExpanded(echoFolder.node.id, true);
      await wait(20);
      const newFileShellBtn = document.getElementById('sidebar-action-new-file');
      const newFolderShellBtn = document.getElementById('sidebar-action-new-folder');
      const collapseAllBtn = document.getElementById('sidebar-action-collapse-all');
      const refreshBtn = document.getElementById('sidebar-action-refresh');
      const shellActionEls = Array.from(document.querySelectorAll('#sidebar-actions .sidebar-action-btn:not(.app-action-btn)'));
      const shellOrderOK =
        shellActionEls.length === 4 &&
        shellActionEls[0] === newFileShellBtn && shellActionEls[1] === newFolderShellBtn &&
        shellActionEls[2] === refreshBtn && shellActionEls[3] === collapseAllBtn;
      record(
        'P7-FR-A20',
        shellOrderOK && document.querySelectorAll('#sidebar-actions [data-id*="preset"], #sidebar-actions [title*="Preset" i]').length === 0,
        'The Explorer view titlebar renders exactly the shell\'s own 4 actions — New File, New Folder, Refresh, Collapse All in order — distinguishable from any app-added ones, and 0 Preset Info (v0.1 FR-A20/A24 -> v0.2 FR-X2/FR-X3)'
      );
      clickEl(collapseAllBtn);
      await wait(30);
      record('P7-FR-A21', tree.getExpandedIds().length === 0, 'Clicking the real Collapse All button in the view titlebar collapses every expanded folder (FR-A21)');

      tree.setExpanded(betaFolder.node.id, true);
      await wait(20);
      const selectedBeforeRefresh = tree.getSelectedIds().slice();
      const expandedBeforeRefresh = tree.getExpandedIds().slice();
      clickEl(refreshBtn);
      await wait(80);
      record(
        'P7-FR-A22-STATE',
        JSON.stringify(tree.getExpandedIds().sort()) === JSON.stringify(expandedBeforeRefresh.sort()) &&
          JSON.stringify(tree.getSelectedIds().sort()) === JSON.stringify(selectedBeforeRefresh.sort()),
        'Clicking the real Refresh button in the view titlebar re-reads the tree while preserving expansion and selection exactly (FR-A22)'
      );

      // FR-A22's other half — the shell picking up a file that genuinely
      // appeared on disk after the folder was opened. The shell has 0
      // file-write API of its own (INTENT 7), so the runner drops a real
      // file into a dedicated 3rd test folder right after its first real
      // read; a 2nd read (this Refresh click) must show it (round-2
      // adversarial finding, Critical — the round-1 version only compared
      // selection/expansion state, never a genuinely new row appearing).
      const testDir3 = window.__testTmpDir3;
      if (testDir3) {
        await app.openFolder(testDir3);
        await wait(80);
        const rowCountBeforeNewFile = tree.getVisibleItems().length;
        clickEl(refreshBtn);
        await wait(80);
        const newRowAppeared = tree.getVisibleItems().some((it) => it.node.id.endsWith('appeared-on-refresh.txt'));
        record(
          'P7-FR-A22-NEWROW',
          tree.getVisibleItems().length === rowCountBeforeNewFile + 1 && newRowAppeared,
          'Clicking the real Refresh button picks up a file that genuinely appeared on disk after the folder was opened, adding exactly 1 new row (FR-A22)'
        );
        await app.openFolder(testDir); // switch back for the rest of the suite
        await wait(60);
      } else {
        record('P7-FR-A22-NEWROW', false, 'window.__testTmpDir3 was not provided by the runner');
      }

      // v0.1 FR-A23 -> v0.2 FR-X4 (SPEC 0.1): the New File button is now the
      // shell's own view-titlebar action. Clicking it opens the inline input
      // row; real Enter commits the typed name to the app's registered
      // handler; real Escape cancels. The shell creates nothing itself.
      let a23CommitCount = 0;
      let a23LastCommitName = null;
      let a23LastType = null;
      window.__workbenchAppSurface.setSidebarNewItemHandler((req) => {
        a23CommitCount++;
        a23LastCommitName = req.name;
        a23LastType = req.type;
      });
      await wait(20);
      clickEl(newFileShellBtn);
      await wait(20);
      const inputRow = document.querySelector('.tree-input-row .tree-input-field');
      record('P7-FR-A23-OPEN', Boolean(inputRow), 'Clicking the shell\'s own New File button in the view titlebar opens exactly 1 inline input row (v0.1 FR-A23 -> v0.2 FR-X4)');
      if (inputRow) {
        inputRow.value = 'phase7-new-file.txt';
        inputRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await wait(20);
      }
      record(
        'P7-FR-A23-COMMIT',
        a23CommitCount === 1 && a23LastCommitName === 'phase7-new-file.txt' && a23LastType === 'leaf' &&
          document.querySelectorAll('.tree-input-row').length === 0,
        'Real Enter in the inline input commits exactly once with the typed name verbatim and a generic "leaf" type to the app handler — the shell creates nothing itself, and the input row disappears (FR-X4, NFR-6)'
      );

      clickEl(newFolderShellBtn);
      await wait(20);
      const commitCountBeforeEscape = a23CommitCount;
      const inputRow2 = document.querySelector('.tree-input-row .tree-input-field');
      if (inputRow2) {
        inputRow2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await wait(20);
      }
      record(
        'P7-FR-A23-CANCEL',
        Boolean(inputRow2) && a23CommitCount === commitCountBeforeEscape && document.querySelectorAll('.tree-input-row').length === 0,
        'Real Escape in the inline input (opened by New Folder) cancels with 0 app handler calls, and the input row disappears (FR-X4)'
      );
    } else {
      for (const id of ['P7-FR-A2', 'P7-FR-A3', 'P7-FR-A4', 'P7-FR-A5', 'P7-FR-A8', 'P7-FR-A16', 'P7-FR-A17', 'P7-FR-A9', 'P7-FR-A10', 'P7-FR-A11', 'P7-FR-A12', 'P7-FR-A19', 'P7-FR-A15', 'P7-FR-A20', 'P7-FR-A21', 'P7-FR-A22-STATE', 'P7-FR-A22-NEWROW', 'P7-FR-A23-OPEN', 'P7-FR-A23-COMMIT', 'P7-FR-A23-CANCEL']) {
        record(id, false, 'window.__testTmpDir was not provided by the runner');
      }
    }

    // ------------------------------------------------------------------------
    // 9. FR-G1 (empty state before any folder is open) and FR-N6c (Close
    //    Folder via a real File menu click)
    // ------------------------------------------------------------------------
    closeMenuIfOpen();
    // Round-2 finding: also capture pane/tab counts around Close Folder —
    // FR-N6c's literal result requires "탭과 칸은 그대로다" (tabs/panes
    // unaffected), which the round-1 version never checked.
    // v0.1 FR-N6c is replaced (SPEC 0.1, v0.2 FR-M1): File has no Close
    // Folder item any more. The ID now asserts that absence; the empty tree
    // state FR-G1 describes is reached through the shell's own clearRoot so
    // the FR-G1 checks below still run against it.
    const fileRowsNow = openMenuCategory('file');
    const closeFolderRows = fileRowsNow.filter((r) => r.id === 'file:close-folder' || /close folder|폴더 닫기/i.test(r.label));
    closeMenuIfOpen();
    const groupCountBeforeClose = app.editor.getGroupCount();
    const panelCountBeforeClose = app.editor.getPanelCount();
    app.closeFolder();
    await wait(50);
    const sidebarContentEl = document.getElementById('sidebar-content');
    record(
      'P7-FR-N6C',
      closeFolderRows.length === 0 &&
        Boolean(sidebarContentEl) &&
        sidebarContentEl.children.length === 0 &&
        sidebarContentEl.textContent.trim() === '' &&
        tree.getRoot() === null &&
        app.editor.getGroupCount() === groupCountBeforeClose &&
        app.editor.getPanelCount() === panelCountBeforeClose,
      `File has 0 Close Folder items (v0.1 FR-N6c → v0.2 FR-M1), and the emptied tree shows 0 child elements and 0 text with pane/tab counts unchanged (${groupCountBeforeClose} groups, ${panelCountBeforeClose} panels)`
    );
    // Round-2 finding: also click the empty area and confirm state is
    // genuinely unchanged by it (FR-G1's literal "클릭해도 상태가 바뀌지 않는다").
    let clickEmptyError = null;
    try {
      clickEl(sidebarContentEl);
    } catch (e) {
      clickEmptyError = e;
    }
    await wait(20);
    record(
      'P7-FR-G1',
      clickEmptyError === null &&
        sidebarContentEl.children.length === 0 &&
        sidebarContentEl.textContent.trim() === '' &&
        tree.getRoot() === null,
      'The empty-tree state (no folder open) renders 0 child elements and 0 text, and clicking the empty area throws nothing and changes nothing (FR-G1)'
    );

    return { success: results.every((r) => r.pass), results };
  } catch (err) {
    record('RUNNER_ERR', false, 'Unhandled error in Phase 7 suite: ' + (err && err.stack ? err.stack : String(err)));
    return { success: false, results };
  }
};
