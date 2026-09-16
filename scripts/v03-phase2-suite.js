// v0.3 Phase 2 (tab close / drag reorder / inline rename / alias-slot
// interplay / rail scroll) in-browser suite. Injected into a real renderer
// (Electron or pywebview) by the matching runner. Judges what is actually on
// screen (measured rects/colours/DOM), not just internal state.
window.__runV03Phase2Suite = async function () {
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
  function rowFor(tabId) {
    return document.querySelector(`.foldertabs-tab[data-id="${tabId}"]`);
  }
  /**
   * getTabs() returns the controller's live backing array, not a copy — a
   * `for...of` directly over it while calling removeTab() (which splices
   * that same array) skips every other element as indices shift underneath
   * the iterator. Snapshot first.
   */
  function clearAllTabs(ft) {
    for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  }

  const app = window.__workbenchApp;
  const tree = app.tree;
  const ft = app.folderTabs;
  const dir1 = window.__testTmpDir;
  const dir2 = window.__testTmpDir2;
  const dir3 = window.__testTmpDir3;

  if (!dir1 || !dir2 || !dir3) {
    record('V3P2-FIXTURE', false, 'window.__testTmpDir/__testTmpDir2/__testTmpDir3 were not all provided by the runner');
    return { success: false, results };
  }
  record('V3P2-FIXTURE', true, '3 distinct real folders were provided');

  // ------------------------------------------------------------------------
  // 1. Close (hover ×) drops only the registration, not the filesystem, and
  //    keeps the active tab where D-4 says it must land.
  // ------------------------------------------------------------------------
  const tabA = ft.addTab(dir1);
  await wait(40);
  const tabB = ft.addTab(dir2);
  await wait(40);
  const tabC = ft.addTab(dir3);
  await wait(40);
  // Active is C (last added). Close a NON-active tab (A) — active must stay C.
  const rowA = rowFor(tabA.id);
  const closeBtnA = rowA?.querySelector('.foldertabs-tab-close');
  record('V3P2-CLOSE-BTN-EXISTS', Boolean(closeBtnA), 'Each tab row has a close (×) control');
  // Not just present in the DOM — actually hidden at rest, matching D-4's
  // "hover 시 ×를 보이고" (A2 R2 Major finding: a DOM-presence-only check
  // would also pass a control that is permanently visible) (실측 opacity).
  record(
    'V3P2-CLOSE-BTN-HIDDEN-AT-REST',
    parseFloat(getComputedStyle(closeBtnA).opacity) < 0.5,
    `Close control is not shown at rest (computed opacity=${getComputedStyle(closeBtnA).opacity})`
  );
  // Keyboard: Enter on the focused × must not bubble to the row's own
  // keydown handler and activate the tab instead (A2 R2 Major finding).
  // A synthetic KeyboardEvent does not make the browser auto-click a real
  // <button> the way a trusted keypress would, so this checks the
  // propagation fix directly: if it bubbled, the row's handler would
  // preventDefault() and activate tabA.
  const activeBeforeKeydown = ft.getActiveTab()?.id;
  closeBtnA.focus();
  closeBtnA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(40);
  record(
    'V3P2-CLOSE-BTN-KEYBOARD',
    ft.getActiveTab()?.id === activeBeforeKeydown && ft.getTabs().some((t) => t.id === tabA.id),
    "Enter on the focused × does not bubble to the row and activate that tab (active tab stays unchanged, tabA isn't closed by this alone)"
  );

  // Now actually close it by click (what a real Enter/Space press would end
  // up doing via the button's own native activation).
  clickEl(closeBtnA);
  await wait(60);
  record(
    'V3P2-CLOSE-INACTIVE-KEEPS-ACTIVE',
    ft.getActiveTab()?.id === tabC.id && ft.getTabs().length === 2 && !ft.getTabs().some((t) => t.id === tabA.id),
    'Closing a non-active tab removes only its registration; the active tab is unchanged'
  );

  // Path A must still exist on disk — closing a tab never touches the filesystem (D-4, D-9).
  const stillExists = await app.fsProvider.pathExists(dir1);
  record('V3P2-CLOSE-NO-FS-CHANGE', stillExists, "Closing tab A's registration left the real directory on disk untouched");

  // Now close the ACTIVE tab (C). Only B remains -> B must become active (no tab below C, so the one above).
  const rowC = rowFor(tabC.id);
  clickEl(rowC.querySelector('.foldertabs-tab-close'));
  await wait(60);
  record(
    'V3P2-CLOSE-ACTIVE-PICKS-NEIGHBOR',
    ft.getActiveTab()?.id === tabB.id && tree.getRoot()?.id === tabB.path,
    'Closing the active tab (last in the rail) activates the one above it, and the Explorer follows'
  );

  // Close the last remaining tab -> 0 tabs, no active tab, Explorer back to its pre-open empty state.
  clickEl(rowFor(tabB.id).querySelector('.foldertabs-tab-close'));
  await wait(60);
  record(
    'V3P2-CLOSE-LAST-EMPTIES',
    ft.getTabs().length === 0 && ft.getActiveTab() === null && tree.getRoot() === null,
    'Closing the last tab leaves 0 active tabs and returns the Explorer to its empty state'
  );

  // ------------------------------------------------------------------------
  // 2. "바로 아래 탭이 활성" — closing an active tab that has one BELOW it.
  // ------------------------------------------------------------------------
  const x = ft.addTab(dir1);
  await wait(30);
  const y = ft.addTab(dir2);
  await wait(30);
  const z = ft.addTab(dir3);
  await wait(30);
  // Activate the MIDDLE one (y), then close it — the one below (z) must become active.
  ft.activateTab(y.id);
  await wait(30);
  clickEl(rowFor(y.id).querySelector('.foldertabs-tab-close'));
  await wait(60);
  record(
    'V3P2-CLOSE-ACTIVE-PICKS-BELOW',
    ft.getActiveTab()?.id === z.id && tree.getRoot()?.id === z.path,
    "Closing an active MIDDLE tab activates the one below it (D-4: '바로 아래 탭')"
  );
  // Clean up for the rest of the suite.
  clearAllTabs(ft);
  await wait(30);

  // ------------------------------------------------------------------------
  // 3. Vertical drag reorder, with a visible drop indicator mid-drag.
  // ------------------------------------------------------------------------
  const d1 = ft.addTab(dir1);
  await wait(30);
  const d2 = ft.addTab(dir2);
  await wait(30);
  const d3 = ft.addTab(dir3);
  await wait(30);
  record(
    'V3P2-DRAG-INITIAL-ORDER',
    ft.getTabs().map((t) => t.id).join(',') === [d1.id, d2.id, d3.id].join(','),
    'Tabs start in add order (d1, d2, d3)'
  );

  const rowD1 = rowFor(d1.id);
  const rowD3 = rowFor(d3.id);
  const startRect = rowD1.getBoundingClientRect();
  const endRect = rowD3.getBoundingClientRect();
  const startPoint = { x: startRect.left + 10, y: startRect.top + startRect.height / 2 };

  rowD1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: startPoint.x, clientY: startPoint.y, button: 0, pointerId: 1 }));
  // Move past the drag threshold, first roughly to d3's row (should show a drop indicator).
  const midY = endRect.top + endRect.height / 2;
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: startPoint.x, clientY: midY, pointerId: 1 }));
  await wait(30);
  const indicatorShown = document.querySelector('.foldertabs-tab.drop-before, .foldertabs-tab.drop-after');
  // A class name alone proves nothing about what's on screen — check the
  // computed box-shadow the class is supposed to draw is actually non-empty
  // (A2 R2 Major finding: "DOM-presence false positive").
  const indicatorBoxShadow = indicatorShown ? getComputedStyle(indicatorShown).boxShadow : 'none';
  record(
    'V3P2-DRAG-SHOWS-INDICATOR',
    Boolean(indicatorShown) && indicatorBoxShadow !== 'none' && indicatorBoxShadow !== '',
    `A drop-position indicator is visible on screen mid-drag (computed box-shadow="${indicatorBoxShadow}")`
  );

  // Drop below d3's row entirely -> d1 should end up LAST.
  const belowY = endRect.bottom + 5;
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: startPoint.x, clientY: belowY, pointerId: 1 }));
  await wait(30);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: startPoint.x, clientY: belowY, pointerId: 1 }));
  await wait(60);

  record(
    'V3P2-DRAG-REORDERS',
    ft.getTabs().map((t) => t.id).join(',') === [d2.id, d3.id, d1.id].join(','),
    `Dragging d1 below d3 reorders to [d2, d3, d1] (got [${ft.getTabs().map((t) => t.id).join(', ')}])`
  );
  record(
    'V3P2-DRAG-INDICATOR-CLEARED',
    document.querySelectorAll('.foldertabs-tab.drop-before, .foldertabs-tab.drop-after').length === 0,
    'The drop indicator is gone after the drop completes'
  );

  // pointercancel must discard the drag WITHOUT reordering — an unhandled
  // cancel used to leave the rail armed for a later, unrelated pointerup to
  // commit a stale drop target (A2 R1 Major finding).
  const orderBeforeCancel = ft.getTabs().map((t) => t.id).join(',');
  const rowFirst = rowFor(ft.getTabs()[0].id);
  const rowLast = rowFor(ft.getTabs()[ft.getTabs().length - 1].id);
  const cancelStart = rowFirst.getBoundingClientRect();
  const cancelEnd = rowLast.getBoundingClientRect();
  rowFirst.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cancelStart.left + 10, clientY: cancelStart.top + cancelStart.height / 2, button: 0, pointerId: 2 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cancelStart.left + 10, clientY: cancelEnd.bottom - 2, pointerId: 2 }));
  await wait(30);
  window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
  await wait(30);
  // A later, unrelated pointerup (different pointerId, arbitrary location) must not commit anything.
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5, pointerId: 99 }));
  await wait(30);
  record(
    'V3P2-DRAG-CANCEL-NO-REORDER',
    ft.getTabs().map((t) => t.id).join(',') === orderBeforeCancel &&
      document.querySelectorAll('.foldertabs-tab.drop-before, .foldertabs-tab.drop-after').length === 0,
    'pointercancel discards the drag with no reorder, and a later unrelated pointerup does not resurrect it'
  );

  // Dropping outside the rail's own box (e.g. over the Explorer/editor) must not reorder.
  const orderBeforeOutside = ft.getTabs().map((t) => t.id).join(',');
  const railRectForTest = document.getElementById('foldertabs-list').getBoundingClientRect();
  const outsideRow = rowFor(ft.getTabs()[0].id);
  const outsideStart = outsideRow.getBoundingClientRect();
  outsideRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: outsideStart.left + 10, clientY: outsideStart.top + outsideStart.height / 2, button: 0, pointerId: 3 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: railRectForTest.right + 200, clientY: outsideStart.top, pointerId: 3 }));
  await wait(30);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: railRectForTest.right + 200, clientY: outsideStart.top, pointerId: 3 }));
  await wait(30);
  record(
    'V3P2-DRAG-OUTSIDE-RAIL-NO-REORDER',
    ft.getTabs().map((t) => t.id).join(',') === orderBeforeOutside,
    'Releasing the drag outside the rail (over the Explorer/editor) does not reorder anything'
  );

  clearAllTabs(ft);
  await wait(30);

  // ------------------------------------------------------------------------
  // 4. Inline rename: header icon opens an input row on the ACTIVE tab only;
  //    Enter saves, Escape cancels, F2 is not bound.
  // ------------------------------------------------------------------------
  const renameBtn = document.getElementById('foldertabs-rename-btn');
  record('V3P2-RENAME-DISABLED-EMPTY', renameBtn.disabled, 'Rename Folder Tab is disabled with 0 tabs');

  const r1 = ft.addTab(dir1);
  await wait(40);
  record('V3P2-RENAME-ENABLED-ACTIVE', !renameBtn.disabled, 'Rename Folder Tab enables once a tab is active');

  clickEl(renameBtn);
  await wait(60);
  const inputEl = rowFor(r1.id)?.querySelector('.foldertabs-tab-rename-input');
  record('V3P2-RENAME-OPENS-INPUT', Boolean(inputEl), 'Clicking Rename Folder Tab opens an inline input on the active tab row');

  // F2 must NOT be bound to rename (D-4) — dispatch it and confirm nothing changed.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true, cancelable: true }));
  await wait(40);
  const inputStillThereAfterF2 = rowFor(r1.id)?.querySelector('.foldertabs-tab-rename-input');
  record('V3P2-F2-NOT-BOUND', Boolean(inputStillThereAfterF2), 'F2 does not start (or otherwise disturb) a rename — it stays reserved for the app view (D-4)');

  // Escape cancels: no alias applied.
  inputStillThereAfterF2.value = 'should not stick';
  inputStillThereAfterF2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await wait(40);
  record(
    'V3P2-RENAME-ESCAPE-CANCELS',
    r1.alias === null && !rowFor(r1.id).querySelector('.foldertabs-tab-rename-input'),
    'Escape closes the input and leaves the alias untouched'
  );

  // Enter saves.
  clickEl(renameBtn);
  await wait(40);
  const inputEl2 = rowFor(r1.id).querySelector('.foldertabs-tab-rename-input');
  inputEl2.value = 'My Alias';
  inputEl2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(40);
  record(
    'V3P2-RENAME-ENTER-SAVES',
    r1.alias === 'My Alias' && rowFor(r1.id)?.querySelector('.foldertabs-tab-label')?.textContent === 'My Alias',
    'Enter saves the alias and the tab row shows it immediately'
  );

  // The path itself is untouched by the alias (D-4).
  record('V3P2-ALIAS-KEEPS-PATH', r1.path === ft.getTabById(r1.id).path && r1.path.includes(dir1.replace(/[/\\]+$/, '')), 'Setting an alias does not change the tab\'s underlying path');

  clearAllTabs(ft);
  await wait(30);

  // Confirming the prefilled value UNCHANGED must not turn an auto "(N)"
  // name into a sticky alias — otherwise the freed slot lets a later
  // same-path tab show the exact same text (A2 R1 Major finding).
  const q1 = ft.addTab(dir1);
  await wait(30);
  const q2 = ft.addTab(dir1); // "(2)"
  await wait(30);
  const q2NameBefore = ft.displayName(q2);
  ft.beginRename(q2.id);
  await wait(40);
  const q2Input = rowFor(q2.id).querySelector('.foldertabs-tab-rename-input');
  // Do not touch .value — Enter fires on the prefilled text, unchanged.
  q2Input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(40);
  const q3 = ft.addTab(dir1); // same path again
  await wait(30);
  record(
    'V3P2-RENAME-CONFIRM-UNCHANGED-NO-ALIAS',
    q2.alias === null && ft.displayName(q2) === q2NameBefore && ft.displayName(q3) !== ft.displayName(q2),
    `Enter on an untouched prefill does not create an alias (q2.alias=${JSON.stringify(q2.alias)}, q2="${ft.displayName(q2)}", q3="${ft.displayName(q3)}")`
  );
  clearAllTabs(ft);
  await wait(30);

  // The close (×) control stays available on the row being renamed (A2 R1
  // Minor finding), and typing a draft survives an unrelated re-render.
  const s1 = ft.addTab(dir1);
  await wait(30);
  const s2 = ft.addTab(dir2);
  await wait(30);
  ft.beginRename(s2.id);
  await wait(40);
  const s2Row = rowFor(s2.id);
  record('V3P2-RENAME-CLOSE-BTN-AVAILABLE', Boolean(s2Row.querySelector('.foldertabs-tab-close')), 'The row being renamed still exposes its close (×) control');

  const s2Input = s2Row.querySelector('.foldertabs-tab-rename-input');
  s2Input.value = 'Unsaved Draft';
  s2Input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(30);
  // An unrelated action (closing the OTHER tab) forces a re-render.
  clickEl(rowFor(s1.id).querySelector('.foldertabs-tab-close'));
  await wait(60);
  const s2InputAfter = rowFor(s2.id)?.querySelector('.foldertabs-tab-rename-input');
  record(
    'V3P2-RENAME-DRAFT-SURVIVES-EXTERNAL-RENDER',
    Boolean(s2InputAfter) && s2InputAfter.value === 'Unsaved Draft',
    `An unrelated re-render (closing a different tab) does not erase the in-progress rename draft (got value=${JSON.stringify(s2InputAfter ? s2InputAfter.value : null)})`
  );
  s2InputAfter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await wait(30);
  clearAllTabs(ft);
  await wait(30);

  // ------------------------------------------------------------------------
  // 5. Alias <-> (N) slot interplay (D-3, D-4, WK-091).
  // ------------------------------------------------------------------------
  const p1 = ft.addTab(dir1);
  await wait(30);
  const p2 = ft.addTab(dir1); // same path -> should be "(2)"
  await wait(30);
  record('V3P2-SLOT-BASELINE', ft.displayName(p1) === ft.displayName(p1).replace(/ \(\d+\)$/, '') && ft.displayName(p2).endsWith('(2)'), `Baseline: p1="${ft.displayName(p1)}", p2="${ft.displayName(p2)}"`);

  // Alias p2 -> it gives up slot 2 immediately.
  ft.setAlias(p2.id, 'Second Copy');
  await wait(30);
  const p3 = ft.addTab(dir1); // same path again -> should reuse freed slot "(2)", not "(3)"
  await wait(30);
  record(
    'V3P2-ALIAS-FREES-SLOT',
    ft.displayName(p3) === `${ft.displayName(p3).replace(/ \(\d+\)$/, '')} (2)`,
    `A new same-path tab reuses the slot an aliased tab gave up immediately (got "${ft.displayName(p3)}")`
  );

  // Clearing p2's alias re-acquires the SMALLEST FREE slot at that moment — which is now 3 (1 and 2 are taken).
  ft.setAlias(p2.id, '');
  await wait(30);
  record(
    'V3P2-ALIAS-CLEAR-REACQUIRES',
    ft.displayName(p2).endsWith('(3)'),
    `Clearing the alias re-acquires the smallest slot free NOW (expected "(3)", got "${ft.displayName(p2)}")`
  );

  clearAllTabs(ft);
  await wait(30);

  // ------------------------------------------------------------------------
  // 6. Rail scroll: many tabs overflow the rail's own vertical space, and
  //    ONLY the rail scrolls (not the whole page).
  // ------------------------------------------------------------------------
  const manyDirs = [dir1, dir2, dir3];
  const TAB_COUNT = 80; // comfortably more than any plausible rail height / 28px row
  for (let i = 0; i < TAB_COUNT; i++) {
    ft.addTab(manyDirs[i % manyDirs.length]);
  }
  await wait(80);
  const listEl = document.getElementById('foldertabs-list');
  record(
    'V3P2-RAIL-OVERFLOWS',
    listEl.scrollHeight > listEl.clientHeight,
    `${TAB_COUNT} tabs overflow the rail's own box (scrollHeight=${listEl.scrollHeight}, clientHeight=${listEl.clientHeight})`
  );
  const beforeScrollTop = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
  listEl.scrollTop = 50;
  await wait(30);
  record(
    'V3P2-RAIL-SCROLLS-INDEPENDENTLY',
    listEl.scrollTop > 0 && (!document.scrollingElement || document.scrollingElement.scrollTop === beforeScrollTop),
    `Scrolling the rail moves only the rail (listEl.scrollTop=${listEl.scrollTop}), not the page`
  );

  clearAllTabs(ft);
  await wait(30);

  // ------------------------------------------------------------------------
  // 7. Closing the last tab while its folder is still loading must not leave
  //    "Opening folder: …" stuck forever (A2 R1 Major finding).
  // ------------------------------------------------------------------------
  const originalCreateRootNode = app.fsProvider.createRootNode.bind(app.fsProvider);
  app.fsProvider.createRootNode = async (p) => {
    await wait(150); // simulate a slow directory read
    return originalCreateRootNode(p);
  };
  try {
    const slow = ft.addTab(dir1); // starts loading, does not await
    await wait(20); // still in flight
    ft.removeTab(slow.id); // close the only tab before the load resolves
    await wait(250); // let the delayed load resolve/return-early
    record(
      'V3P2-CLOSE-DURING-LOAD-CLEARS-PROGRESS',
      !app.statusMessages.isProgressActive() && ft.getTabs().length === 0 && tree.getRoot() === null,
      `Closing the only (loading) tab leaves no stuck progress (isProgressActive=${app.statusMessages.isProgressActive()})`
    );
  } finally {
    app.fsProvider.createRootNode = originalCreateRootNode;
  }

  const success = results.every((r) => r.pass);
  return { success, results };
};
