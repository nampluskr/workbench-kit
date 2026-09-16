// v0.3 Phase 4 (per-folder-tab Explorer state: expansion/selection/scroll,
// swap on switch, and restart restoration) in-browser suite. Injected into a
// real renderer (Electron or pywebview) by the matching runner. Judges what
// is actually on screen / actually reachable via the real APIs, not just
// internal flags.
(function () {
  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function clickEl(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  function rowFor(tabId) {
    return document.querySelector(`.foldertabs-tab[data-id="${tabId}"]`);
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
  async function waitForNewTabSettled(app, before, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 4000);
    let newTab = null;
    while (Date.now() < deadline) {
      await wait(10);
      const tabs = app.folderTabs.getTabs();
      if (tabs.length !== before) {
        newTab = tabs[tabs.length - 1];
        if (app.folderTabs.getActiveTab()?.id === newTab.id && app.tree.getRoot()?.id === newTab.path) break;
      }
    }
    await wait(30);
    return newTab;
  }
  /** Opens a folder the real way — File > Open Folder, only the native picker stubbed. */
  async function uiOpenFolder(app, folderPath, timeoutMs) {
    const before = app.folderTabs.getTabs().length;
    window.__nextDialogPath = folderPath;
    clickMenuRow('file', 'file:open-folder');
    const tab = await waitForNewTabSettled(app, before, timeoutMs);
    delete window.__nextDialogPath;
    return tab;
  }
  async function waitForCondition(fn, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 4000);
    while (Date.now() < deadline) {
      if (fn()) return true;
      await wait(20);
    }
    return fn();
  }

  // --------------------------------------------------------------------
  // Single-session suite: WK-098 (independent per-tab state) and WK-099
  // (swap on switch), run entirely within one process.
  // --------------------------------------------------------------------
  window.__runV04Phase4SingleSession = async function () {
    const results = [];
    function record(id, pass, msg) {
      results.push({ id, pass: Boolean(pass), msg });
      console.log(`[TEST_ASSERT]${pass ? 'PASS' : 'FAIL'}|||${id}: ${msg}`);
    }

    const app = window.__workbenchApp;
    const ft = app.folderTabs;
    // Defensive isolation: unlike the Launch1/Launch2 pair below, this
    // single-session suite does NOT want to inherit anything from a shared
    // profile. Clear leftovers before starting.
    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    const tree = app.tree;
    const dir1 = window.__testTmpDir;
    const dir2 = window.__testTmpDir2;

    if (!dir1 || !dir2) {
      record('V4P4-FIXTURE', false, 'window.__testTmpDir/__testTmpDir2 were not provided by the runner');
      return { success: false, results };
    }
    record('V4P4-FIXTURE', true, '2 real folders (each with a sub/ dir and files) were provided');

    // Two tabs on the SAME path — must keep fully independent Explorer state (D-5).
    const a1 = await uiOpenFolder(app, dir1);
    await wait(60);
    // Find the real sub-node id from the rendered tree rather than guessing
    // the path separator createRootNode normalized to.
    const subRowA1 = Array.from(document.querySelectorAll('.tree-row .tree-label')).find((el) => el.textContent === 'sub');
    const subIdA1 = subRowA1?.closest('.tree-row')?.getAttribute('data-id');
    if (subIdA1) await tree.setExpanded(subIdA1, true);
    await wait(60);
    const expandedA1 = tree.getExpandedIds();

    const a2 = await uiOpenFolder(app, dir1); // same path -> "(2)", independent tab
    await wait(60);
    record(
      'V4P4-SAME-PATH-STARTS-COLLAPSED',
      tree.getExpandedIds().length === 1 && tree.getExpandedIds()[0] === a2.path,
      'A second tab on the SAME path starts with only its own root expanded, not inheriting the first tab\'s expansion'
    );

    // Switch back to a1 — its own saved expansion must come back (D-5, WK-099).
    clickEl(rowFor(a1.id));
    await waitForCondition(() => tree.getRoot()?.id === a1.path, 4000);
    await wait(80);
    record(
      'V4P4-SWITCH-RESTORES-EXPANSION',
      subIdA1 ? tree.isExpanded(subIdA1) : tree.getExpandedIds().length === expandedA1.length,
      `Switching back to a1 restores its own expansion (expanded now: ${JSON.stringify(tree.getExpandedIds())})`
    );

    // Switch to a2 — must show a2's own (collapsed) state, not a1's.
    clickEl(rowFor(a2.id));
    await waitForCondition(() => tree.getRoot()?.id === a2.path, 4000);
    await wait(80);
    record(
      'V4P4-SAME-PATH-INDEPENDENT',
      tree.getExpandedIds().length === 1 && tree.getExpandedIds()[0] === a2.path,
      'a2 (same path as a1) still shows its own state, unaffected by a1\'s expansion'
    );

    // Selection + scroll independence across DIFFERENT paths.
    const b1 = await uiOpenFolder(app, dir2);
    await wait(60);
    const rows = Array.from(document.querySelectorAll('.tree-row[data-id]'));
    const fileRow = rows.find((r) => r !== rows[0]);
    if (fileRow) {
      clickEl(fileRow);
      await wait(40);
    }
    const listEl = document.querySelector('#sidebar-content .tree-list');
    if (listEl) listEl.scrollTop = 40;
    await wait(30);
    const b1Selected = tree.getSelectedIds();
    const b1Scroll = listEl ? listEl.scrollTop : 0;
    // The fixture has 60 root-level files specifically so this MUST overflow
    // — a fixture too small to scroll let this assertion pass even with
    // scroll persistence removed entirely (A4 R1 Major finding).
    record('V4P4-FIXTURE-ACTUALLY-SCROLLS', b1Scroll > 0, `b1's list actually scrolled when set (scrollTop=${b1Scroll}) — the fixture must overflow for this test to mean anything`);

    clickEl(rowFor(a1.id));
    await waitForCondition(() => tree.getRoot()?.id === a1.path, 4000);
    await wait(80);
    clickEl(rowFor(b1.id));
    await waitForCondition(() => tree.getRoot()?.id === b1.path, 4000);
    await wait(80);
    const listElAfter = document.querySelector('#sidebar-content .tree-list');
    record(
      'V4P4-SELECTION-RESTORED',
      JSON.stringify(tree.getSelectedIds().sort()) === JSON.stringify(b1Selected.sort()),
      `Switching away and back to b1 restores its selection (${JSON.stringify(tree.getSelectedIds())})`
    );
    record(
      'V4P4-SCROLL-RESTORED',
      Boolean(listElAfter) && listElAfter.scrollTop > 0,
      `Switching away and back to b1 restores its scroll position (scrollTop=${listElAfter ? listElAfter.scrollTop : 'n/a'}, was ${b1Scroll})`
    );

    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
    await wait(30);

    // ----------------------------------------------------------------------
    // A4 R2 Critical regression #1: closing a tab must remove its saved
    // Explorer state from what actually gets PERSISTED, not just from the
    // in-memory map — the previous fix cleaned up in-memory but fired after
    // render()'s persist call had already written the stale entry once.
    // ----------------------------------------------------------------------
    const x1 = await uiOpenFolder(app, dir1);
    await wait(60);
    const subRowX = Array.from(document.querySelectorAll('.tree-row .tree-label')).find((el) => el.textContent === 'sub');
    const subIdX = subRowX?.closest('.tree-row')?.getAttribute('data-id');
    if (subIdX) await tree.setExpanded(subIdX, true);
    await wait(60);
    const y1 = await uiOpenFolder(app, dir2); // switch away from x1 — x1's state gets captured & persisted
    await wait(60);
    ft.removeTab(x1.id); // close the now-inactive x1
    await wait(80);
    let storedAfterClose = null;
    try {
      storedAfterClose = JSON.parse(localStorage.getItem('workbench:folder-tabs') || 'null');
    } catch {
      storedAfterClose = null;
    }
    record(
      'V4P4-CLOSED-TAB-STATE-NOT-PERSISTED',
      Boolean(storedAfterClose) && !(x1.id in (storedAfterClose.explorerState || {})),
      `Closing x1 removes its entry from the PERSISTED explorerState, not just the in-memory map (keys: ${JSON.stringify(Object.keys((storedAfterClose && storedAfterClose.explorerState) || {}))})`
    );
    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
    await wait(30);

    // ----------------------------------------------------------------------
    // A4 R3 Critical regression: closing the ACTIVE tab (not an inactive
    // one) must also drop its state from what gets persisted. Between
    // removeTab() firing onRemove and its later activateCallbacks firing for
    // the replacement tab, `activeFolderTabId` briefly still pointed at the
    // just-deleted id — render()'s persist call in between could resurrect
    // the just-deleted entry from the (still-showing) live tree.
    // ----------------------------------------------------------------------
    const z1 = await uiOpenFolder(app, dir1);
    await wait(60);
    const z2 = await uiOpenFolder(app, dir2); // z2 is active
    await wait(60);
    const subRowZ = Array.from(document.querySelectorAll('.tree-row .tree-label')).find((el) => el.textContent === 'sub');
    const subIdZ = subRowZ?.closest('.tree-row')?.getAttribute('data-id');
    if (subIdZ) await tree.setExpanded(subIdZ, true); // give the ACTIVE tab (z2) distinctive state
    await wait(60);
    ft.removeTab(z2.id); // close the ACTIVE tab — z1 becomes active
    await wait(150); // let the replacement's activateFolderTab() settle
    let storedAfterActiveClose = null;
    try {
      storedAfterActiveClose = JSON.parse(localStorage.getItem('workbench:folder-tabs') || 'null');
    } catch {
      storedAfterActiveClose = null;
    }
    record(
      'V4P4-CLOSED-ACTIVE-TAB-STATE-NOT-PERSISTED',
      Boolean(storedAfterActiveClose) && !(z2.id in (storedAfterActiveClose.explorerState || {})),
      `Closing the ACTIVE tab z2 does not resurrect its entry in persisted explorerState (keys: ${JSON.stringify(Object.keys((storedAfterActiveClose && storedAfterActiveClose.explorerState) || {}))})`
    );
    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
    await wait(30);

    // ----------------------------------------------------------------------
    // A4 R2 Critical regression #2: switching away from a tab WHILE its own
    // restoreExpanded() is still awaiting a slow directory read must not let
    // that partial state overwrite its previously-saved complete snapshot.
    // ----------------------------------------------------------------------
    const slow1 = await uiOpenFolder(app, dir1);
    await wait(60);
    const subRowSlow = Array.from(document.querySelectorAll('.tree-row .tree-label')).find((el) => el.textContent === 'sub');
    const subIdSlow = subRowSlow?.closest('.tree-row')?.getAttribute('data-id');
    if (subIdSlow) await tree.setExpanded(subIdSlow, true);
    await wait(60);
    const fast1 = await uiOpenFolder(app, dir2); // slow1 is now saved with sub/ expanded
    await wait(60);
    const originalCreateRootNode = app.fsProvider.createRootNode.bind(app.fsProvider);
    app.fsProvider.createRootNode = async (p) => {
      if (p === slow1.path) await wait(200); // only slow1's own re-activation is delayed
      return originalCreateRootNode(p);
    };
    try {
      clickEl(rowFor(slow1.id)); // begins restoring slow1's saved (sub-expanded) state — does not await
      await wait(30); // still in flight: past createRootNode's delay start, restoreExpanded not yet running
      clickEl(rowFor(fast1.id)); // switch away from slow1 WHILE its restoration is incomplete
      await waitForCondition(() => tree.getRoot()?.id === fast1.path, 4000);
      await wait(150); // let any stray persistFolderTabs() calls from the switch settle
    } finally {
      app.fsProvider.createRootNode = originalCreateRootNode;
    }
    const slow1SavedAfterRace = app.explorerStateByTab ? app.explorerStateByTab.get(slow1.id) : undefined;
    record(
      'V4P4-OVERLAPPING-RESTORE-SAFE',
      Boolean(subIdSlow) && Boolean(slow1SavedAfterRace) && slow1SavedAfterRace.expandedIds.includes(subIdSlow),
      `Switching away mid-restore does not downgrade slow1's saved snapshot (still has sub/ expanded: ${JSON.stringify(slow1SavedAfterRace ? slow1SavedAfterRace.expandedIds : null)})`
    );
    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
    await wait(30);

    // ----------------------------------------------------------------------
    // A4 R3 Critical regression: an ABA race on the SAME tab. Switch to A,
    // away, then back to A again WHILE the FIRST re-entry's own
    // restoreExpanded() (delayed here, not createRootNode) is still in
    // flight. A tab-id-only compare-and-clear cannot tell the two A-entries
    // apart; a request-id-keyed one can.
    // ----------------------------------------------------------------------
    const reA = await uiOpenFolder(app, dir1);
    await wait(60);
    const subRowReA = Array.from(document.querySelectorAll('.tree-row .tree-label')).find((el) => el.textContent === 'sub');
    const subIdReA = subRowReA?.closest('.tree-row')?.getAttribute('data-id');
    if (subIdReA) await tree.setExpanded(subIdReA, true);
    await wait(60);
    const reB = await uiOpenFolder(app, dir2); // reA is now saved with sub/ expanded
    await wait(60);
    const originalGetChildren = app.fsProvider.getChildren.bind(app.fsProvider);
    let sawFirstReentry = false;
    app.fsProvider.getChildren = async (node) => {
      const p = node && node.data && node.data.path;
      if (p === subIdReA && !sawFirstReentry) {
        sawFirstReentry = true;
        await wait(300); // only the FIRST re-entry's reload of reA's sub/ children is slow
      }
      return originalGetChildren(node);
    };
    try {
      clickEl(rowFor(reA.id)); // 1st re-entry into reA: restoringTabId/reqId set, then blocks on the slow getChildren(sub) above
      await wait(60); // still inside the slow getChildren call
      clickEl(rowFor(reB.id)); // switch away — cancels the 1st re-entry via currentFolderRequestId
      await waitForCondition(() => tree.getRoot()?.id === reB.path, 4000);
      clickEl(rowFor(reA.id)); // 2nd re-entry into reA: a NEW reqId, same tab id as the 1st
      await waitForCondition(() => tree.getRoot()?.id === reA.path, 4000);
      await wait(500); // let the 1st (now-stale) re-entry's delayed getChildren finally resolve and hit its finally block
    } finally {
      app.fsProvider.getChildren = originalGetChildren;
    }
    const reASavedAfterAba = app.explorerStateByTab ? app.explorerStateByTab.get(reA.id) : undefined;
    record(
      'V4P4-SAME-TAB-REENTRANT-RESTORE-SAFE',
      Boolean(subIdReA) && Boolean(reASavedAfterAba) && reASavedAfterAba.expandedIds.includes(subIdReA),
      `An older, cancelled re-entry into reA finishing after a newer one started does not clear the newer one's guard or downgrade its snapshot (expandedIds: ${JSON.stringify(reASavedAfterAba ? reASavedAfterAba.expandedIds : null)})`
    );
    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
    await wait(30);

    // ----------------------------------------------------------------------
    // A4 R1 Critical regression: a saved COLLAPSED root must restore
    // collapsed, not silently re-expand back to setRoot()'s default.
    // ----------------------------------------------------------------------
    const r1 = await uiOpenFolder(app, dir1);
    await wait(60);
    await tree.setExpanded(r1.path, false); // collapse the root explicitly
    await wait(40);
    const r2 = await uiOpenFolder(app, dir2);
    await wait(60);
    clickEl(rowFor(r1.id));
    await waitForCondition(() => tree.getRoot()?.id === r1.path, 4000);
    await wait(100);
    record(
      'V4P4-COLLAPSED-ROOT-RESTORED',
      !tree.isExpanded(r1.path),
      `A saved collapsed root stays collapsed on restore (isExpanded=${tree.isExpanded(r1.path)})`
    );
    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
    await wait(30);

    const success = results.every((r) => r.pass);
    return { success, results };
  };

  // --------------------------------------------------------------------
  // Restart pair (WK-100/101): launch1 sets up real state through the real
  // UI, exits; launch2 (a fresh process, same isolated storage profile)
  // checks what came back.
  // --------------------------------------------------------------------
  window.__runV04Phase4Launch1Setup = async function (dir1, dir2, dir3) {
    const results = [];
    function record(id, pass, msg) {
      results.push({ id, pass: Boolean(pass), msg });
      console.log(`[TEST_ASSERT]${pass ? 'PASS' : 'FAIL'}|||${id}: ${msg}`);
    }
    const app = window.__workbenchApp;
    const tree = app.tree;
    const ft = app.folderTabs;

    const tabA = await uiOpenFolder(app, dir1);
    await wait(60);
    const tabB = await uiOpenFolder(app, dir2);
    await wait(60);
    const tabC = await uiOpenFolder(app, dir3);
    await wait(60);
    record('V4P4-L1-THREE-TABS', ft.getTabs().length === 3, `3 tabs open after launch1 setup (found ${ft.getTabs().length})`);

    // Reorder: drag tabA to the end -> [tabB, tabC, tabA].
    const rowA = rowFor(tabA.id);
    const rowC = rowFor(tabC.id);
    const startRect = rowA.getBoundingClientRect();
    const endRect = rowC.getBoundingClientRect();
    rowA.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: startRect.left + 10, clientY: startRect.top + startRect.height / 2, button: 0, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: startRect.left + 10, clientY: endRect.bottom + 5, pointerId: 1 }));
    await wait(30);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: startRect.left + 10, clientY: endRect.bottom + 5, pointerId: 1 }));
    await wait(60);
    record(
      'V4P4-L1-REORDERED',
      ft.getTabs().map((t) => t.id).join(',') === [tabB.id, tabC.id, tabA.id].join(','),
      `Order after drag is [B, C, A] (got ${ft.getTabs().map((t) => t.id).join(', ')})`
    );

    // Alias tabB.
    ft.setAlias(tabB.id, 'Bee');
    await wait(30);

    // Switch to tabC, expand its sub/ folder, select a file, scroll.
    clickEl(rowFor(tabC.id));
    await waitForCondition(() => tree.getRoot()?.id === tabC.path, 4000);
    await wait(80);
    const subRow = Array.from(document.querySelectorAll('.tree-row .tree-label')).find((el) => el.textContent === 'sub');
    const subId = subRow?.closest('.tree-row')?.getAttribute('data-id');
    if (subId) await tree.setExpanded(subId, true);
    await wait(60);
    const rows = Array.from(document.querySelectorAll('.tree-row[data-id]'));
    const fileRow = rows.find((r) => r.getAttribute('data-id') !== tree.getRoot().id);
    if (fileRow) clickEl(fileRow);
    await wait(40);
    record('V4P4-L1-C-EXPANDED', Boolean(subId) && tree.isExpanded(subId), "tabC's sub/ folder is expanded before restart");

    const listElC = document.querySelector('#sidebar-content .tree-list');
    if (listElC) listElC.scrollTop = 40;
    await wait(30);
    // The fixture has 60 root-level files specifically so this scroll must
    // stick — otherwise V4P4-L2-SCROLL-RESTORED below would pass vacuously
    // even with scroll persistence removed (A4 R1 Major finding).
    record('V4P4-L1-C-SCROLLED', Boolean(listElC) && listElC.scrollTop > 0, `tabC's list is actually scrolled before restart (scrollTop=${listElC ? listElC.scrollTop : 'n/a'})`);

    // Switch to tabA last — that is what launch2 should come back to.
    clickEl(rowFor(tabA.id));
    await waitForCondition(() => tree.getRoot()?.id === tabA.path, 4000);
    await wait(100);
    record('V4P4-L1-A-ACTIVE-LAST', ft.getActiveTab()?.id === tabA.id, 'tabA is the active tab when launch1 exits');

    const success = results.every((r) => r.pass);
    return { success, results };
  };

  window.__runV04Phase4Launch2Verify = async function (dir1, dir2, dir3) {
    const results = [];
    function record(id, pass, msg) {
      results.push({ id, pass: Boolean(pass), msg });
      console.log(`[TEST_ASSERT]${pass ? 'PASS' : 'FAIL'}|||${id}: ${msg}`);
    }
    const app = window.__workbenchApp;
    const tree = app.tree;
    const ft = app.folderTabs;

    const restored = await waitForCondition(() => ft.getTabs().length > 0, 6000);
    record('V4P4-L2-TABS-RESTORED', restored && ft.getTabs().length === 3, `3 tabs restored after restart (found ${ft.getTabs().length})`);

    const paths = ft.getTabs().map((t) => t.path);
    record(
      'V4P4-L2-ORDER-RESTORED',
      paths[0] === dir2 && paths[1] === dir3 && paths[2] === dir1,
      `Restored order is [B, C, A] by path (got ${JSON.stringify(paths)})`
    );

    const tabB = ft.getTabs().find((t) => t.path === dir2);
    record('V4P4-L2-ALIAS-RESTORED', tabB?.alias === 'Bee', `tabB's alias survived restart (got ${JSON.stringify(tabB?.alias)})`);

    await waitForCondition(() => tree.getRoot() !== null, 4000);
    await wait(100);
    const active = ft.getActiveTab();
    record(
      'V4P4-L2-ACTIVE-TAB-RESTORED',
      active?.path === dir1 && tree.getRoot()?.id === dir1,
      `The last-active tab (A) is active again and the Explorer shows it (got active path=${active?.path})`
    );

    // Switch to tabC and confirm its saved expansion/selection came back.
    const tabC = ft.getTabs().find((t) => t.path === dir3);
    clickEl(rowFor(tabC.id));
    await waitForCondition(() => tree.getRoot()?.id === tabC.path, 4000);
    await wait(150);
    const subRow = Array.from(document.querySelectorAll('.tree-row .tree-label')).find((el) => el.textContent === 'sub');
    const subId = subRow?.closest('.tree-row')?.getAttribute('data-id');
    record(
      'V4P4-L2-EXPANSION-RESTORED',
      Boolean(subId) && tree.isExpanded(subId),
      `tabC's sub/ folder is expanded again after restart (subId=${subId}, expanded=${subId ? tree.isExpanded(subId) : 'n/a'})`
    );
    record('V4P4-L2-SELECTION-RESTORED', tree.getSelectedIds().length > 0 && !tree.getSelectedIds().includes(tabC.path), `A non-root selection survived restart (${JSON.stringify(tree.getSelectedIds())})`);

    const listElC2 = document.querySelector('#sidebar-content .tree-list');
    record(
      'V4P4-L2-SCROLL-RESTORED',
      Boolean(listElC2) && listElC2.scrollTop > 0,
      `tabC's scroll position survived restart (scrollTop=${listElC2 ? listElC2.scrollTop : 'n/a'})`
    );

    const success = results.every((r) => r.pass);
    return { success, results };
  };
})();
