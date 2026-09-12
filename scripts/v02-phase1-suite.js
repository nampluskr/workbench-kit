/**
 * Host-neutral v0.2 Phase 1 acceptance suite — 임시 자리와 확정.
 *
 * Covers FR-P1 ~ FR-P8, FR-P10, FR-T1 ~ FR-T3.
 *
 * Every assertion here goes through what a user actually operates and reads
 * (NFR-3): tree rows are pressed, tabs are pressed, keys are sent, and the
 * preview marking is read off the rendered tab's computed style rather than
 * off a params flag. `window.__testTmpDir` must hold a real directory the
 * runner has populated with the fixture named in FIXTURE below.
 */
window.__runV02Phase1Suite = async function runV02Phase1Suite() {
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
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // ------------------------------------------------------------------------
    // UI-path helpers. Nothing below calls an EditorController method to make
    // the state it then measures.
    // ------------------------------------------------------------------------

    // Compared as an attribute value rather than built into a CSS selector:
    // a node id is a Windows path, and its backslashes would be read as CSS
    // escape sequences.
    function rowEl(nodeId) {
      return Array.from(document.querySelectorAll('.tree-row[data-id]')).find(
        (el) => el.getAttribute('data-id') === nodeId
      ) || null;
    }

    function tabEl(panelId) {
      return document.querySelector('.dv-tab[data-tab-panel-id="' + panelId + '"]');
    }

    /** Single-press a tree row, the way a pick happens. */
    async function pickRow(nodeId) {
      const el = rowEl(nodeId);
      if (!el) throw new Error('pickRow: no row for ' + nodeId);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      await wait(120);
      return el;
    }

    /** Double-press a tree row. */
    async function doublePressRow(nodeId) {
      const el = rowEl(nodeId);
      if (!el) throw new Error('doublePressRow: no row for ' + nodeId);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
      await wait(150);
      return el;
    }

    /** Send a key to the tree, as a user with focus there would. */
    async function sendTreeKey(key) {
      const target = document.querySelector('.tree-list') || document.getElementById('sidebar-content');
      if (!target) throw new Error('sendTreeKey: tree element not found');
      target.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
      await wait(150);
    }

    /**
     * Is this tab shown as the preview spot? Read from the rendered title's
     * computed style, so a params flag that never reaches the screen fails.
     */
    function looksPreview(panelId) {
      const el = tabEl(panelId);
      if (!el) return null;
      const content = el.querySelector('.dv-default-tab-content') || el;
      return getComputedStyle(content).fontStyle === 'italic';
    }

    function previewTabCount(group) {
      const scope = group ? group.element : document;
      return Array.from(scope.querySelectorAll('.dv-tab')).filter((el) => {
        const content = el.querySelector('.dv-default-tab-content') || el;
        return getComputedStyle(content).fontStyle === 'italic';
      }).length;
    }

    const visibleRowIds = () =>
      Array.from(document.querySelectorAll('.tree-row[data-id]')).map((el) => el.getAttribute('data-id'));

    // ------------------------------------------------------------------------
    // Fixture: a real folder with two files and a folder holding one file.
    // ------------------------------------------------------------------------
    const testDir = window.__testTmpDir;
    if (!testDir) {
      record('V2P1-FIXTURE', false, 'window.__testTmpDir was not provided by the runner');
      return { success: false, results };
    }
    const sep = testDir.includes('\\') ? '\\' : '/';
    const fileA = testDir + sep + 'alpha.txt';
    const fileB = testDir + sep + 'beta.txt';
    const fileC = testDir + sep + 'gamma.txt';
    const folderD = testDir + sep + 'sub';

    await app.openFolder(testDir);
    await wait(250);
    // Setup, not the behaviour under test: a freshly opened root shows only
    // its own row (v0.1 D-27), and every assertion below needs to press the
    // rows inside it.
    const rootNode = tree.getRoot();
    if (rootNode) await tree.setExpanded(rootNode.id, true);
    await wait(200);
    editor.clear();
    await wait(80);
    record(
      'V2P1-FIXTURE',
      rowEl(fileA) !== null && rowEl(fileB) !== null && rowEl(folderD) !== null,
      'Fixture folder is open and its rows are on screen'
    );

    // ------------------------------------------------------------------------
    // FR-P1 · FR-P2 · FR-P3 · FR-P10 — the preview spot
    // ------------------------------------------------------------------------
    await pickRow(fileA);
    const panelA = editor.getActivePanel();
    record(
      'V2P1-FR-P1',
      editor.getPanelCount() === 1 && panelA && looksPreview(panelA.id) === true,
      'A single pick opens one tab and it reads as the preview spot (FR-P1)'
    );

    await pickRow(fileB);
    const panelAfterB = editor.getActivePanel();
    record(
      'V2P1-FR-P2',
      editor.getPanelCount() === 1 &&
        panelAfterB &&
        panelAfterB.id === panelA.id &&
        panelAfterB.title === 'beta.txt',
      'Picking something else replaces the same preview spot instead of adding a tab (FR-P2)'
    );

    await pickRow(folderD);
    const panelAfterFolder = editor.getActivePanel();
    record(
      'V2P1-FR-P3',
      editor.getPanelCount() === 1 &&
        panelAfterFolder &&
        panelAfterFolder.id === panelA.id &&
        looksPreview(panelAfterFolder.id) === true,
      'A folder uses the same preview rule as a file (FR-P3)'
    );

    await pickRow(fileA);
    await pickRow(fileB);
    await pickRow(fileC);
    await pickRow(folderD);
    await pickRow(fileA);
    record(
      'V2P1-FR-P10',
      editor.getPanelCount() === 1 && previewTabCount() === 1,
      'Five picks in a row leave exactly one preview tab (FR-P10)'
    );

    // A9 Round-1 (Major): five clicks in one pane could never catch the way the
    // invariant actually broke — dragging a preview into a pane that already
    // had one. Build that exact situation and check the destination pane after.
    editor.clear();
    await wait(80);
    await pickRow(fileA);
    const leftGroup = editor.getActiveGroup();
    const splitBtn = leftGroup.element.querySelector('.tab-action-split-right');
    splitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(200);
    const rightGroup = editor.getActiveGroup();
    await pickRow(fileB);
    const destinationPreview = editor.getActivePanel();
    const draggedPanel = leftGroup.panels[0];
    const dropTarget = rightGroup.element.querySelector('.dv-content-container');
    const draggedTabEl = tabEl(draggedPanel.id);
    if (draggedTabEl && dropTarget) {
      const dt = new DataTransfer();
      const r = dropTarget.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      draggedTabEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy }));
      dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy }));
      dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy }));
      draggedTabEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await wait(250);
    }
    // A9 Round-3 (Major): if the synthetic drag did nothing, the fallback below
    // picked a one-tab group that trivially holds one preview, and the
    // assertion passed. Require evidence that the tab really moved first.
    const dragOccurred =
      rightGroup.panels.some((p) => p.id === draggedPanel.id) && editor.getGroupCount() === 1;
    const mergedGroup = editor.getGroups().find((g) => g.panels.length === 2) || editor.getActiveGroup();
    // Captured now: the reorder check below clears the workbench, after which
    // this group's element is gone and any later count would read nothing.
    const mergePreviews = previewTabCount(mergedGroup);
    // FR-P13 (human decision after A9 R3-1): the tab the user carried over is
    // confirmed, and the preview that was already there stays a preview.
    // Checking only "one italic tab" would also pass if the WRONG tab had been
    // confirmed automatically, which is exactly what R3-1 caught.
    record(
      'V2P1-FR-P13-DRAG',
      dragOccurred &&
        looksPreview(draggedPanel.id) === false &&
        destinationPreview &&
        destinationPreview.id !== draggedPanel.id &&
        looksPreview(destinationPreview.id) === true,
      'Dragging a preview into another pane confirms the dragged tab and leaves the pane\'s own preview a preview (FR-P13)'
    );

    // Same-group reorder is not a confirm (FR-P13). Require that the order
    // really changed, so a drag that did nothing cannot pass.
    editor.clear();
    await wait(80);
    await doublePressRow(fileA);
    const keptTab = editor.getActivePanel();
    await pickRow(fileB);
    const reorderGroup = editor.getActiveGroup();
    const reorderPreview = editor.getActivePanel();
    const indexBefore = reorderGroup.panels.findIndex((p) => p.id === reorderPreview.id);
    const srcTab = tabEl(reorderPreview.id);
    const dstTab = tabEl(keptTab.id);
    if (srcTab && dstTab) {
      const dtR = new DataTransfer();
      const rr = dstTab.getBoundingClientRect();
      const rx = rr.left + rr.width * 0.25;
      const ry = rr.top + rr.height / 2;
      srcTab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtR }));
      dstTab.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dtR, clientX: rx, clientY: ry }));
      dstTab.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtR, clientX: rx, clientY: ry }));
      dstTab.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtR, clientX: rx, clientY: ry }));
      srcTab.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dtR }));
      await wait(250);
    }
    const indexAfter = reorderGroup.panels.findIndex((p) => p.id === reorderPreview.id);
    record(
      'V2P1-FR-P13-REORDER',
      editor.getGroupCount() === 1 &&
        indexBefore !== indexAfter &&
        indexAfter >= 0 &&
        looksPreview(reorderPreview.id) === true,
      'Reordering a preview inside its own pane keeps it a preview (FR-P13) (index ' + indexBefore + ' -> ' + indexAfter + ')'
    );

    record(
      'V2P1-FR-P10-MERGE',
      dragOccurred && mergePreviews === 1,
      'Dragging a preview into a pane that already had one still leaves exactly one preview there (FR-P10)'
    );

    // ------------------------------------------------------------------------
    // FR-P4 · FR-P5 — double press splits by what was pressed
    // ------------------------------------------------------------------------
    editor.clear();
    await wait(80);
    await doublePressRow(fileB);
    const pinnedB = editor.getActivePanel();
    record(
      'V2P1-FR-P4',
      pinnedB && looksPreview(pinnedB.id) === false && pinnedB.title === 'beta.txt',
      'Double-pressing a file row confirms it — the tab stops reading as preview (FR-P4)'
    );

    await pickRow(fileA);
    const previewAfterPin = editor.getActivePanel();
    record(
      'V2P1-FR-P8',
      editor.getPanelCount() === 2 &&
        previewAfterPin.id !== pinnedB.id &&
        looksPreview(pinnedB.id) === false &&
        previewTabCount() === 1,
      'A pick after a confirm leaves the confirmed tab alone and opens a new preview beside it (FR-P8)'
    );

    const rowsBeforeFolderPress = visibleRowIds().length;
    const previewBeforeFolderPress = editor.getActivePanel().id;
    await doublePressRow(folderD);
    const rowsAfterFolderPress = visibleRowIds().length;
    record(
      'V2P1-FR-P5',
      rowsAfterFolderPress > rowsBeforeFolderPress &&
        looksPreview(previewBeforeFolderPress) === true,
      'Double-pressing a folder row expands it and does NOT confirm; the preview spot stays preview (FR-P5)'
    );

    // ------------------------------------------------------------------------
    // FR-P6 — confirming from the tab title
    // ------------------------------------------------------------------------
    editor.clear();
    await wait(80);
    await pickRow(fileA);
    const previewForTitle = editor.getActivePanel();
    const titleEl = tabEl(previewForTitle.id);
    titleEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
    await wait(150);
    record(
      'V2P1-FR-P6-FILE',
      looksPreview(previewForTitle.id) === false,
      "Double-pressing a file's preview tab title confirms it (FR-P6)"
    );

    editor.clear();
    await wait(80);
    await pickRow(folderD);
    const folderPreview = editor.getActivePanel();
    const folderTitleEl = tabEl(folderPreview.id);
    folderTitleEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
    await wait(150);
    record(
      'V2P1-FR-P6-FOLDER',
      looksPreview(folderPreview.id) === false,
      "Double-pressing a folder's preview tab title confirms it too (FR-P6)"
    );

    // A9 Round-1 (Critical): a dirty preview sitting beside a clean confirmed
    // tab was replaced with no dialog at all, because the question was asked
    // about the ACTIVE tab. Recreate that exact arrangement.
    // Order matters: B is confirmed while everything is still clean, and only
    // then does A become the dirty preview. Double-clicking B over an already
    // dirty preview is a different scenario (V2P1-DIRTY-DBLCLICK below) that
    // correctly waits for the dialog instead of pinning B behind it.
    editor.clear();
    await wait(80);
    await doublePressRow(fileB);
    const cleanPinned = editor.getActivePanel();
    await pickRow(fileA);
    const dirtyPreview = editor.getActivePanel();
    editor.setTabDirty(dirtyPreview.id, true);
    const pinnedTabEl = tabEl(cleanPinned.id);
    if (pinnedTabEl) {
      pinnedTabEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
      pinnedTabEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
      await wait(150);
    }
    let dialogAppeared = false;
    let previewSurvived = false;
    if (
      cleanPinned &&
      cleanPinned.id !== dirtyPreview.id &&
      editor.getActivePanel() &&
      editor.getActivePanel().id === cleanPinned.id
    ) {
      await pickRow(fileC);
      await wait(200);
      const dialog = document.querySelector('.confirm-dialog-btn[data-choice="cancel"]');
      dialogAppeared = Boolean(dialog);
      if (dialog) {
        dialog.click();
        await wait(150);
      }
      const still = editor.getPanels().find((p) => p.id === dirtyPreview.id);
      previewSurvived = Boolean(still && still.params && still.params.isDirty);
    }
    record(
      'V2P1-DIRTY-PREVIEW',
      dialogAppeared && previewSurvived,
      'Picking something while a dirty preview sits beside a clean active tab asks first, and Cancel keeps the unsaved preview (FR-P2, D-28)'
    );

    // A9 Round-3 (Major): a double click delivers click, click, dblclick. With
    // a dirty preview that used to raise overlapping dialogs, and the dblclick
    // opened the target pinned behind them, so "Discard" discarded nothing.
    // Deliver the full real event sequence.
    editor.clear();
    await wait(80);
    await pickRow(fileA);
    const dirtyForDbl = editor.getActivePanel();
    editor.setTabDirty(dirtyForDbl.id, true);
    const rowB = rowEl(fileB);
    rowB.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    rowB.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
    rowB.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
    await wait(200);
    const overlaysDuringDbl = document.querySelectorAll('.workbench-confirm-overlay').length;
    const discardBtn = document.querySelector('.confirm-dialog-btn[data-choice="discard"]');
    if (discardBtn) discardBtn.click();
    await wait(250);
    const panelB = editor.getPanels().find((p) => p.params && p.params.targetId === fileB);
    const aStillThere = editor.getPanels().some((p) => p.params && p.params.targetId === fileA);
    record(
      'V2P1-DIRTY-DBLCLICK',
      overlaysDuringDbl === 1 &&
        document.querySelectorAll('.workbench-confirm-overlay').length === 0 &&
        editor.getPanelCount() === 1 &&
        Boolean(panelB) &&
        looksPreview(panelB.id) === false &&
        !aStillThere,
      'Double-clicking a file over a dirty preview shows exactly one dialog; Discard replaces the dirty preview with the file, confirmed (FR-P4, D-28) (overlays: ' + overlaysDuringDbl + ')'
    );

    // A9 Round-3 (Major): picking a target that is already open only jumps to
    // it, so nothing is overwritten — asking about the dirty preview was a
    // false alarm whose "Discard" discarded nothing.
    editor.clear();
    await wait(80);
    await doublePressRow(fileB);
    await pickRow(fileA);
    const dirtyBesideOpen = editor.getActivePanel();
    editor.setTabDirty(dirtyBesideOpen.id, true);
    await pickRow(fileB);
    await wait(200);
    const falseAlarm = document.querySelectorAll('.workbench-confirm-overlay').length > 0;
    const stillDirty = editor.getPanels().find((p) => p.id === dirtyBesideOpen.id);
    record(
      'V2P1-ALREADY-OPEN-NO-DIALOG',
      !falseAlarm &&
        editor.getActivePanel() &&
        editor.getActivePanel().params.targetId === fileB &&
        Boolean(stillDirty && stillDirty.params.isDirty),
      'Picking an already-open target while a dirty preview exists jumps to it without a dialog, and the dirty preview is untouched (FR-B2, D-28)'
    );
    const leftoverCancel = document.querySelector('.confirm-dialog-btn[data-choice="cancel"]');
    if (leftoverCancel) {
      leftoverCancel.click();
      await wait(100);
    }

    // A9 Round-3 (Major): dockview merges params, so metadata from the previous
    // target leaked into the replacement. Metadata is not drawn on screen; it
    // is the opaque contract an app reads back, so it is observed through the
    // app-facing surface an app would actually use.
    editor.clear();
    await wait(80);
    const surface = window.__workbenchAppSurface;
    await surface.editor.openItem(fileA, 'alpha.txt', { meta: { kind: 'file', owner: 'A' } });
    await wait(80);
    await surface.editor.openItem(fileB, 'beta.txt', { meta: { kind: 'file' } });
    await wait(80);
    const replaced = editor.getPanels().find((p) => p.params && p.params.targetId === fileB);
    record(
      'V2P1-META-CLEARED',
      editor.getPanelCount() === 1 && Boolean(replaced) && replaced.params.owner === undefined,
      'Replacing a preview spot does not carry the previous target\'s metadata into the new one (FR-P2)'
    );

    // ------------------------------------------------------------------------
    // FR-T1 · FR-T2 · FR-T3 · FR-P7 — the tree keys
    // ------------------------------------------------------------------------
    editor.clear();
    await wait(80);
    tree.collapseAll();
    await wait(80);

    tree.focusItemById(folderD);
    const rowsBeforeArrow = visibleRowIds().length;
    await sendTreeKey('ArrowRight');
    record(
      'V2P1-FR-T1',
      visibleRowIds().length > rowsBeforeArrow,
      'ArrowRight expands a folder in the tree (FR-T1)'
    );

    tree.focusItemById(fileA);
    const rowsBeforeFileArrow = visibleRowIds().length;
    const panelsBeforeFileArrow = editor.getPanelCount();
    await sendTreeKey('ArrowRight');
    record(
      'V2P1-FR-T2',
      visibleRowIds().length === rowsBeforeFileArrow &&
        editor.getPanelCount() === panelsBeforeFileArrow,
      'ArrowRight on a file does nothing — no rows appear and no tab opens (FR-T2)'
    );

    // (나) nothing open yet for this target: Enter opens it into the preview
    // spot first, same as a click (D-16) — it does not confirm on the first
    // press.
    editor.clear();
    await wait(80);
    tree.focusItemById(fileC);
    await sendTreeKey('Enter');
    const enterPanel = editor.getActivePanel();
    record(
      'V2P1-FR-P7-FRESH',
      editor.getPanelCount() === 1 &&
        enterPanel &&
        enterPanel.title === 'gamma.txt' &&
        looksPreview(enterPanel.id) === true,
      'Enter on something not open yet opens it into the preview spot, not confirmed yet (FR-P7, D-16)'
    );

    // A second Enter on the SAME still-focused item confirms it (D-16) — the
    // pair together is the two-step FR-P7 now describes.
    await sendTreeKey('Enter');
    record(
      'V2P1-FR-P7-SECOND-ENTER-CONFIRMS',
      editor.getPanelCount() === 1 &&
        editor.getActivePanel().id === enterPanel.id &&
        looksPreview(enterPanel.id) === false,
      'A second Enter on the item already sitting in the preview spot confirms that same tab (FR-P7, D-16)'
    );

    // (가) already sitting in the preview spot via a click: Enter confirms it
    editor.clear();
    await wait(80);
    await pickRow(fileA);
    const previewForEnter = editor.getActivePanel();
    tree.focusItemById(fileA);
    await sendTreeKey('Enter');
    record(
      'V2P1-FR-P7-PREVIEW',
      editor.getPanelCount() === 1 &&
        editor.getActivePanel().id === previewForEnter.id &&
        looksPreview(previewForEnter.id) === false,
      'Enter on what is already in the preview spot (put there by a click) confirms that same tab (FR-P7)'
    );

    // FR-T3: expansion survives the two-step Enter, and applies to folders too
    editor.clear();
    await wait(80);
    tree.collapseAll();
    await wait(80);
    tree.focusItemById(folderD);
    await sendTreeKey('ArrowRight');
    const rowsAfterExpand = visibleRowIds().length;
    await sendTreeKey('Enter');
    const folderEnterPanel = editor.getActivePanel();
    record(
      'V2P1-FR-T3-PREVIEW',
      visibleRowIds().length === rowsAfterExpand &&
        folderEnterPanel &&
        looksPreview(folderEnterPanel.id) === true,
      'After ArrowRight expands a folder, a first Enter opens it into the preview spot — not confirmed yet — and the expansion stays (FR-T3, D-16)'
    );
    await sendTreeKey('Enter');
    record(
      'V2P1-FR-T3',
      visibleRowIds().length === rowsAfterExpand &&
        editor.getActivePanel().id === folderEnterPanel.id &&
        looksPreview(folderEnterPanel.id) === false,
      'A second Enter on the same folder confirms it while the expansion stays (FR-T3, D-16)'
    );

    const success = results.every((r) => r.pass);
    return { success, results };
  } catch (err) {
    record('RUNNER_ERR', false, 'Unhandled error in v0.2 Phase 1 suite: ' + String(err && err.stack ? err.stack : err));
    return { success: false, results };
  }
};
