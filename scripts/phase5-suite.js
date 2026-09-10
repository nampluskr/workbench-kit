/**
 * Host-neutral Phase 5 Acceptance Test Suite for workbench-kit.
 *
 * Can be executed in any browser environment (Electron, pywebview/WebView2, Chrome).
 * Returns a structured array of assertion results:
 *   { success: boolean, results: [{ id: string, pass: boolean, msg: string }] }
 */
window.__runPhase5TestSuite = async function runPhase5TestSuite() {
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
    const menu = app.menu;
    const activityBar = app.activityBar;
    const contextMenu = app.contextMenu;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function activePanelContentEl() {
      const panel = editor.getActivePanel();
      if (!panel) return null;
      return document.querySelector('.editor-panel-content');
    }

    function dispatchKey(target, key, opts) {
      target.dispatchEvent(
        new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, opts || {}))
      );
    }

    // ------------------------------------------------------------------------
    // 1. Resource kind registration slot: a third, test-only kind proves the
    //    slot accepts arbitrary future kinds with zero further core changes
    //    (FR-I1, WK-025).
    // ------------------------------------------------------------------------
    let widgetDisposed = false;
    app.kindRegistry.register('widget', (targetId) => {
      const el = document.createElement('div');
      el.className = 'test-widget-view';
      el.textContent = 'Widget: ' + targetId;
      return { element: el, dispose: () => { widgetDisposed = true; } };
    });
    editor.openItem('widget-1', 'Widget One', { meta: { kind: 'widget' } });
    await wait(20);
    const widgetEl = activePanelContentEl();
    record(
      'P5-FR-I1-REGISTER',
      widgetEl !== null && widgetEl.textContent === 'Widget: widget-1',
      'A test-registered "widget" kind opens and renders via the registry with zero core changes (FR-I1)'
    );

    // ------------------------------------------------------------------------
    // 2. File preset & folder preset, driven through real tree selection
    //    (FR-I2, FR-I3, WK-026) — not a direct editor.openItem() call, so
    //    this actually proves the row appears and selecting it opens the
    //    right preset (round 1 finding: acceptance was under-tested).
    // ------------------------------------------------------------------------
    tree.setRoot({
      id: '/preset',
      label: 'preset',
      isContainer: true,
      children: [
        { id: '/preset/file-a.txt', label: 'file-a.txt', isContainer: false },
        { id: '/preset/folder-a', label: 'folder-a', isContainer: true, children: [] },
      ],
    });
    await wait(20);
    tree.focusTree();

    async function focusRowById(targetId, maxSteps) {
      for (let i = 0; i < maxSteps; i++) {
        const focused = document.querySelector('.tree-row.focused');
        if (focused && focused.getAttribute('data-id') === targetId) return true;
        document.querySelector('.tree-list').dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
        );
        await wait(5);
      }
      const finalFocused = document.querySelector('.tree-row.focused');
      return Boolean(finalFocused && finalFocused.getAttribute('data-id') === targetId);
    }

    const reachedFile = await focusRowById('/preset/file-a.txt', 5);
    if (reachedFile) {
      document.querySelector('.tree-list').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
    }
    await wait(20);
    const fileEl = activePanelContentEl();
    // Phase 6 upgrades the file preset to a real monaco-backed view (D-18);
    // its DOM is monaco's own rendering, not plain text, so this checks for
    // the wrapper element rather than exact textContent.
    const fileTextEditorEl = fileEl ? fileEl.querySelector('.text-editor-view') : null;
    record(
      'P5-FR-I2',
      reachedFile && fileTextEditorEl !== null,
      'Selecting the file row in the tree opens the file preset (monaco view) as the active tab (FR-I2)'
    );

    const reachedFolder = await focusRowById('/preset/folder-a', 5);
    if (reachedFolder) {
      document.querySelector('.tree-list').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
    }
    await wait(20);
    const folderEl = activePanelContentEl();
    record(
      'P5-FR-I3',
      reachedFolder && folderEl !== null && folderEl.textContent === 'Folder preset view: /preset/folder-a',
      'Selecting the folder row in the tree opens the folder preset as the active tab (FR-I3)'
    );

    // ------------------------------------------------------------------------
    // 3. Open beside + query pane placement (FR-I4, FR-I5, FR-I8, WK-027)
    // ------------------------------------------------------------------------
    editor.clear();
    editor.openItem('/q/a.txt', 'a.txt', { meta: { kind: 'file' } });
    editor.openBeside('/q/b.txt', 'b.txt', { meta: { kind: 'file' } });
    await wait(20);
    record('P5-FR-I4', editor.getGroupCount() === 2, 'openBeside creates a second pane when none exists (FR-I4, FR-A14)');

    const placement = editor.queryPanePlacement();
    record(
      'P5-FR-I5-OWN',
      Boolean(placement && placement.own.targets.includes('/q/b.txt')),
      'queryPanePlacement reports the caller\'s own pane target correctly (FR-I5)'
    );
    record(
      'P5-FR-I5-BESIDE',
      Boolean(placement && placement.beside && placement.beside.targets.includes('/q/a.txt')),
      'queryPanePlacement reports the adjacent pane\'s target correctly (FR-I5)'
    );

    // ------------------------------------------------------------------------
    // 4. Reserved key policy (FR-I6, FR-I7, FR-R1, FR-R1a) — every FR-I6
    //    example (F3/F4/F5/F6/Space) and every FR-R1a "not reserved" key is
    //    actually dispatched at the tab view, not merely named in the doc
    //    (round 2 finding).
    // ------------------------------------------------------------------------
    const panelEl = document.querySelector('.editor-panel-content');
    const nonReservedKeys = [
      { id: 'CTRLS', opts: { key: 's', ctrlKey: true } },
      { id: 'F2', opts: { key: 'F2' } },
      { id: 'DELETE', opts: { key: 'Delete' } },
      { id: 'CTRLZ', opts: { key: 'z', ctrlKey: true } },
      { id: 'CTRLY', opts: { key: 'y', ctrlKey: true } },
      { id: 'CTRLC', opts: { key: 'c', ctrlKey: true } },
      { id: 'CTRLV', opts: { key: 'v', ctrlKey: true } },
      { id: 'F3', opts: { key: 'F3' } },
      { id: 'F4', opts: { key: 'F4' } },
      { id: 'F5', opts: { key: 'F5' } },
      { id: 'F6', opts: { key: 'F6' } },
      { id: 'SPACE', opts: { key: ' ' } },
    ];
    let allNonReservedPass = true;
    for (const { id, opts } of nonReservedKeys) {
      let appReceived = false;
      const listener = () => {
        appReceived = true;
      };
      panelEl.addEventListener('keydown', listener);
      const evt = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, opts));
      panelEl.dispatchEvent(evt);
      panelEl.removeEventListener('keydown', listener);
      const ok = appReceived && evt.defaultPrevented === false;
      if (!ok) {
        allNonReservedPass = false;
        console.log('[TEST_ASSERT]FAIL|||[P5-FR-R1A-' + id + '] key reached the app unprevented');
      }
    }
    record(
      'P5-FR-R1A',
      allNonReservedPass,
      'All FR-I6 examples (F3/F4/F5/F6/Space) and all six FR-R1a keys reach the tab view unprevented with 0 shell interception (FR-I6, FR-R1a)'
    );

    // FR-I7: a tree key, pressed while the tree has focus, is fully consumed
    // by the shell (defaultPrevented) and actually moves shell-owned focus,
    // rather than being left for an app-level handler to interpret.
    tree.setRoot({
      id: '/keytest',
      label: 'keytest',
      isContainer: true,
      children: [
        { id: '/keytest/a.txt', label: 'a.txt', isContainer: false },
        { id: '/keytest/b.txt', label: 'b.txt', isContainer: false },
      ],
    });
    await wait(20);
    tree.focusTree();
    const focusedBefore = document.querySelector('.tree-row.focused');
    const focusedIdBefore = focusedBefore ? focusedBefore.getAttribute('data-id') : null;
    const treeListEl = document.querySelector('.tree-list');
    // FR-I7 requires 0 app-side reception, not merely defaultPrevented ===
    // true — a listener still runs even when the event was prevented unless
    // propagation itself was stopped (round 2 finding).
    let appReceptionCount = 0;
    const windowKeyListener = (e) => {
      if (e.key === 'ArrowDown') appReceptionCount++;
    };
    window.addEventListener('keydown', windowKeyListener);
    document.addEventListener('keydown', windowKeyListener);
    const treeKeyEvt = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    treeListEl.dispatchEvent(treeKeyEvt);
    await wait(10);
    window.removeEventListener('keydown', windowKeyListener);
    document.removeEventListener('keydown', windowKeyListener);
    const focusedAfter = document.querySelector('.tree-row.focused');
    const focusedIdAfter = focusedAfter ? focusedAfter.getAttribute('data-id') : null;
    const knownRowIds = ['/keytest', '/keytest/a.txt', '/keytest/b.txt'];
    record(
      'P5-FR-I7',
      treeKeyEvt.defaultPrevented === true &&
        focusedIdAfter !== null &&
        focusedIdAfter !== focusedIdBefore &&
        knownRowIds.includes(focusedIdAfter) &&
        appReceptionCount === 0,
      'ArrowDown while the tree has focus moves shell focus and never reaches a document/window-level listener (0 app reception, FR-I7)'
    );

    const wasMenuOpenBefore = menu.isOpen;
    dispatchKey(document, 'F10');
    await wait(20);
    record('P5-FR-R1-GLOBAL', !wasMenuOpenBefore && menu.isOpen, 'F10 (a reserved key) opens the hamburger menu regardless of focus (FR-R1)');
    menu.closeMenu();

    // ------------------------------------------------------------------------
    // 5. Menu keyboard navigation (NFR-7, WK-031)
    // ------------------------------------------------------------------------
    menu.openMenu();
    dispatchKey(document, 'ArrowRight'); // File -> View
    dispatchKey(document, 'ArrowDown'); // move off item 0
    await wait(10);
    const dropdown = document.getElementById('workbench-menu-dropdown');
    record(
      'P5-NFR7-MENU-NAV',
      dropdown !== null && dropdown.querySelectorAll('.kbd-focused').length === 1,
      'Arrow-key navigation moves a single keyboard-focus marker inside the open menu (NFR-7)'
    );
    menu.closeMenu();

    // NFR-7 for the activity bar and tab-row commands: a synthetic keydown
    // cannot reliably trigger a real browser's built-in Enter/Space-on-button
    // activation (that default action only fires for trusted input), so this
    // verifies the actual precondition the reserved-keys doc claims instead —
    // every command is a genuine native <button> with no tabindex="-1".
    const activityBarButtons = Array.from(document.querySelectorAll('#activity-bar-top .activity-bar-item, #activity-bar-bottom .activity-bar-item'));
    const tabHeaderButtons = Array.from(document.querySelectorAll('.editor-group-header-actions .editor-action-btn'));
    const allKeyboardReachable = [...activityBarButtons, ...tabHeaderButtons].every(
      (el) => el.tagName === 'BUTTON' && el.getAttribute('tabindex') !== '-1'
    );
    record(
      'P5-NFR7-NATIVE-BUTTONS',
      activityBarButtons.length > 0 && tabHeaderButtons.length > 0 && allKeyboardReachable,
      'Every activity-bar and tab-row command is a genuine native <button> reachable by Tab, not excluded from the tab order (NFR-7)'
    );

    // ------------------------------------------------------------------------
    // 6. Right-click menu device (FR-G5, FR-G6, WK-030)
    // ------------------------------------------------------------------------
    tree.setRoot({
      id: '/ctxroot',
      label: 'ctxroot',
      isContainer: true,
      children: [{ id: '/ctxroot/item.txt', label: 'item.txt', isContainer: false }],
    });
    await wait(20);
    const row = document.querySelector('.tree-row[data-id="/ctxroot/item.txt"]');

    if (row) {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    }
    record(
      'P5-FR-G5-DEFAULT-OFF',
      document.querySelectorAll('.workbench-context-menu').length === 0,
      'Right-click renders 0 menu elements by default (FR-G5, D-22)'
    );

    let ctxActionFired = false;
    app.contextMenuItemsForTreeNode = () => [
      { id: 'a', label: 'First', action: () => { ctxActionFired = 'first'; } },
      { id: 'b', label: 'Second', action: () => { ctxActionFired = 'second'; } },
    ];
    contextMenu.setEnabled(true);
    if (row) {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    }
    const ctxRows1 = document.querySelectorAll('.workbench-context-menu .context-menu-item-row');
    record(
      'P5-FR-G6-ITEM-COUNT',
      ctxRows1.length === 2,
      'When enabled, the menu shows exactly the app-defined items and 0 shell-added items (FR-G6)'
    );

    dispatchKey(document, 'ArrowDown');
    dispatchKey(document, 'Enter');
    await wait(10);
    record('P5-WK030-KEYBOARD', ctxActionFired === 'second', 'Arrow-key navigation + Enter triggers the focused context menu item (WK-030, NFR-7)');
    record(
      'P5-WK030-CLOSE-AFTER-TRIGGER',
      document.querySelectorAll('.workbench-context-menu').length === 0,
      'Triggering an item closes the context menu'
    );

    contextMenu.setEnabled(false);
    if (row) {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    }
    record(
      'P5-FR-G5-DISABLE',
      document.querySelectorAll('.workbench-context-menu').length === 0,
      'Disabling the device again renders 0 menu elements (D-22)'
    );
    contextMenu.hide();

    // ------------------------------------------------------------------------
    // 7. Status bar app item (FR-N10, WK-029)
    // ------------------------------------------------------------------------
    const appItemsEl = document.getElementById('statusbar-app-items');
    record('P5-FR-N10-APPEND', appItemsEl !== null && appItemsEl.children.length >= 1, 'App status bar item is present (FR-N10)');
    // v0.2 replaces part of v0.1 FR-N10 (SPEC 0.1): the shell's app-info slot
    // is gone (FR-C10, D-4), so the shell keeps two slots — path and message —
    // and the app item still attaches with zero core changes.
    record(
      'P5-FR-N10-SLOTS',
      Boolean(document.getElementById('statusbar-path')) &&
        Boolean(document.getElementById('statusbar-message')) &&
        document.getElementById('statusbar-app-info') === null,
      "The shell's status bar slots (path, message) remain intact, and the removed app-info slot stays gone (v0.1 FR-N10 → v0.2 FR-C10)"
    );

    // ------------------------------------------------------------------------
    // 8. Activity bar swap (FR-N12, WK-029)
    // ------------------------------------------------------------------------
    const originalTopItems = activityBar.getTopItems();
    const originalViewItemCount = menu.getViewItems().length;
    activityBar.setTopItems([{ id: 'swap:one', label: 'Swap One', iconClass: 'codicon-circle-filled' }]);
    await wait(10);
    const topButtons = document.querySelectorAll('#activity-bar-top .activity-bar-item');
    record(
      'P5-FR-N12-SWAP',
      activityBar.getTopItems().length === 1 && topButtons.length === 1,
      'App swaps activity bar top items with zero core changes (FR-N12)'
    );
    record(
      'P5-FR-N12-MENU-UNCHANGED',
      menu.getViewItems().length === originalViewItemCount,
      "Swapping activity bar items leaves the View menu's item list unchanged (FR-N12)"
    );
    activityBar.setTopItems(originalTopItems);

    // ------------------------------------------------------------------------
    // 9. File menu app item (FR-I9, WK-048)
    // ------------------------------------------------------------------------
    // v0.2 moved the wiring example's File item to View > Preset Info
    // (FR-M12), so the production File menu has no app item any more. The
    // app adds one here through its own extension surface, exactly as an app
    // would (v0.1 FR-I9: zero core changes).
    window.__workbenchAppSurface.addFileMenuItem({ id: 'app:file:preset-info', label: 'Sample App Item', action: () => {} });
    const fileGroup = menu.getGroups().find((g) => g.id === 'file');
    const coreFileItems = menu.getFileItems();
    const fileItemsMatchCore = coreFileItems.every((it, i) => fileGroup.items[i].id === it.id);
    record('P5-FR-I9-CORE-ORDER', fileItemsMatchCore, "File menu's shell items keep their exact list and order (FR-I9, FR-N6)");
    record(
      'P5-FR-I9-SEPARATOR',
      fileGroup.items[coreFileItems.length].type === 'separator',
      'A separator follows the shell items before any app-added item (FR-I9, D-31)'
    );
    record(
      'P5-FR-I9-APP-ITEM',
      fileGroup.items[coreFileItems.length + 1].id === 'app:file:preset-info',
      'The app-added File item appears below the separator (FR-I9)'
    );

    // ------------------------------------------------------------------------
    // 10. Sidebar view titlebar app action (FR-I10, WK-048)
    // ------------------------------------------------------------------------
    const sidebarActions = document.getElementById('sidebar-actions');
    const actionChildren = sidebarActions ? Array.from(sidebarActions.children) : [];
    const appActionsIndex = actionChildren.findIndex((el) => el.id === 'sidebar-app-actions');
    const collapseAllIndex = actionChildren.findIndex((el) => el.id === 'sidebar-action-collapse-all');
    const appActionsEl = document.getElementById('sidebar-app-actions');
    record(
      'P5-FR-I10-POSITION',
      appActionsIndex >= 0 && collapseAllIndex >= 0 && appActionsIndex < collapseAllIndex,
      'App-added view-titlebar action sits to the left of the two shell actions (FR-I10, D-30, D-31)'
    );
    record(
      'P5-FR-I10-COUNT',
      appActionsEl !== null && appActionsEl.children.length === 1,
      'Exactly one app action is present in the view titlebar (FR-I10)'
    );

    // ------------------------------------------------------------------------
    // 11. View/Help are closed to the app (FR-I11)
    // ------------------------------------------------------------------------
    record(
      'P5-FR-I11',
      typeof menu.addAppViewItem === 'undefined' && typeof menu.addAppHelpItem === 'undefined',
      'No surface exists for the app to add to View or Help (FR-I11)'
    );

    // ------------------------------------------------------------------------
    // 12. window.__workbenchAppSurface is the narrow, documented surface: it
    //     has 0 methods that create/close/move a tab or pane, and 0 access
    //     to menu.setAction/triggerItem (FR-I8, C-9, round 1 Critical + Major).
    //     window.__workbenchApp (full access) remains, but is a Phase 1-4
    //     test-harness diagnostic hook, not the app-extension surface.
    // ------------------------------------------------------------------------
    const surface = window.__workbenchAppSurface;
    // setTabDirty is NOT in this list: Phase 6 (FR-L1, FR-P7) legitimately
    // exposes it as a metadata-only flag, not a structural tab/pane
    // manipulation method — see P5-FR-I8-SURFACE-EDITOR's message.
    const forbiddenEditorMethods = ['addNewTab', 'closePanel', 'closeActiveTab', 'closeAllTabsInGroup', 'splitGroup', 'splitActiveGroup', 'getApi', 'clear'];
    const editorSurfaceIsNarrow =
      Boolean(surface) && forbiddenEditorMethods.every((m) => typeof surface.editor[m] === 'undefined');
    record(
      'P5-FR-I8-SURFACE-EDITOR',
      editorSurfaceIsNarrow,
      'window.__workbenchAppSurface.editor exposes 0 tab/pane creation, closing, or moving methods (FR-I8, C-9)'
    );
    record(
      'P5-FR-I8-SURFACE-NO-MENU-CONTROL',
      typeof surface.menu === 'undefined',
      'window.__workbenchAppSurface has 0 access to menu.setAction/triggerItem, so it cannot override or hijack shell commands (FR-I9, FR-I11, D-31)'
    );
    const handleOpenBeforeSurface = await surface.editor.openItem('/surface-check/x.txt', 'x.txt', { meta: { kind: 'file' } });
    record(
      'P5-FR-I8-SURFACE-HANDLE',
      typeof handleOpenBeforeSurface === 'object' &&
        Object.keys(handleOpenBeforeSurface).length === 1 &&
        typeof handleOpenBeforeSurface.id === 'string',
      'openItem() through the app surface returns a plain {id} handle with 0 dockview panel/group references (FR-I8)'
    );

    return { success: results.every((r) => r.pass), results };
  } catch (err) {
    record('RUNNER_ERR', false, 'Unhandled error in Phase 5 suite: ' + (err && err.stack ? err.stack : String(err)));
    return { success: false, results };
  }
};
