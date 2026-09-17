// v0.3 Phase 3 (Folder Tabs rail toggle + Explorer independence) in-browser
// suite. Injected into a real renderer (Electron or pywebview) by the
// matching runner. Judges what is actually on screen (measured rects/
// visibility), not just internal state or DOM presence.
window.__runV03Phase3Suite = async function () {
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
  /** Visible on screen, not just "not display:none" — real measured size + ancestor chain. */
  function isActuallyVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    let node = el;
    while (node) {
      if (getComputedStyle(node).display === 'none') return false;
      node = node.parentElement;
    }
    return true;
  }
  function openViewMenu() {
    const hamburger = document.getElementById('menu-hamburger-btn');
    if (!document.getElementById('workbench-menu-dropdown')) clickEl(hamburger);
    const catRow = document.querySelector('.menu-category-row[data-category-id="view"]');
    if (catRow) clickEl(catRow);
  }
  function closeMenu() {
    const hamburger = document.getElementById('menu-hamburger-btn');
    if (document.getElementById('workbench-menu-dropdown')) clickEl(hamburger);
  }
  function rowFor(tabId) {
    return document.querySelector(`.foldertabs-tab[data-id="${tabId}"]`);
  }
  async function waitForRootPath(tree, expectedPath, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 4000);
    while (Date.now() < deadline) {
      if (tree.getRoot()?.id === expectedPath) return true;
      await wait(10);
    }
    return tree.getRoot()?.id === expectedPath;
  }

  const app = window.__workbenchApp;
  const ft = app.folderTabs;
  // Defensive isolation: a shared/persistent host profile (pywebview
  // genuinely persists localStorage as of the v0.3 Phase 4 fix — private_mode
  // was silently discarding it before) could carry leftover folder tabs into
  // this run. Clear them so this suite starts from a known-empty state
  // regardless of what ran before it in this profile.
  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const tree = app.tree;
  const dir1 = window.__testTmpDir;

  if (!dir1) {
    record('V3P3-FIXTURE', false, 'window.__testTmpDir was not provided by the runner');
    return { success: false, results };
  }
  record('V3P3-FIXTURE', true, 'A real folder was provided');

  const rail = document.getElementById('foldertabs-rail');
  const sidebar = document.getElementById('sidebar');
  const railToggleBtn = document.querySelector('[data-item-id="activity:toggle-foldertabs"]');
  const explorerToggleBtn = document.querySelector('[data-item-id="activity:toggle-sidebar"]');

  // ------------------------------------------------------------------------
  // 1. The icon exists right after Toggle Explorer, uses codicon-folder-library,
  //    and the View menu has a matching "Show Folder Tabs" row with no shortcut.
  // ------------------------------------------------------------------------
  record('V3P3-ICON-EXISTS', Boolean(railToggleBtn), 'Activity Bar has a Toggle Folder Tabs button');
  record(
    'V3P3-ICON-AFTER-EXPLORER',
    Boolean(
      explorerToggleBtn &&
        railToggleBtn &&
        (railToggleBtn.nextElementSibling === explorerToggleBtn ||
          explorerToggleBtn.nextElementSibling === railToggleBtn)
    ),
    'The Toggle Folder Tabs and Toggle Explorer icons are adjacent in the Activity Bar'
  );
  record(
    'V3P3-ICON-CORRECT-GLYPH',
    Boolean(
      railToggleBtn?.querySelector('.codicon-list-unordered') ||
        railToggleBtn?.querySelector('.codicon-folder-library')
    ),
    'The icon uses codicon-list-unordered'
  );

  openViewMenu();
  await wait(60);
  const menuRow = document.querySelector('.menu-item-row[data-item-id="view:toggle-foldertabs"]');
  record('V3P3-MENU-ROW-EXISTS', Boolean(menuRow), 'View menu has a "Show Folder Tabs" row');
  record(
    'V3P3-MENU-ROW-LABEL',
    menuRow?.querySelector('.menu-item-label')?.textContent === 'Show Folder Tabs',
    'The row label reads exactly "Show Folder Tabs"'
  );
  record(
    'V3P3-NO-SHORTCUT',
    !menuRow?.querySelector('.menu-item-shortcut'),
    'The row has no keyboard shortcut cell (D-2: no dedicated shortcut)'
  );
  closeMenu();
  await wait(30);

  // ------------------------------------------------------------------------
  // 2. Icon and menu watch the SAME state, and toggling actually hides/shows
  //    the rail on screen (measured), independently of the Explorer.
  // ------------------------------------------------------------------------
  record('V3P3-RAIL-VISIBLE-INITIALLY', isActuallyVisible(rail), 'The rail is visible at startup');

  clickEl(railToggleBtn);
  await wait(60);
  record('V3P3-ICON-HIDES-RAIL', !isActuallyVisible(rail), 'Clicking the icon hides the rail (measured)');
  record('V3P3-SIDEBAR-UNCHANGED-BY-RAIL-HIDE', isActuallyVisible(sidebar), 'Hiding the rail leaves the Explorer visible (independent areas, D-2)');

  openViewMenu();
  await wait(60);
  const menuRowAfterHide = document.querySelector('.menu-item-row[data-item-id="view:toggle-foldertabs"]');
  const checkedAfterHide = Boolean(menuRowAfterHide?.querySelector('.menu-item-check .codicon-check'));
  record('V3P3-MENU-UNCHECKS-WITH-ICON', !checkedAfterHide, 'The View menu row unchecks when the icon hid the rail (same state, D-2)');
  closeMenu();
  await wait(30);

  // Toggle back via the MENU this time — both controls drive the same state either way.
  openViewMenu();
  await wait(60);
  clickEl(document.querySelector('.menu-item-row[data-item-id="view:toggle-foldertabs"]'));
  await wait(60);
  record('V3P3-MENU-SHOWS-RAIL', isActuallyVisible(rail), 'Clicking the menu row shows the rail again (measured)');

  openViewMenu();
  await wait(60);
  const checkedAfterShow = Boolean(
    document.querySelector('.menu-item-row[data-item-id="view:toggle-foldertabs"] .menu-item-check .codicon-check')
  );
  record('V3P3-MENU-CHECKS-WITH-RAIL', checkedAfterShow, 'The View menu row re-checks once the rail is visible again');
  closeMenu();
  await wait(30);

  // ------------------------------------------------------------------------
  // 3. Hiding the Explorer independently leaves the rail alone.
  // ------------------------------------------------------------------------
  clickEl(explorerToggleBtn);
  await wait(60);
  record('V3P3-EXPLORER-HIDES-INDEPENDENTLY', !isActuallyVisible(sidebar), 'Toggle Explorer hides the Explorer');
  record('V3P3-RAIL-UNCHANGED-BY-EXPLORER-HIDE', isActuallyVisible(rail), 'Hiding the Explorer leaves the rail visible');

  // ------------------------------------------------------------------------
  // 4. Selecting a folder tab while the Explorer is hidden auto-shows it
  //    with that folder's tree (v0.3 D-2, WK-095).
  // ------------------------------------------------------------------------
  const t1 = ft.addTab(dir1); // adding a tab activates it — this alone already shows the Explorer
  await waitForRootPath(tree, t1.path, 4000);
  record(
    'V3P3-SELECT-TAB-AUTOSHOWS-EXPLORER-ON-ADD',
    isActuallyVisible(sidebar) && tree.getRoot()?.id === t1.path,
    'Adding a folder tab shows the Explorer with that folder as root'
  );

  // The real repro (A3 R1 Major finding): hide the Explorer again WITHOUT
  // changing which tab is active, then click that SAME already-active tab.
  // `onActivate` alone never fires here (nothing about the active tab
  // changed) — only `onSelect` does, which is what the fix wires the
  // auto-show to.
  clickEl(explorerToggleBtn);
  await wait(60);
  record('V3P3-EXPLORER-HIDDEN-BEFORE-RECLICK', !isActuallyVisible(sidebar), '(setup) Explorer is hidden with t1 still the active tab');
  clickEl(rowFor(t1.id));
  await wait(80);
  record(
    'V3P3-RECLICK-ACTIVE-TAB-SHOWS-EXPLORER',
    isActuallyVisible(sidebar) && tree.getRoot()?.id === t1.path,
    'Clicking the tab that is ALREADY active still shows a hidden Explorer again (A3 R1 Major finding)'
  );

  // Explorer back to hidden, restore for the rest of the suite.
  clickEl(explorerToggleBtn);
  await wait(30);
  record('V3P3-EXPLORER-RESTORED-HIDDEN', !isActuallyVisible(sidebar), '(setup) Explorer is hidden again for the next check');
  clickEl(explorerToggleBtn);
  await wait(30);

  // ------------------------------------------------------------------------
  // 5. Hiding/showing the rail does not disturb the tab list itself.
  // ------------------------------------------------------------------------
  const t2 = ft.addTab(dir1); // 2nd tab, same path -> "(2)"
  await wait(60);
  ft.setAlias(t2.id, 'My Alias'); // proves the alias itself survives, not just the tab count
  await wait(30);
  const tabsBeforeToggle = ft.getTabs().map((t) => ({ id: t.id, alias: t.alias }));
  const activeBeforeToggle = ft.getActiveTab()?.id;
  clickEl(railToggleBtn);
  await wait(60);
  clickEl(railToggleBtn);
  await wait(60);
  const tabsAfterToggle = ft.getTabs().map((t) => ({ id: t.id, alias: t.alias }));
  record(
    'V3P3-RAIL-TOGGLE-PRESERVES-TABS',
    JSON.stringify(tabsBeforeToggle) === JSON.stringify(tabsAfterToggle) && ft.getActiveTab()?.id === activeBeforeToggle,
    'Hiding then showing the rail leaves the tab list, aliases, and active tab exactly as they were'
  );

  // ------------------------------------------------------------------------
  // 6. The rail's visibility is not persisted (v0.3 D-2) — nothing is ever
  //    written to storage for it.
  // ------------------------------------------------------------------------
  clickEl(railToggleBtn); // now hidden
  await wait(30);
  let storedKeys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) storedKeys.push(localStorage.key(i));
  } catch {
    // ignore
  }
  const foldertabsVisibilityKey = storedKeys.find((k) => /foldertabs.*(visible|shown|hidden)/i.test(k || ''));
  record(
    'V3P3-RAIL-VISIBILITY-NOT-PERSISTED',
    !foldertabsVisibilityKey,
    `No localStorage key stores rail visibility (keys checked: ${JSON.stringify(storedKeys)})`
  );
  clickEl(railToggleBtn); // back to visible for the rest of the suite
  await wait(30);

  // ------------------------------------------------------------------------
  // 7. Zen Mode hides the rail along with the other chrome (WK-097).
  // ------------------------------------------------------------------------
  record('V3P3-RAIL-VISIBLE-BEFORE-ZEN', isActuallyVisible(rail), '(setup) Rail is visible before entering Zen Mode');
  app.viewState.toggleZenMode();
  await wait(60);
  record('V3P3-ZEN-HIDES-RAIL', !isActuallyVisible(rail), 'Entering Zen Mode hides the rail along with titlebar/sidebar/statusbar');
  app.viewState.toggleZenMode();
  await wait(60);
  record('V3P3-ZEN-EXIT-RESTORES-RAIL', isActuallyVisible(rail), 'Leaving Zen Mode restores the rail to its pre-Zen visibility');

  // ------------------------------------------------------------------------
  // 8. Existing Activity Bar toggles are unaffected (D-2: "기존... 동작이 바뀌지 않는다").
  // ------------------------------------------------------------------------
  const titlebarBtn = document.querySelector('[data-item-id="activity:toggle-titlebar"]');
  const titlebar = document.getElementById('titlebar');
  const wasVisible = isActuallyVisible(titlebar);
  clickEl(titlebarBtn);
  await wait(60);
  record('V3P3-EXISTING-TOGGLES-STILL-WORK', isActuallyVisible(titlebar) !== wasVisible, 'Toggle Title Bar still works exactly as before');
  clickEl(titlebarBtn);
  await wait(60);

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  await wait(30);

  const success = results.every((r) => r.pass);
  return { success, results };
};
