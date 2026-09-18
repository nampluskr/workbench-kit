// v0.3 Phase 6 (에디터 전환 모드 — Shared Editor / Folder Workspace, WK-105~109)
// in-browser suite. Injected into a real renderer (Electron or pywebview) by
// the matching runner. Judges what is actually on screen (measured DOM/
// dockview state), not just internal flags.
window.__runV06Phase6Suite = async function () {
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
  function closeMenu() {
    const hamburger = document.getElementById('menu-hamburger-btn');
    if (document.getElementById('workbench-menu-dropdown')) clickEl(hamburger);
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
  const editor = app.editor;

  // Defensive isolation — see v03-phase{1,2,3}-suite.js's identical comment.
  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  editor.clear();
  if (typeof app.setEditorMode === 'function') app.setEditorMode('workspace');

  const dir1 = window.__testTmpDir;
  const dir2 = window.__testTmpDir2;
  if (!dir1 || !dir2) {
    record('V6P6-FIXTURE', false, 'window.__testTmpDir/__testTmpDir2 were not both provided by the runner');
    return { success: false, results };
  }
  record('V6P6-FIXTURE', true, '2 real folders were provided');

  // ------------------------------------------------------------------------
  // 1. View > Layout has one positive Workspace per Folder setting. It starts
  //    enabled and has no dedicated shortcut.
  // ------------------------------------------------------------------------
  record('V6P6-MODE-STARTS-WORKSPACE', app.getEditorMode() === 'workspace', 'Workspace per Folder is enabled by default');

  const hamburger = document.getElementById('menu-hamburger-btn');
  clickEl(hamburger);
  await wait(30);
  const viewCatRow = document.querySelector('.menu-category-row[data-category-id="view"]');
  if (viewCatRow) clickEl(viewCatRow);
  await wait(60);
  const workspaceRow = document.querySelector('.menu-item-row[data-item-id="view:editor-mode-workspace"]');
  const sharedRow = document.querySelector('.menu-item-row[data-item-id="view:editor-mode-shared"]');
  record('V6P6-MENU-ROWS-EXIST', !sharedRow && Boolean(workspaceRow), 'Only the "Workspace per Folder" mode row exists');
  record(
    'V6P6-WORKSPACE-CHECKED-INITIALLY',
    Boolean(workspaceRow?.querySelector('.menu-item-check .codicon-check')),
    '"Workspace per Folder" is checked while the per-folder mode is active'
  );
  record('V6P6-NO-SHORTCUT', !workspaceRow?.querySelector('.menu-item-shortcut'), 'The mode setting has no dedicated shortcut');
  closeMenu();
  await wait(30);
  app.setEditorMode('shared');

  // ------------------------------------------------------------------------
  // 2. Shared Editor: switching folder tabs leaves editor tabs/active/split
  //    completely untouched (D-7).
  // ------------------------------------------------------------------------
  const tabA = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === tabA.path, 4000);
  await wait(60);
  editor.clear();
  const sharedPanel = editor.addNewTab();
  await wait(40);
  const panelCountBeforeSwitch = editor.getPanelCount();
  const activePanelIdBeforeSwitch = editor.getActivePanel()?.id;

  const tabB = ft.addTab(dir2);
  await waitForCondition(() => tree.getRoot()?.id === tabB.path, 4000);
  await wait(80);
  record(
    'V6P6-SHARED-EDITOR-UNCHANGED-ON-SWITCH',
    editor.getPanelCount() === panelCountBeforeSwitch && editor.getActivePanel()?.id === activePanelIdBeforeSwitch,
    `Switching folder tabs in Shared Editor mode leaves the editor exactly as it was (panels: ${editor.getPanelCount()}, active: ${editor.getActivePanel()?.id})`
  );

  clickEl(rowFor(tabA.id));
  await waitForCondition(() => tree.getRoot()?.id === tabA.path, 4000);
  await wait(60);
  record(
    'V6P6-SHARED-EDITOR-SAME-ACROSS-BOTH-TABS',
    editor.getActivePanel()?.id === sharedPanel.id,
    'The SAME editor tab is visible regardless of which folder tab is active in Shared Editor mode'
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  editor.clear();
  await wait(30);

  // ------------------------------------------------------------------------
  // 3. Switching to Folder Workspace mode: the currently visible Shared
  //    Editor content becomes the active folder tab's INITIAL workspace,
  //    and does not disappear (v0.3 D-8's explicit first-switch rule).
  // ------------------------------------------------------------------------
  const wA = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === wA.path, 4000);
  await wait(60);
  editor.clear();
  const seedPanel = editor.addNewTab();
  await wait(40);

  app.setEditorMode('workspace');
  await wait(60);
  record('V6P6-MODE-SWITCH-TO-WORKSPACE', app.getEditorMode() === 'workspace', 'setEditorMode("workspace") actually switches the mode');
  record(
    'V6P6-FIRST-WORKSPACE-SEEDED-FROM-SHARED',
    editor.getPanelCount() === 1 && editor.getActivePanel()?.id === seedPanel.id,
    "The active tab's first-ever Folder Workspace entry keeps showing what Shared Editor had (D-8), not an empty editor"
  );

  // ------------------------------------------------------------------------
  // 4. Folder Workspace: switching folder tabs swaps editor tabs/active/
  //    split independently per tab (v0.3 D-7, WK-107) — a NEW tab (never
  //    visited under Workspace mode) starts with an empty editor, not
  //    wA's content.
  // ------------------------------------------------------------------------
  const wB = ft.addTab(dir2);
  await waitForCondition(() => tree.getRoot()?.id === wB.path, 4000);
  await wait(80);
  record(
    'V6P6-NEW-WORKSPACE-TAB-STARTS-EMPTY',
    editor.getPanelCount() === 0,
    `A folder tab visited for the first time under Folder Workspace mode starts with an empty editor (found ${editor.getPanelCount()} panels)`
  );

  const wBPanel1 = editor.addNewTab();
  await wait(30);
  const wBPanel2 = editor.addNewTab();
  await wait(40);
  const wBGroup1 = editor.getActiveGroup();
  const wBGroup2 = wBGroup1 ? editor.splitGroupForUser(wBGroup1, 'right') : undefined;
  await wait(60);
  const wBGroupCountBeforeSwitch = editor.getGroupCount();
  record('V6P6-WORKSPACE-B-HAS-SPLIT', wBGroupCountBeforeSwitch === 2, `tab B's workspace has 2 groups (split) before switching away (found ${wBGroupCountBeforeSwitch})`);

  clickEl(rowFor(wA.id)); // back to A — must show wA's own (seeded) workspace, not B's
  await waitForCondition(() => tree.getRoot()?.id === wA.path, 4000);
  await wait(100);
  record(
    'V6P6-SWITCH-RESTORES-A-WORKSPACE',
    editor.getPanelCount() === 1 && editor.getActivePanel()?.id === seedPanel.id && editor.getGroupCount() === 1,
    `Switching back to A restores its own workspace (1 panel, 1 group) — got ${editor.getPanelCount()} panels, ${editor.getGroupCount()} groups`
  );

  clickEl(rowFor(wB.id)); // to B again — must restore the split layout
  await waitForCondition(() => tree.getRoot()?.id === wB.path, 4000);
  await wait(100);
  record(
    'V6P6-SWITCH-RESTORES-B-SPLIT-LAYOUT',
    editor.getGroupCount() === 2 && editor.getPanelCount() === 2,
    `Switching back to B restores its 2-group split layout (got ${editor.getGroupCount()} groups, ${editor.getPanelCount()} panels)`
  );

  // ------------------------------------------------------------------------
  // 5. Mode switch back to Shared Editor restores whatever Shared Editor
  //    was showing before — NOT tab B's just-visited workspace (v0.3 D-8).
  // ------------------------------------------------------------------------
  app.setEditorMode('shared');
  await wait(80);
  record(
    'V6P6-SWITCH-BACK-TO-SHARED-RESTORES-SHARED-STATE',
    editor.getPanelCount() === 1 && editor.getActivePanel()?.id === seedPanel.id,
    `Switching back to Shared Editor restores what Shared Editor had (the seeded panel), not tab B's split layout (got ${editor.getPanelCount()} panels)`
  );

  // ------------------------------------------------------------------------
  // 7. A real file panel's live-edited content survives a mode-switch
  //    toJSON()/fromJSON() round-trip (round-1 adversarial review, Critical
  //    #1) — not just the panel/tab/dirty-flag structure V6P6-FIRST-
  //    WORKSPACE-SEEDED-FROM-SHARED already covers.
  // ------------------------------------------------------------------------
  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  editor.clear();
  app.setEditorMode('shared');
  await wait(30);

  const contentTabA = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === contentTabA.path, 4000);
  await wait(60);
  editor.clear();
  const filePanel = editor.openItem('content-test-target', 'content-test.js', { meta: { kind: 'file' } });
  await wait(60);
  const fileView = app.kindRegistry.getInnerForTest(filePanel.id);
  const marker = `MARKER-${Date.now()}`;
  fileView.appendContentForTest(marker);
  await wait(60);
  const valueBeforeSwitch = fileView.getContentForTest();
  record(
    'V6P6-FILE-CONTENT-DIRTY-BEFORE-SWITCH',
    valueBeforeSwitch.includes(marker) && Boolean(filePanel.params?.isDirty),
    `Typed marker is present and the panel is dirty before any mode switch (isDirty: ${filePanel.params?.isDirty})`
  );

  app.setEditorMode('workspace'); // leaves Shared Editor (captures a snapshot) and enters Workspace
  await wait(60);
  app.setEditorMode('shared'); // back to Shared Editor — restores the just-captured snapshot via fromJSON()
  await wait(80);
  const restoredPanel = editor.getPanels().find((p) => p.params?.targetId === 'content-test-target');
  const restoredView = restoredPanel ? app.kindRegistry.getInnerForTest(restoredPanel.id) : undefined;
  record(
    'V6P6-FILE-CONTENT-SURVIVES-MODE-SWITCH',
    Boolean(restoredView) && restoredView.getContentForTest().includes(marker),
    `The typed marker survives a Shared Editor -> Folder Workspace -> Shared Editor round-trip (got: ${JSON.stringify(restoredView?.getContentForTest())})`
  );

  // ------------------------------------------------------------------------
  // 7b. The restored view's dirty BASELINE (its own "last saved" text), not
  //     just its current content, must survive the same round-trip (round-2
  //     adversarial review, Critical #2) — a restored view that treats its
  //     own (still-unsaved) restored content as ALSO the saved baseline
  //     would silently stop being dirty the moment an edit happened to land
  //     back on that exact text, since `isDirty()` is a plain string
  //     comparison against that baseline.
  // ------------------------------------------------------------------------
  record(
    'V6P6-FILE-DIRTY-BASELINE-SURVIVES-MODE-SWITCH',
    Boolean(restoredPanel?.params?.isDirty) &&
      restoredPanel?.params?.savedValue !== restoredPanel?.params?.value &&
      !String(restoredPanel?.params?.savedValue ?? '').includes(marker),
    `The restored panel is still dirty and its saved baseline (params.savedValue) does not include the unsaved marker (isDirty: ${restoredPanel?.params?.isDirty}, savedValue: ${JSON.stringify(restoredPanel?.params?.savedValue)}, value: ${JSON.stringify(restoredPanel?.params?.value)})`
  );

  // ------------------------------------------------------------------------
  // 7c. Drives the restored view's OWN live undo stack, not just the
  //     serialized params — proves `savedValue` genuinely reached the new
  //     `TextEditorView` instance's internal baseline, not only the
  //     panel's params snapshot (round-3 adversarial review, Major #2: the
  //     7b check above could pass even if the constructor silently ignored
  //     `savedValue` and only `params.isDirty` happened to already be
  //     true). Types one more character, then undoes it — landing back on
  //     EXACTLY the restored (still-unsaved) marker text — and checks the
  //     view's own `isDirty()` is still true, which is only possible if its
  //     internal `savedValue` is the ORIGINAL pre-marker baseline and not
  //     the marker text itself.
  // ------------------------------------------------------------------------
  restoredView.appendContentForTest('Z');
  await wait(30);
  restoredView.undoForTest();
  await wait(30);
  record(
    'V6P6-FILE-DIRTY-BASELINE-SURVIVES-EDIT-UNDO-CYCLE',
    restoredView.getContentForTest().includes(marker) &&
      !restoredView.getContentForTest().endsWith('Z') &&
      restoredView.isDirtyForTest() === true,
    `After typing then undoing back to the restored marker text, the LIVE view is still dirty (isDirtyForTest: ${restoredView.isDirtyForTest()}, content: ${JSON.stringify(restoredView.getContentForTest())}) — only possible if its internal savedValue baseline is the original pre-marker text, not the restored marker text itself`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  editor.clear();
  app.setEditorMode('shared');
  await wait(30);

  // ------------------------------------------------------------------------
  // 8. confirmQuit() must ask before discarding a dirty HIDDEN Folder
  //    Workspace tab, not just the currently visible one (round-1
  //    adversarial review, Critical #2). Uses app.confirmQuit() — the same
  //    method both hosts' real window-close handlers now call — not
  //    editor.confirmQuit(), which only ever sees the visible workspace.
  // ------------------------------------------------------------------------
  const dqA = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === dqA.path, 4000);
  await wait(60);
  editor.clear();
  app.setEditorMode('workspace');
  await wait(60);
  const dirtyPanel = editor.openItem('dirty-quit-target', 'dirty-quit.js', { meta: { kind: 'file' } });
  await wait(40);
  app.kindRegistry.getInnerForTest(dirtyPanel.id).appendContentForTest('unsaved change');
  await wait(60);
  record('V6P6-QUIT-SETUP-DIRTY-IN-A', Boolean(dirtyPanel.params?.isDirty), 'tab A\'s workspace panel is dirty before switching away');

  const dqB = ft.addTab(dir2);
  await waitForCondition(() => tree.getRoot()?.id === dqB.path, 4000);
  await wait(80);
  record(
    'V6P6-QUIT-B-WORKSPACE-CLEAN',
    !editor.hasDirtyPanels(),
    `tab B's own (empty) workspace is now visible and clean (editor.hasDirtyPanels(): ${editor.hasDirtyPanels()})`
  );

  let quitDialogShown = false;
  const originalShow = app.confirmDialog.show.bind(app.confirmDialog);
  app.confirmDialog.show = (msg) => {
    quitDialogShown = true;
    return Promise.resolve('cancel');
  };
  let quitResult;
  try {
    quitResult = await app.confirmQuit();
  } finally {
    app.confirmDialog.show = originalShow;
  }
  record(
    'V6P6-QUIT-DETECTS-HIDDEN-DIRTY-WORKSPACE',
    quitDialogShown === true && quitResult === false,
    `app.confirmQuit() asks (and honors "Cancel") for a dirty workspace hidden in a non-active folder tab (dialog shown: ${quitDialogShown}, result: ${quitResult})`
  );

  // ------------------------------------------------------------------------
  // 8b. Choosing "Save" for hidden dirty content must actually SAVE it, not
  //     just avoid discarding it (round-3 adversarial review, Major #1: an
  //     earlier version made Save safe by treating it like Cancel — no data
  //     loss, but also not what Save is supposed to do per D-28/FR-L3).
  //     `saveHiddenDirtySnapshots()` loads tab A's hidden dirty workspace
  //     back into the live editor and saves its dirty panels through the
  //     normal `kindRegistry.save()` path — checked here by confirming the
  //     panel dockview left on screen afterward (A's, the one just saved)
  //     is no longer dirty, and that confirmQuit() itself resolved true
  //     (quit proceeds once the save succeeds).
  // ------------------------------------------------------------------------
  app.confirmDialog.show = (msg) => Promise.resolve('save');
  let saveChoiceResult;
  try {
    saveChoiceResult = await app.confirmQuit();
  } finally {
    app.confirmDialog.show = originalShow;
  }
  const panelAfterSaveChoice = editor.getPanels().find((p) => p.params?.targetId === 'dirty-quit-target');
  record(
    'V6P6-QUIT-SAVE-CHOICE-ACTUALLY-SAVES',
    saveChoiceResult === true && Boolean(panelAfterSaveChoice) && panelAfterSaveChoice.params?.isDirty === false,
    `Choosing "Save" for hidden dirty content actually saves it (confirmQuit result: ${saveChoiceResult}, saved panel's isDirty afterward: ${panelAfterSaveChoice?.params?.isDirty})`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  editor.clear();
  app.setEditorMode('shared');
  await wait(30);

  // ------------------------------------------------------------------------
  // 8c. Choosing "Don't Save" discards without attempting to save —
  //     confirms Save and Don't Save remain genuinely distinct choices, not
  //     both silently collapsed into "proceed" (round-2's original bug) or
  //     both into "actually save" (which would make Don't Save pointless).
  // ------------------------------------------------------------------------
  const dqA2 = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === dqA2.path, 4000);
  await wait(60);
  editor.clear();
  app.setEditorMode('workspace');
  await wait(60);
  editor.openItem('dirty-quit-target-2', 'dirty-quit-2.js', { meta: { kind: 'file' } });
  await wait(40);
  const dirtyPanel2 = editor.getPanels().find((p) => p.params?.targetId === 'dirty-quit-target-2');
  app.kindRegistry.getInnerForTest(dirtyPanel2.id).appendContentForTest('unsaved change 2');
  await wait(60);
  ft.addTab(dir2);
  await waitForCondition(() => tree.getRoot()?.id !== dqA2.path, 4000);
  await wait(80);

  app.confirmDialog.show = (msg) => Promise.resolve('discard');
  let discardChoiceResult;
  try {
    discardChoiceResult = await app.confirmQuit();
  } finally {
    app.confirmDialog.show = originalShow;
  }
  record(
    'V6P6-QUIT-DISCARD-CHOICE-PROCEEDS-WITHOUT-SAVING',
    discardChoiceResult === true && !editor.getPanels().some((p) => p.params?.targetId === 'dirty-quit-target-2'),
    `Choosing "Don't Save" lets confirmQuit() proceed (result: ${discardChoiceResult}) without loading/saving A's hidden workspace (A's panel not present in the still-showing editor: ${!editor.getPanels().some((p) => p.params?.targetId === 'dirty-quit-target-2')})`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  editor.clear();
  app.setEditorMode('shared');
  await wait(30);

  // ------------------------------------------------------------------------
  // 9. Switching editor mode while a folder tab is still mid-load must not
  //    write the still-visible OLD tab's content under the NEW (not-yet-
  //    loaded) tab's id (round-1 adversarial review, Critical #3). Simulated
  //    by monkey-patching fsProvider.createRootNode to hang until released,
  //    mirroring the same technique v04-phase4-suite.js's reentrant-restore
  //    test uses for its own async race. `FolderTabsController.activateTab()`
  //    updates its OWN active-id synchronously the instant `ft.addTab()`
  //    returns — before `main.ts`'s async `activateFolderTab()` (which
  //    `createRootNode` is hung inside of) has changed anything — so the
  //    rail-active tab (B) and `app.activeFolderTabId` (still A) genuinely
  //    disagree for the whole hang, exactly the window the bug lived in.
  // ------------------------------------------------------------------------
  const raceA = ft.addTab(dir1);
  await waitForCondition(() => tree.getRoot()?.id === raceA.path, 4000);
  await wait(60);
  editor.clear();
  app.setEditorMode('workspace');
  await wait(60);
  editor.addNewTab(); // gives A's live (on-screen) workspace 1 panel, not yet saved into folderWorkspaceByTab
  await wait(40);

  const originalCreateRootNode = app.fsProvider.createRootNode.bind(app.fsProvider);
  let releaseHang;
  const hang = new Promise((resolve) => {
    releaseHang = resolve;
  });
  app.fsProvider.createRootNode = async (path) => {
    if (path === dir2) await hang;
    return originalCreateRootNode(path);
  };
  const raceB = ft.addTab(dir2); // starts the (hung) load for B; app.activeFolderTabId stays raceA.id until it resolves
  try {
    await wait(80);
    record(
      'V6P6-RACE-SETUP-STILL-MID-LOAD',
      ft.getActiveTab()?.id === raceB.id && app.activeFolderTabId === raceA.id,
      `Rail active tab is already B while app.activeFolderTabId is still A, mid-load (rail: ${ft.getActiveTab()?.id === raceB.id}, app: ${app.activeFolderTabId === raceA.id})`
    );
    app.setEditorMode('shared'); // must attribute the still-visible A content to A, not to the not-yet-loaded B
    await wait(60);
  } finally {
    releaseHang();
    app.fsProvider.createRootNode = originalCreateRootNode;
  }
  await waitForCondition(() => tree.getRoot()?.id === raceB.path, 4000);
  await wait(80);

  const aWorkspaceAfterRace = app.folderWorkspaceByTab.get(raceA.id);
  const bWorkspaceAfterRace = app.folderWorkspaceByTab.get(raceB.id);
  const bWorkspacePanelCount = bWorkspaceAfterRace?.panels ? Object.keys(bWorkspaceAfterRace.panels).length : 0;
  record(
    'V6P6-MODE-SWITCH-DURING-LOAD-DOES-NOT-CORRUPT-TARGET',
    bWorkspaceAfterRace === undefined || bWorkspacePanelCount === 0,
    `Switching editor mode while B was still loading did not write A's panel into B's saved workspace (B's saved workspace: ${JSON.stringify(bWorkspaceAfterRace)})`
  );
  record(
    'V6P6-MODE-SWITCH-DURING-LOAD-ATTRIBUTES-TO-SOURCE',
    Boolean(aWorkspaceAfterRace?.panels) && Object.keys(aWorkspaceAfterRace.panels).length === 1,
    `The still-visible content was correctly attributed to A instead (A's saved workspace panel count: ${aWorkspaceAfterRace?.panels ? Object.keys(aWorkspaceAfterRace.panels).length : 0})`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  editor.clear();
  app.setEditorMode('shared');
  await wait(30);

  // ------------------------------------------------------------------------
  // 6. Folder Workspace state is session-only — never in localStorage
  //    (v0.3 D-8, WK-109).
  // ------------------------------------------------------------------------
  let storedKeys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) storedKeys.push(localStorage.key(i));
  } catch {
    // ignore
  }
  const editorPersistKey = storedKeys.find((k) => /workspace|editor.*mode|editor.*layout/i.test(k || ''));
  record(
    'V6P6-WORKSPACE-NOT-PERSISTED',
    !editorPersistKey,
    `No localStorage key stores Folder Workspace's editor state (keys checked: ${JSON.stringify(storedKeys)})`
  );

  for (const t of [...ft.getTabs()]) ft.removeTab(t.id);
  editor.clear();
  app.setEditorMode('shared');
  await wait(30);

  const success = results.every((r) => r.pass);
  return { success, results };
};
