// v0.3 Phase 1 (FOLDERS rail + Open Folder as "add tab") in-browser suite.
// Injected into a real renderer (Electron or pywebview) by the matching
// runner. Judges what is actually on screen (measured rects/colours), not
// just DOM presence (.claude/rules — "실측 크기·색·조상 가시성까지 본다").
window.__runV03Phase1Suite = async function () {
  const results = [];
  function record(id, pass, msg) {
    results.push({ id, pass: Boolean(pass), msg });
    console.log(`[TEST_ASSERT]${pass ? 'PASS' : 'FAIL'}|||${id}: ${msg}`);
  }
  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function clickEl(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  function clickMenuRow(categoryId, itemId) {
    const hamburger = document.getElementById('menu-hamburger-btn');
    if (!document.getElementById('workbench-menu-dropdown')) clickEl(hamburger);
    const catRow = document.querySelector(`.menu-category-row[data-category-id="${categoryId}"]`);
    if (catRow) clickEl(catRow);
    const itemRow = document.querySelector(`.menu-item-row[data-item-id="${itemId}"]`);
    if (!itemRow) throw new Error(`Menu row for ${itemId} not found`);
    clickEl(itemRow);
  }

  /**
   * Waits until the newest tab is both the active tab AND the Explorer root
   * that resolved for it — not just until the tab COUNT changed (A1 R1
   * Medium finding: a slow directory read could leave the tab added but its
   * root not yet resolved when the fixed sleep below used to run out).
   */
  async function waitForNewTabSettled(before, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 4000);
    let newTab = null;
    while (Date.now() < deadline) {
      await wait(10);
      const tabs = app.folderTabs.getTabs();
      if (tabs.length !== before) {
        newTab = tabs[tabs.length - 1];
        if (app.folderTabs.getActiveTab()?.id === newTab.id && tree.getRoot()?.id === newTab.path) {
          break;
        }
      }
    }
    await wait(30);
    return newTab;
  }

  /** Opens a folder the way a user does — only the native picker is stubbed. */
  async function uiOpenFolder(folderPath, timeoutMs) {
    const before = app.folderTabs.getTabs().length;
    window.__nextDialogPath = folderPath;
    clickMenuRow('file', 'file:open-folder');
    await waitForNewTabSettled(before, timeoutMs);
    delete window.__nextDialogPath;
  }

  async function uiOpenRecent(folderPath, timeoutMs) {
    const before = app.folderTabs.getTabs().length;
    clickMenuRow('file', 'file:open-recent');
    await wait(30);
    const rows = Array.from(
      document.querySelectorAll('.menu-child-submenu[data-parent-item="file:open-recent"] > .menu-item-row')
    );
    const target = rows.find((el) => el.querySelector('.menu-item-label')?.textContent === folderPath);
    if (!target) throw new Error('Recent-folder row not found for ' + folderPath);
    clickEl(target);
    await waitForNewTabSettled(before, timeoutMs);
  }

  const app = window.__workbenchApp;
  // Defensive isolation: a shared/persistent host profile (pywebview
  // genuinely persists localStorage as of the v0.3 Phase 4 fix — private_mode
  // was silently discarding it before) could carry leftover folder tabs into
  // this run. Clear them so this suite starts from a known-empty state
  // regardless of what ran before it in this profile.
  for (const t of [...app.folderTabs.getTabs()]) app.folderTabs.removeTab(t.id);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const tree = app.tree;
  const dir1 = window.__testTmpDir;
  const dir2 = window.__testTmpDir2;

  // ------------------------------------------------------------------------
  // 1. Rail exists between the Activity Bar and the Explorer, header = FOLDERS
  // ------------------------------------------------------------------------
  const rail = document.getElementById('foldertabs-rail');
  const activityBar = document.getElementById('activity-bar');
  const sidebar = document.getElementById('sidebar');
  record('V3P1-RAIL-EXISTS', Boolean(rail), 'Folder Tabs rail exists in the DOM');

  if (rail && activityBar && sidebar) {
    const railRect = rail.getBoundingClientRect();
    const abRect = activityBar.getBoundingClientRect();
    const sbRect = sidebar.getBoundingClientRect();
    record(
      'V3P1-RAIL-POSITION',
      railRect.width > 0 &&
        railRect.height > 0 &&
        railRect.left >= abRect.right - 0.5 &&
        railRect.right <= sbRect.left + 0.5,
      `Rail sits on screen between Activity Bar (right=${abRect.right}) and Explorer (left=${sbRect.left}); rail=[${railRect.left},${railRect.right}]`
    );
  } else {
    record('V3P1-RAIL-POSITION', false, 'Could not measure — one of the three elements is missing');
  }

  const titleEl = document.getElementById('foldertabs-title');
  record('V3P1-HEADER-TITLE', titleEl && titleEl.textContent.trim() === 'FOLDERS', `Header title is "${titleEl ? titleEl.textContent : '(missing)'}"`);

  const headerBtns = Array.from(document.querySelectorAll('#foldertabs-header .foldertabs-action-btn'));
  record(
    'V3P1-HEADER-ICON-COUNT',
    headerBtns.length === 3,
    `Header has exactly 3 action icons (found ${headerBtns.length}) — Add Folder, Add All Drives (v0.3 WK-111), Rename Folder Tab`
  );
  record(
    'V3P1-HEADER-ICON-ORDER',
    headerBtns[0]?.id === 'foldertabs-add-btn' &&
      headerBtns[1]?.id === 'foldertabs-drives-btn' &&
      headerBtns[2]?.id === 'foldertabs-rename-btn',
    'Icon order is Add Folder, Add All Drives, Rename Folder Tab'
  );

  const renameBtn = document.getElementById('foldertabs-rename-btn');
  record('V3P1-RENAME-DISABLED-EMPTY', renameBtn && renameBtn.disabled, 'Rename Folder Tab is disabled with 0 tabs');

  // ------------------------------------------------------------------------
  // 2. Open Folder adds a new tab and activates it; does not replace (D-3)
  // ------------------------------------------------------------------------
  if (dir1) {
    await uiOpenFolder(dir1);
    let tabs = app.folderTabs.getTabs();
    record('V3P1-ADD-FIRST-TAB', tabs.length === 1, `1 tab exists after first Open Folder (found ${tabs.length})`);
    record('V3P1-ROOT-MATCHES', Boolean(tree.getRoot()) && tree.getRoot().id === tabs[0]?.path, 'Explorer root is exactly the opened folder');

    const rows1 = Array.from(document.querySelectorAll('.foldertabs-tab'));
    record('V3P1-TAB-ROW-RENDERED', rows1.length === 1, `1 visible tab row (found ${rows1.length})`);
    record('V3P1-TAB-HOVER-PATH', rows1[0]?.getAttribute('title') === dir1, 'Tab shows the full path on hover (title attribute)');
    record('V3P1-TAB-LABEL-BARE', rows1[0]?.querySelector('.foldertabs-tab-label')?.textContent === app.folderTabs.displayName(tabs[0]), 'First tab of a path shows the bare folder name');
    record('V3P1-TAB-HAS-ICON', Boolean(rows1[0]?.querySelector('.tree-icon')), 'Tab row carries a folder icon');
    record('V3P1-RENAME-ENABLED-ACTIVE', renameBtn && !renameBtn.disabled, 'Rename Folder Tab enables once a tab is active');

    // Reopening the SAME path must add a second tab, not reuse the first (D-3, WK-084).
    await uiOpenFolder(dir1);
    tabs = app.folderTabs.getTabs();
    record('V3P1-REOPEN-SAME-PATH-ADDS', tabs.length === 2, `Reopening the same path adds a 2nd tab (found ${tabs.length})`);
    // Same path on both tabs, so this must check the TAB ID is active, not
    // just that the Explorer root's path matches (A1 R1 Medium finding: the
    // old tab staying active would also satisfy a path-only comparison).
    record(
      'V3P1-REOPEN-ACTIVATES-NEW',
      app.folderTabs.getActiveTab()?.id === tabs[1]?.id && tree.getRoot()?.id === tabs[1]?.path,
      'The newly added tab (not the first, same-path one) becomes active'
    );

    // Same-path numbering: first bare, second "(2)" (D-3, WK-085).
    const nameForSlot1 = app.folderTabs.displayName(tabs[0]);
    const nameForSlot2 = app.folderTabs.displayName(tabs[1]);
    const baseName = dir1.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop();
    record(
      'V3P1-NUMBER-SUFFIX',
      nameForSlot1 === baseName && nameForSlot2 === `${baseName} (2)`,
      `Same-path tabs show "${nameForSlot1}" then "${nameForSlot2}"`
    );

    // A path spelled with a different separator style / drive-letter case
    // must still share the same slot pool (A1 R1 High finding — Windows
    // paths are case-insensitive and both separator styles are legal).
    const altSpelling =
      dir1.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, (m) => m[0].toUpperCase() + ':') !== dir1
        ? dir1.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, (m) => m[0].toUpperCase() + ':')
        : dir1.toUpperCase() === dir1
          ? dir1.toLowerCase()
          : dir1.toUpperCase();
    const altTab = app.folderTabs.addTab(altSpelling);
    await wait(60);
    record(
      'V3P1-NUMBER-CASE-INSENSITIVE',
      altTab.numberSlot === 3,
      `An equivalent path spelled differently ("${altSpelling}") still shares dir1's slot pool (got slot ${altTab.numberSlot}, expected 3)`
    );
    // Remove the probe tab so the rest of this section's row/active-tab
    // counts see the same 2 tabs they expect.
    app.folderTabs.removeTab(altTab.id);
    await wait(80);

    const rowsAfter = Array.from(document.querySelectorAll('.foldertabs-tab'));
    record('V3P1-TWO-ROWS-RENDERED', rowsAfter.length === 2, `2 visible tab rows after reopening (found ${rowsAfter.length})`);

    // ----------------------------------------------------------------------
    // 3. Active-tab distinction, on screen, measured — not just a class name.
    // ----------------------------------------------------------------------
    record('V3P1-ONE-ACTIVE-ROW', document.querySelectorAll('.foldertabs-tab.active').length === 1, 'Exactly 1 tab row is marked active');

    const themeIds = ['dark', 'light', 'gray'];
    let allThemesDistinct = true;
    let themeDetail = [];
    for (const t of themeIds) {
      app.theme.setTheme(t);
      await wait(80);
      // Re-query every iteration: a theme change re-renders the whole rail
      // (v0.3 D-1 icon-colour follow), which replaces these DOM nodes —
      // elements captured once outside the loop would go stale after the
      // FIRST iteration and getComputedStyle on a detached node reads as
      // equal, which is what made this false-pass look identical across all
      // 3 themes rather than genuinely checking each one.
      const activeRowNow = document.querySelector('.foldertabs-tab.active');
      const inactiveRowNow = Array.from(document.querySelectorAll('.foldertabs-tab')).find((r) => r !== activeRowNow);
      if (!activeRowNow || !inactiveRowNow) {
        allThemesDistinct = false;
        themeDetail.push(`${t}:MISSING-ROW`);
        continue;
      }
      const activeStyle = getComputedStyle(activeRowNow);
      const inactiveStyle = getComputedStyle(inactiveRowNow);
      const distinct =
        activeStyle.backgroundColor !== inactiveStyle.backgroundColor ||
        activeStyle.borderLeftColor !== inactiveStyle.borderLeftColor;
      themeDetail.push(`${t}:${distinct ? 'ok' : 'SAME'}`);
      if (!distinct) allThemesDistinct = false;
    }
    app.theme.setTheme('dark');
    record('V3P1-ACTIVE-VISUAL-DISTINCT', allThemesDistinct, `Active tab visually differs from inactive in all 3 themes (${themeDetail.join(', ')})`);

    // Clicking the inactive row switches the active root back (basic activation loop).
    // Re-queried fresh — see the note above about theme changes replacing rows.
    const inactiveRowFinal = Array.from(document.querySelectorAll('.foldertabs-tab')).find(
      (r) => !r.classList.contains('active')
    );
    if (inactiveRowFinal) {
      clickEl(inactiveRowFinal);
      await wait(50);
      const clickedId = inactiveRowFinal.getAttribute('data-id');
      const clickedTab = app.folderTabs.getTabById(clickedId);
      record(
        'V3P1-CLICK-ACTIVATES',
        Boolean(clickedTab) && tree.getRoot()?.id === clickedTab.path && app.folderTabs.getActiveTab()?.id === clickedId,
        'Clicking a tab activates it and repoints the Explorer root'
      );
    }
  } else {
    record('V3P1-ADD-FIRST-TAB', false, 'window.__testTmpDir was not provided by the runner');
  }

  // ------------------------------------------------------------------------
  // 4. A distinct path is unaffected by another path's numbering (D-3).
  // ------------------------------------------------------------------------
  if (dir2) {
    await uiOpenFolder(dir2);
    const tab = app.folderTabs.getActiveTab();
    const baseName2 = dir2.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop();
    record(
      'V3P1-DISTINCT-PATH-BARE',
      Boolean(tab) && app.folderTabs.displayName(tab) === baseName2,
      `A new distinct path starts bare regardless of other paths' numbering (got "${tab ? app.folderTabs.displayName(tab) : '(none)'}")`
    );

    // Open Recent should also ADD a tab, not replace (D-3).
    const before = app.folderTabs.getTabs().length;
    await uiOpenRecent(dir1, 4000);
    const afterTabs = app.folderTabs.getTabs();
    record('V3P1-OPEN-RECENT-ADDS', afterTabs.length === before + 1, `Open Recent adds a tab (before=${before}, after=${afterTabs.length})`);
    record('V3P1-OPEN-RECENT-ACTIVATES', tree.getRoot()?.id === afterTabs[afterTabs.length - 1]?.path, 'Open Recent activates the newly added tab');
  } else {
    record('V3P1-DISTINCT-PATH-BARE', false, 'window.__testTmpDir2 was not provided by the runner');
  }

  // ------------------------------------------------------------------------
  // 5. v0.2's single "reopen the last folder" restore is gone (D-3, WK-087).
  // ------------------------------------------------------------------------
  let lastFolderKey = null;
  try {
    lastFolderKey = localStorage.getItem('workbench:last-folder');
  } catch {
    lastFolderKey = null;
  }
  record(
    'V3P1-NO-LAST-FOLDER-KEY',
    lastFolderKey === null,
    `workbench:last-folder is never written now that Open Folder adds tabs (found: ${JSON.stringify(lastFolderKey)})`
  );
  // restoreLastSession() is kept as a compatibility shim for v0.1/v0.2 suites
  // that still call it directly (A1 R1 High finding), but must now be an
  // intentional no-op: it restores nothing.
  const rootBeforeRestore = tree.getRoot() ? tree.getRoot().id : null;
  const tabCountBeforeRestore = app.folderTabs.getTabs().length;
  await app.restoreLastSession();
  await wait(50);
  record(
    'V3P1-RESTORE-IS-NOOP',
    tree.getRoot()?.id === rootBeforeRestore && app.folderTabs.getTabs().length === tabCountBeforeRestore,
    'restoreLastSession() is now a no-op — no root change, no tab added (D-3, WK-087)'
  );

  // ------------------------------------------------------------------------
  // 6. Closing a tab frees its number slot for the next tab of that path
  //    (PLAN Phase 1: "탭 하나를 닫으면 그 번호가 다음 탭에 다시 쓰인다"). The
  //    hover-x affordance itself is Phase 2 (WK-089); this proves the
  //    underlying data operation FolderTabsController.removeTab() is correct.
  // ------------------------------------------------------------------------
  if (dir1) {
    const beforeCount = app.folderTabs.getTabs().length;
    const dupTab = app.folderTabs.addTab(dir1);
    await wait(60);
    const dupName = app.folderTabs.displayName(dupTab);
    app.folderTabs.removeTab(dupTab.id);
    await wait(30);
    const reopened = app.folderTabs.addTab(dir1);
    await wait(60);
    const reopenedName = app.folderTabs.displayName(reopened);
    record(
      'V3P1-NUMBER-SLOT-REUSE',
      app.folderTabs.getTabs().length === beforeCount + 1 && reopenedName === dupName,
      `Closing "${dupName}" frees its slot; the next same-path tab reuses it as "${reopenedName}"`
    );
  } else {
    record('V3P1-NUMBER-SLOT-REUSE', false, 'window.__testTmpDir was not provided by the runner');
  }

  const success = results.every((r) => r.pass);
  return { success, results };
};
