// v0.3 Phase 5 (사라진 경로의 오류 상태 — WK-102~104) in-browser suite. Injected
// into a real renderer (Electron or pywebview) by the matching runner. Judges
// what is actually on screen (measured classes/icons/DOM), not just internal
// flags.
window.__runV05Phase5Suite = async function () {
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
  async function waitForCondition(fn, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 4000);
    while (Date.now() < deadline) {
      if (fn()) return true;
      await wait(20);
    }
    return fn();
  }

  const app = window.__workbenchApp;
  const tree = app.tree;
  const ft = app.folderTabs;
  // Defensive isolation — see v03-phase{1,2,3}-suite.js's identical comment.
  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }

  const dir1 = window.__testTmpDir;
  const dir2 = window.__testTmpDir2;
  const deadDir = window.__testDeadDir; // a path that does NOT exist on disk

  if (!dir1 || !dir2 || !deadDir) {
    record('V5P5-FIXTURE', false, 'window.__testTmpDir/__testTmpDir2/__testDeadDir were not all provided by the runner');
    return { success: false, results };
  }
  record('V5P5-FIXTURE', true, '2 real folders and 1 confirmed-nonexistent path were provided');

  // ------------------------------------------------------------------------
  // 1. Activating a dead path shows error state — measured, not just a flag
  //    — and the tab is NOT auto-removed (D-6).
  // ------------------------------------------------------------------------
  const good1 = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === good1.path, 4000);
  await wait(60);
  const countBeforeDead = ft.getTabs().length;
  const dead1 = ft.addTab(deadDir);
  await wait(200); // let the failed createRootNode settle
  record('V5P5-DEAD-TAB-NOT-REMOVED', ft.getTabs().length === countBeforeDead + 1 && ft.getTabs().some((t) => t.id === dead1.id), `The tab for a dead path stays registered (count: ${ft.getTabs().length})`);
  record('V5P5-DEAD-TAB-HAS-ERROR', typeof dead1 === 'object' && ft.getTabById(dead1.id)?.error != null, `The tab's error field is set (error=${JSON.stringify(ft.getTabById(dead1.id)?.error)})`);

  const deadRow = rowFor(dead1.id);
  record('V5P5-DEAD-ROW-ERROR-CLASS', Boolean(deadRow?.classList.contains('error')), 'The row itself carries the .error class');
  record('V5P5-DEAD-ROW-WARNING-ICON', Boolean(deadRow?.querySelector('.codicon-warning')), 'The row shows a warning glyph instead of a folder icon');
  record('V5P5-DEAD-ROW-TITLE-IS-ERROR', Boolean(deadRow?.getAttribute('title')) && deadRow.getAttribute('title') !== deadDir, `The row's tooltip is the error message, not just the raw path (title=${JSON.stringify(deadRow?.getAttribute('title'))})`);

  // Explorer itself goes back to empty — nothing valid to show for this tab.
  record('V5P5-EXPLORER-EMPTY-ON-ERROR', tree.getRoot() === null, 'The Explorer returns to its empty state when the active tab fails to open');

  // ------------------------------------------------------------------------
  // 2. An error tab does not block the rest of the app (D-6, WK-104) —
  //    switching to a healthy tab still works normally.
  // ------------------------------------------------------------------------
  clickEl(rowFor(good1.id));
  await waitForCondition(() => tree.getRoot()?.id === good1.path, 4000);
  await wait(60);
  record('V5P5-OTHER-TABS-STILL-WORK', tree.getRoot()?.id === good1.path, "Switching to a healthy tab works normally while an error tab exists (WK-104)");

  // ------------------------------------------------------------------------
  // 3. "Locate Folder…" re-points the SAME tab (same id) and clears the
  //    error once the new path loads (D-6, WK-103) — never touches the
  //    filesystem itself (only a native OS picker + a read).
  // ------------------------------------------------------------------------
  const relocateBtn = rowFor(dead1.id)?.querySelector('.foldertabs-tab-relocate');
  record('V5P5-RELOCATE-BTN-EXISTS', Boolean(relocateBtn), 'The error tab shows a "Locate Folder…" control');

  window.__nextDialogPath = dir2;
  clickEl(relocateBtn);
  await waitForCondition(() => ft.getTabById(dead1.id)?.path === dir2, 4000);
  await wait(150);
  delete window.__nextDialogPath;

  const relocated = ft.getTabById(dead1.id);
  record('V5P5-RELOCATE-SAME-TAB-ID', Boolean(relocated) && relocated.path === dir2, `Locate Folder updates the SAME tab's path (id unchanged: ${dead1.id}, new path: ${relocated ? relocated.path : 'n/a'})`);
  record('V5P5-RELOCATE-CLEARS-ERROR', Boolean(relocated) && relocated.error === null, `The error clears once the new path loads successfully (error=${JSON.stringify(relocated ? relocated.error : 'n/a')})`);
  record('V5P5-RELOCATE-LOADS-NEW-PATH', tree.getRoot()?.id === dir2, 'The Explorer shows the newly located folder');
  const relocatedRow = rowFor(dead1.id);
  record('V5P5-RELOCATE-ROW-CLEARS-ERROR-CLASS', Boolean(relocatedRow) && !relocatedRow.classList.contains('error'), "The row's .error class and warning icon are gone after a successful relocate");

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  await wait(30);

  // ------------------------------------------------------------------------
  // 3b. Relocating an INACTIVE error tab must sync the rail's highlight to
  //     it too — not just move the Explorer root while a different tab
  //     stays visually marked active (A5 R1 Major finding).
  // ------------------------------------------------------------------------
  const aTab = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === aTab.path, 4000);
  await wait(60);
  const bTab = ft.addTab(deadDir); // active now, and errored
  await wait(200);
  clickEl(rowFor(aTab.id)); // switch back to A — B is inactive but still has an error
  await waitForCondition(() => tree.getRoot()?.id === aTab.path, 4000);
  await wait(60);
  record('V5P5-INACTIVE-B-HAS-ERROR-BEFORE-RELOCATE', ft.getTabById(bTab.id)?.error != null, "(setup) B still has an error while A is active");

  const relocateBtnB = rowFor(bTab.id)?.querySelector('.foldertabs-tab-relocate');
  window.__nextDialogPath = dir2;
  clickEl(relocateBtnB); // relocate INACTIVE tab B
  await waitForCondition(() => ft.getTabById(bTab.id)?.path === dir2, 4000);
  await wait(150);
  delete window.__nextDialogPath;

  record(
    'V5P5-RELOCATE-INACTIVE-SYNCS-RAIL',
    ft.getActiveTab()?.id === bTab.id,
    `Relocating inactive tab B makes it the rail's active tab too (active id: ${ft.getActiveTab()?.id})`
  );
  record(
    'V5P5-RELOCATE-INACTIVE-SYNCS-EXPLORER',
    tree.getRoot()?.id === dir2,
    'The Explorer follows the same tab the rail now highlights'
  );
  const activeRowsAfterRelocate = document.querySelectorAll('.foldertabs-tab.active');
  record(
    'V5P5-RELOCATE-INACTIVE-ONE-ACTIVE-ROW',
    activeRowsAfterRelocate.length === 1 && activeRowsAfterRelocate[0].getAttribute('data-id') === bTab.id,
    `Exactly one row is marked active, and it is B's (found ${activeRowsAfterRelocate.length})`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  await wait(30);

  // ------------------------------------------------------------------------
  // 3c. Relocating to a path that is ALSO dead must not crash, remove the
  //     tab, or leave it silently looking healthy.
  // ------------------------------------------------------------------------
  const stillBad1 = ft.addTab(deadDir);
  await wait(200);
  const alsoDeadPath = deadDir + '-also-dead-xyz';
  window.__nextDialogPath = alsoDeadPath;
  const relocateBtnStillBad = rowFor(stillBad1.id)?.querySelector('.foldertabs-tab-relocate');
  clickEl(relocateBtnStillBad);
  await waitForCondition(() => ft.getTabById(stillBad1.id)?.path === alsoDeadPath, 4000);
  await wait(200);
  delete window.__nextDialogPath;
  record(
    'V5P5-RELOCATE-TO-ANOTHER-DEAD-PATH-STILL-ERRORS',
    ft.getTabs().some((t) => t.id === stillBad1.id) && ft.getTabById(stillBad1.id)?.error != null,
    `Relocating to a path that is ALSO dead keeps the tab registered with a (new) error (error=${JSON.stringify(ft.getTabById(stillBad1.id)?.error)})`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  await wait(30);

  // ------------------------------------------------------------------------
  // 4. Closing an error tab still works (D-6: "탭을 닫을 수 있다") — real
  //    filesystem is still untouched throughout all of this.
  // ------------------------------------------------------------------------
  const dead2 = ft.addTab(deadDir);
  await wait(200);
  const countBeforeClose = ft.getTabs().length;
  const closeBtn = rowFor(dead2.id)?.querySelector('.foldertabs-tab-close');
  clickEl(closeBtn);
  await wait(80);
  record('V5P5-CLOSE-ERROR-TAB', ft.getTabs().length === countBeforeClose - 1 && !ft.getTabs().some((t) => t.id === dead2.id), 'An error tab can still be closed with the normal × control');

  const stillExists1 = await app.fsProvider.pathExists(dir1);
  const stillExists2 = await app.fsProvider.pathExists(dir2);
  record('V5P5-NO-FILESYSTEM-MUTATION', stillExists1 && stillExists2, 'Neither real directory was created, deleted, or moved by any of the above (D-9)');

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  await wait(30);

  // ------------------------------------------------------------------------
  // 5. restoreTabs() must unconditionally clear a persisted error, not
  //    carry a STALE one forward from before the restart (A5 R1 Major
  //    finding: `t.error ?? null` preserved an old error string verbatim).
  // ------------------------------------------------------------------------
  const craftedTabs = [
    { id: 'ft-crafted-1', path: dir1, numberSlot: 1, alias: null, error: 'a stale error from before restart' },
  ];
  ft.restoreTabs(craftedTabs, 'ft-crafted-1');
  await wait(30);
  record(
    'V5P5-RESTORE-CLEARS-STALE-ERROR',
    ft.getTabById('ft-crafted-1')?.error === null,
    `restoreTabs() clears a persisted error unconditionally, not just undefined/null (error=${JSON.stringify(ft.getTabById('ft-crafted-1')?.error)})`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  await wait(30);

  const success = results.every((r) => r.pass);
  return { success, results };
};
