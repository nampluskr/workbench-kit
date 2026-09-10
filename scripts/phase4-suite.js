/**
 * Host-neutral Phase 4 Acceptance Test Suite for workbench-kit.
 *
 * Can be executed in any browser environment (Electron, pywebview/WebView2, Chrome).
 * Returns a structured array of assertion results:
 *   { success: boolean, results: [{ id: string, pass: boolean, msg: string }] }
 */
window.__runPhase4TestSuite = async function runPhase4TestSuite() {
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
    const activityBar = app.activityBar;
    const menu = app.menu;

    // Helper: wait ms
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Helper: Dispatch click
    function clickEl(el) {
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }

    // Helper: Dispatch key to tree
    function sendTreeKey(key, opts) {
      const target = document.querySelector('.tree-list') || document.getElementById('sidebar-content') || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, opts || {})));
    }

    // ------------------------------------------------------------------------
    // UI-path helpers.
    //
    // The A7 adversarial review (Round 1 R1-4, Round 3 R3-2) found that many of
    // the assertions below drove the shell through EditorController methods
    // (`splitActiveGroup`, `closePanel`, `panel.api.setActive`) rather than the
    // controls a user actually operates. An assertion that calls the method it
    // is meant to be testing proves the method works, not that the button wired
    // to it works. These helpers go through the real DOM affordances instead;
    // each throws if the control is missing, so a broken wire fails loudly
    // rather than silently falling back to the internal call.
    // ------------------------------------------------------------------------

    /** The DOM element of a tab, addressed the way a user points at it. */
    function findTabEl(panelId) {
      return document.querySelector('.dv-tab[data-tab-panel-id="' + panelId + '"]');
    }

    /**
     * Activates a tab by pressing it, as a user would. dockview activates on
     * `pointerdown`, not `click`, and defers the actual switch to a
     * requestAnimationFrame callback -- which is why the host window running
     * this suite has to be painting (see the runners' `show: true` /
     * `backgroundThrottling: false`) and why the wait here is generous.
     */
    async function uiActivateTab(panelId) {
      const el = findTabEl(panelId);
      if (!el) throw new Error('uiActivateTab: no tab element for ' + panelId);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
      await wait(120);
      return el;
    }

    /** Closes a tab through its own close button (the [x] on the tab). */
    async function uiCloseTab(panelId) {
      const el = findTabEl(panelId);
      if (!el) throw new Error('uiCloseTab: no tab element for ' + panelId);
      const action = el.querySelector('.dv-default-tab-action');
      if (!action) throw new Error('uiCloseTab: tab ' + panelId + ' has no close button');
      action.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      action.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(60);
    }

    /** Presses a split button in a group's own header action bar. */
    async function uiSplit(group, direction) {
      const selector = direction === 'right' ? '.tab-action-split-right' : '.tab-action-split-down';
      const btn = group.element.querySelector(selector);
      if (!btn) throw new Error('uiSplit: no ' + selector + ' button in group header');
      const before = editor.getGroupCount();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(60);
      if (editor.getGroupCount() !== before + 1) {
        throw new Error('uiSplit: clicking ' + selector + ' did not create a group');
      }
      return editor.getActiveGroup();
    }

    /** Presses the [+] button in a group's own header action bar. */
    async function uiNewTab(group) {
      const btn = group.element.querySelector('.tab-action-new');
      if (!btn) throw new Error('uiNewTab: no .tab-action-new button in group header');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(60);
      return editor.getActivePanel();
    }

    /**
     * Activates a group by pressing the empty strip beside its tabs -- the
     * place dockview binds group activation to (`dv-void-container`, and the
     * tabs-and-actions container it sits in). Clicking the content area does
     * nothing: no such binding exists there.
     */
    async function uiActivateGroup(group) {
      const target = group.element.querySelector('.dv-void-container')
        || group.element.querySelector('.dv-tabs-and-actions-container');
      if (!target) throw new Error('uiActivateGroup: group has no void container to press');
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
      await wait(120);
    }

    // ------------------------------------------------------------------------
    // 1. Initial State & DOM Visibility (FR-K2, D-20, D-26)
    // ------------------------------------------------------------------------
    record('P4-INIT-GROUP', editor.getGroupCount() === 1, 'Initial workbench state has strictly 1 group (칸 수 1) (FR-K2, D-26)');
    record('P4-INIT-PANEL', editor.getPanelCount() === 0, 'Initial workbench state has strictly 0 panels (탭 수 0) (FR-K2, D-20)');
    const editorContainer = document.getElementById('editor-container');
    record('P4-INIT-CONTAINER', editorContainer !== null && editorContainer.children.length > 0, 'Editor container is attached and non-empty in DOM');

    // ------------------------------------------------------------------------
    // 2. Tab Header Actions Rendering & Order (FR-C1, FR-D1, FR-D2, D-13, D-15)
    // ------------------------------------------------------------------------
    const headerActions = document.querySelector('.editor-group-header-actions');
    record('P4-HEADER-EXISTS', headerActions !== null, 'Tab header actions container element is present');
    const headerBtns = headerActions ? Array.from(headerActions.querySelectorAll('.editor-action-btn')) : [];
    record('P4-HEADER-COUNT', headerBtns.length === 3, 'Tab header actions has exactly 3 buttons');
    record('P4-HEADER-BTN1', headerBtns[0] && headerBtns[0].classList.contains('tab-action-split-right'), 'Button 1 is Split Right (D-13)');
    record('P4-HEADER-BTN2', headerBtns[1] && headerBtns[1].classList.contains('tab-action-split-down'), 'Button 2 is Split Down (D-13)');
    record('P4-D13-D15', headerBtns[2] && headerBtns[2].classList.contains('tab-action-new'), 'Button 3 is New Tab (+) at the RIGHT END (FR-C1, D-15)');

    // ------------------------------------------------------------------------
    // 3. User Action: Click New Tab (+) Button (FR-C1, FR-C2)
    // ------------------------------------------------------------------------
    const newTabBtn = headerBtns[2];
    clickEl(newTabBtn);
    record('P4-FR-C1', editor.getPanelCount() === 1, 'Clicking New Tab (+) increases panel count to 1 (FR-C1)');
    const activePanel1 = editor.getActivePanel();
    record('P4-FR-C1-ACTIVE', activePanel1 !== undefined && activePanel1.title === 'Untitled', 'Newly created tab is active with title Untitled (FR-C1)');
    const emptyContentEl = activePanel1 ? document.querySelector('.editor-panel-content') : null;
    record('P4-FR-C2', emptyContentEl !== null && emptyContentEl.children.length === 0 && emptyContentEl.textContent.trim() === '', 'Empty tab content has strictly 0 children and 0 text (FR-C2, D-20)');

    // ------------------------------------------------------------------------
    // 4. Tree Keyboard Acceptance: Enter on Tree Item (FR-A6, FR-B3)
    // ------------------------------------------------------------------------
    tree.setRoot({
      id: '/workspace',
      label: 'workspace',
      name: 'workspace',
      isContainer: true,
      children: [
        { id: '/workspace/docA.txt', label: 'docA.txt', name: 'docA.txt', isContainer: false },
        { id: '/workspace/docB.txt', label: 'docB.txt', name: 'docB.txt', isContainer: false },
        { id: '/workspace/docC.txt', label: 'docC.txt', name: 'docC.txt', isContainer: false },
        { id: '/workspace/folderX', label: 'folderX', name: 'folderX', isContainer: true, children: [] },
      ],
    });
    // v0.2 supersedes three assertions that used to live here — v0.1 FR-A6
    // (Enter opens in the current tab), FR-B1 (a pick replaces the active tab)
    // and FR-B3 (a pick is absorbed by the [+] empty tab). All three are in
    // v0.2 SPEC 0.1's replacement table, and their v0.2 successors (FR-P1 ~
    // FR-P8, FR-P10, FR-T1 ~ FR-T3) are asserted in v02-phase1-suite.js.
    // What stays here is the setup the rest of this suite depends on, written
    // against the rule that actually applies now.
    editor.clear();
    tree.focusItemById('/workspace/docA.txt');
    sendTreeKey('Enter');
    record(
      'P4-FR-A6',
      editor.getActivePanel()?.params?.targetId === '/workspace/docA.txt' &&
        editor.getActivePanel()?.title === 'docA.txt',
      'Tree Enter keydown opens the focused item (v0.1 FR-A6 → v0.2 FR-P7)'
    );

    // ------------------------------------------------------------------------
    // 5. A pick goes to the preview spot (v0.1 FR-B1 → v0.2 FR-P2)
    // ------------------------------------------------------------------------
    editor.clear();
    tree.focusItemById('/workspace/docA.txt');
    clickEl(document.querySelector('.tree-row.focused'));
    tree.focusItemById('/workspace/docB.txt');
    clickEl(document.querySelector('.tree-row.focused'));
    record(
      'P4-FR-B1',
      editor.getPanelCount() === 1 && editor.getActivePanel()?.params?.targetId === '/workspace/docB.txt',
      'A second pick replaces the same spot; tab count remains 1 (v0.1 FR-B1 → v0.2 FR-P2)'
    );

    // ------------------------------------------------------------------------
    // 6. New Tab button, and jumping to an already-open target (FR-B2)
    // ------------------------------------------------------------------------
    // Re-queried rather than reusing the element captured at the top: an
    // editor.clear() in between makes dockview rebuild the group header, which
    // detaches the old button and would make this click silently do nothing.
    const newTabBtnNow = document.querySelector('.editor-group-header-actions .tab-action-new');
    clickEl(newTabBtnNow);
    record('P4-FR-C1-2', editor.getPanelCount() === 2, 'Adding 2nd tab via + button increases tab count to 2');

    // Open docC.txt so there is a second distinct target on screen
    tree.focusItemById('/workspace/docC.txt');
    sendTreeKey('Enter');
    const countBeforeJump = editor.getPanelCount();

    // Now jump back to the already-open docB.txt (FR-B2). Unchanged in v0.2:
    // opening something that is already open goes to it instead of duplicating.
    tree.focusItemById('/workspace/docB.txt');
    sendTreeKey('Enter');
    record(
      'P4-FR-B2',
      editor.getPanelCount() === countBeforeJump &&
        editor.getActivePanel()?.params?.targetId === '/workspace/docB.txt',
      'Opening item already open elsewhere jumps to existing tab without increasing tab count (FR-B2, D-5)'
    );

    // ------------------------------------------------------------------------
    // 7. Folder opens using identical rules as files (FR-B4)
    // ------------------------------------------------------------------------
    const countBeforeFolder = editor.getPanelCount();
    tree.focusItemById('/workspace/folderX');
    sendTreeKey('Enter');
    record(
      'P4-FR-B4',
      editor.getPanelCount() === countBeforeFolder + 1 &&
        editor.getActivePanel()?.params?.targetId === '/workspace/folderX',
      'Folder opens using identical rules as files — a not-yet-open target adds one tab either way (FR-B4)'
    );

    // ------------------------------------------------------------------------
    // 8. Renderer Modes: 'always' vs 'onlyWhenVisible' DOM Attachment (FR-E4, FR-E5, D-24)
    // ------------------------------------------------------------------------
    editor.clear();
    const tabAlways = editor.openItem('/workspace/always.txt', 'always.txt', { renderer: 'always' }, undefined);
    const tabOther = editor.openItem('/workspace/other.txt', 'other.txt', { mode: 'pinned' }, undefined);

    // tabAlways is now inactive. Because renderer is 'always', its content element MUST remain in DOM
    const alwaysRenderer = editor.getContentRenderer(tabAlways.id);
    record('P4-FR-E4', alwaysRenderer && document.contains(alwaysRenderer.element), 'Inactive tab with renderer "always" remains attached to DOM (FR-E4, D-24)');

    // Switch to tabAlways and update to onlyWhenVisible
    tabAlways.api.setActive();
    editor.openItem('/workspace/onlyVisible.txt', 'onlyVisible.txt', { renderer: 'onlyWhenVisible' });
    // Switch to tabOther
    tabOther.api.setActive();
    record('P4-FR-E5', alwaysRenderer && !document.contains(alwaysRenderer.element), 'Inactive tab with renderer "onlyWhenVisible" is detached from DOM (FR-E5, D-24)');

    // ------------------------------------------------------------------------
    // 9. Live Application View & Lifecycle Contracts (D-4, FR-E1, FR-E2, FR-E3)
    // ------------------------------------------------------------------------
    editor.clear();
    editor.setComponentFactory((options) => {
      const el = document.createElement('div');
      el.className = 'app-live-view';
      const input = document.createElement('input');
      input.className = 'live-input';
      el.appendChild(input);

      let localTimerTicks = 0;
      let timerId = setInterval(() => {
        localTimerTicks++;
      }, 10);

      return {
        element: el,
        init: () => {},
        update: () => {},
        instanceStamp: 'stamp-app-' + options.id,
        getTimerTicks: () => localTimerTicks,
        getInputState: () => input.value,
        setInputState: (v) => { input.value = v; },
        dispose: () => {
          clearInterval(timerId);
        },
      };
    });

    const appTab1 = editor.openItem('/workspace/app1.txt', 'app1.txt', { mode: 'pinned' }, undefined);
    const appView1 = editor.getContentRenderer(appTab1.id);
    record('P4-APP-VIEW', appView1 && appView1.instanceStamp?.startsWith('stamp-app-'), 'Custom application view injected via component factory (D-4)');

    // Set DOM-only state
    appView1.setInputState('persisted-dom-state-42');
    await wait(40);
    const ticks1 = appView1.getTimerTicks();
    record('P4-APP-TIMER-RUNNING', ticks1 > 0, 'Application view timer is actively ticking');

    // Switch away to another tab
    const bgTab = editor.openItem('/workspace/bg.txt', 'bg.txt', { mode: 'pinned' }, undefined);
    const bgView = editor.getContentRenderer(bgTab.id);
    await wait(40);
    const ticks2 = appView1.getTimerTicks();
    const bgTicks = bgView ? bgView.getTimerTicks() : 0;
    record('P4-FR-E5-TIMER', ticks2 > ticks1 && bgTicks > 0, 'Application view timer continues running while tab is inactive (FR-E5)');
    record('P4-FR-E5-ISOLATION', bgTicks !== ticks2, 'Background tab maintains isolated local timer counter distinct from active tab (FR-E5, D-24)');

    // Switch back to appTab1 by clicking its tab (FR-E1 is about what a user
    // sees when they switch tabs, so the switch has to come from the tab).
    await uiActivateTab(appTab1.id);
    record('P4-FR-E1-UI-ACTIVE', editor.getActivePanel()?.id === appTab1.id, 'Clicking a tab makes it the active panel (FR-E1)');
    const reacquiredView1 = editor.getContentRenderer(appTab1.id);
    const stats1 = editor.getLifecycleStats(appTab1.id);
    record('P4-FR-E1-INSTANCE', reacquiredView1 === appView1, 'Switching tabs preserves strictly identical view instance (FR-E1)');
    record('P4-FR-E1-CREATION', stats1.creationCount === 1, 'Aggregate creationCount is strictly 1 across tab switches (FR-E1)');
    record('P4-FR-E1-DISPOSAL', stats1.disposalCount === 0, 'Aggregate disposalCount is strictly 0 before closing (FR-E1)');
    record('P4-FR-E1-DOM-STATE', reacquiredView1.getInputState() === 'persisted-dom-state-42', 'DOM-only input state persisted across tab switch (FR-E1)');

    // Move appTab1 across panes via genuine Drag & Drop (FR-E2, FR-C6)
    const rightPane = editor.splitActiveGroup('right');
    const ticksBeforeMove = appView1.getTimerTicks();
    const appTab1El = document.querySelector('.dv-tab[data-tab-panel-id="' + appTab1.id + '"]');
    const rightContentEl = rightPane.element.querySelector('.dv-content-container');
    if (!appTab1El || !rightContentEl) {
      throw new Error('Elements for cross-pane drag not found in DOM');
    }
    const rightRect = rightContentEl.getBoundingClientRect();
    const dtMove = new DataTransfer();
    appTab1El.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtMove }));
    const dropCx = rightRect.left + rightRect.width / 2;
    const dropCy = rightRect.top + rightRect.height / 2;
    rightContentEl.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dtMove, clientX: dropCx, clientY: dropCy }));
    rightContentEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtMove, clientX: dropCx, clientY: dropCy }));
    rightContentEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtMove, clientX: dropCx, clientY: dropCy }));
    appTab1El.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dtMove }));
    await wait(30);

    const reacquiredAfterMove = editor.getContentRenderer(appTab1.id);
    const statsAfterMove = editor.getLifecycleStats(appTab1.id);
    const ticksAfterMove = reacquiredAfterMove.getTimerTicks();

    record('P4-FR-E2-INSTANCE', reacquiredAfterMove === appView1, 'Same view instance preserved after cross-pane move (FR-E2, FR-C6)');
    record('P4-FR-E2-CREATION', statsAfterMove.creationCount === 1, 'creationCount remains strictly 1 after moving across panes (FR-E2)');
    record('P4-FR-E2-TIMER', ticksAfterMove > ticksBeforeMove, 'Timer continuity maintained after cross-pane move (FR-E2)');
    record('P4-FR-E2-DOM-STATE', reacquiredAfterMove.getInputState() === 'persisted-dom-state-42', 'DOM-only input state preserved after cross-pane move (FR-E2)');
    const tabMovedToRight = rightPane.panels.some((p) => p.id === appTab1.id);
    record('P4-FR-C6', tabMovedToRight && document.contains(reacquiredAfterMove.element), 'View element is attached in new pane and tab resides in target group after cross-pane move (FR-C6)');

    // Close appTab1 through the tab's own [x] and verify disposal & memory
    // cleanup (FR-E3, Minor 1). Going through the button also exercises the
    // close interception in wirePanelClose() that every close path shares.
    await uiCloseTab(appTab1.id);
    record('P4-FR-E3-UI-CLOSED', findTabEl(appTab1.id) === null, 'Tab close button removes the tab from the tab bar (FR-E3)');
    const statsAfterClose = editor.getLifecycleStats(appTab1.id);
    record('P4-FR-E3', statsAfterClose.disposalCount === 1, 'disposalCount becomes strictly 1 at close time (FR-E3)');
    record('P4-MEM-CLEANUP', editor.getContentRenderer(appTab1.id) === undefined, 'Closed renderer is deleted from contentRenderers map (FR-E3, Minor 1)');

    // Reset component factory
    editor.setComponentFactory(null);

    // ------------------------------------------------------------------------
    // 10. Tree Ctrl+Enter: Open Beside (FR-A14, D-19, FR-D6)
    // ------------------------------------------------------------------------
    editor.clear();
    const gMain = editor.getActiveGroup();
    editor.openItem('/workspace/docA.txt', 'docA.txt', { mode: 'pinned' }, gMain);

    // In 1-group state, Ctrl+Enter from tree opens beside (FR-A14)
    tree.focusItemById('/workspace/docB.txt');
    sendTreeKey('Enter', { ctrlKey: true });

    record('P4-FR-A14-SPLIT', editor.getGroupCount() === 2, 'Tree Ctrl+Enter creates beside group when only 1 group exists (FR-A14)');
    const panelBesideB = editor.getActivePanel();
    record('P4-FR-A14-CONTENT', panelBesideB?.params?.targetId === '/workspace/docB.txt', 'Beside pane holds docB.txt (FR-A14)');

    // Create 2D layout: split below from right group
    const gTopRight = editor.getActiveGroup();
    const gBottomRight = await uiSplit(gTopRight, 'below');
    record('P4-FR-D6', editor.getGroupCount() === 3, '3 groups now arranged in 2D layout, built by pressing Split Down in the group header (FR-D6)');

    // Activate top-left group (gMain) by clicking into it
    await uiActivateGroup(gMain);
    record('P4-2D-ACTIVE-MAIN', editor.getActiveGroup() === gMain, 'Clicking a group makes it the active group (FR-D6)');

    // openBeside from top-left: spatial right neighbor is gTopRight (NOT gBottomRight)
    const panelBeside2D = editor.openBeside('/workspace/docC.txt', 'docC.txt');
    record('P4-FR-A14-2D-COUNT', editor.getGroupCount() === 3, 'openBeside in 2D layout reuses spatial beside group without creating 4th group (FR-A14)');
    record('P4-FR-A14-2D-TARGET', panelBeside2D && panelBeside2D.group === gTopRight, 'openBeside target is strictly the spatial right-hand group (FR-A14, D-19)');

    // Test FR-B2 duplicate protection under openBeside:
    // docA.txt is open in gMain. Calling openBeside with docA.txt MUST jump to gMain!
    const jumpedBeside = editor.openBeside('/workspace/docA.txt', 'docA.txt');
    record('P4-FR-A14-DUP', editor.getActivePanel()?.params?.targetId === '/workspace/docA.txt' && jumpedBeside && jumpedBeside.group === gMain, 'openBeside jumps to existing panel across workbench without duplicating (FR-B2, FR-A14)');

    // ------------------------------------------------------------------------
    // 11. Header Split Buttons Click (FR-D1, FR-D2)
    // ------------------------------------------------------------------------
    editor.clear();
    const sGroup = editor.getActiveGroup();
    editor.openItem('/workspace/splitTest.txt', 'splitTest.txt', { mode: 'pinned' }, sGroup);

    const splitRightBtn = document.querySelector('.tab-action-split-right');
    clickEl(splitRightBtn);
    record('P4-FR-D1', editor.getGroupCount() === 2, 'Clicking Tab Header Split Right button splits pane right (FR-D1)');

    const splitDownBtn = document.querySelector('.tab-action-split-down');
    clickEl(splitDownBtn);
    record('P4-FR-D2', editor.getGroupCount() === 3, 'Clicking Tab Header Split Down button splits pane down (FR-D2)');

    // Helper to click menu item in DOM
    function clickMenuRow(categoryId, itemId) {
      const hamburger = document.getElementById('menu-hamburger-btn') || app.layout?.menuBtn || document.querySelector('.titlebar-btn[aria-label="Menu"]');
      if (!hamburger) throw new Error('Hamburger button not found in DOM');
      if (!document.getElementById('workbench-menu-dropdown')) {
        clickEl(hamburger);
      }
      const catRow = document.querySelector(`.menu-category-row[data-category-id="${categoryId}"]`);
      if (catRow) clickEl(catRow);
      const itemRow = document.querySelector(`.menu-item-row[data-item-id="${itemId}"]`);
      if (!itemRow) throw new Error(`Menu row for ${itemId} not found in DOM`);
      clickEl(itemRow);
    }

    // ------------------------------------------------------------------------
    // 12. UI Split Action Triggers: Activity Bar & View Menu (FR-D3)
    // ------------------------------------------------------------------------
    const initialGroups = editor.getGroupCount();
    // v0.2 replaces the Activity Bar path of v0.1 FR-D3 (SPEC 0.1, FR-C5, D-3):
    // splitting is no longer offered there. The ID is kept so the v0.1 matrix
    // row still resolves, and it now asserts that the path is gone; the tab
    // strip and menu paths below keep their v0.1 judgement.
    const actSplitH = document.querySelector('.activity-bar-item[data-item-id^="activity:split"]');
    record('P4-FR-D3-ACTBAR', actSplitH === null, 'The Activity Bar offers 0 split actions (v0.1 FR-D3 Activity Bar path → v0.2 FR-C5)');

    clickMenuRow('view', 'view:split-vertical');
    record('P4-FR-D3-MENU', editor.getGroupCount() === initialGroups + 1, 'View menu split-vertical item clicked in DOM splits pane (FR-D3)');

    // ------------------------------------------------------------------------
    // 13. Split Stress Test: 8 Consecutive Splits to 9 Panes (FR-D7)
    // ------------------------------------------------------------------------
    editor.clear();
    record('P4-FR-D7-INIT', editor.getGroupCount() === 1, 'Stress test starts with exactly 1 pane');
    let stressSuccess = true;
    for (let splitIndex = 1; splitIndex <= 8; splitIndex++) {
      try {
        // Each split comes from the Split Right button of the group that is
        // currently active, which is what a user repeatedly pressing it does.
        await uiSplit(editor.getActiveGroup(), 'right');
        if (editor.getGroupCount() !== 1 + splitIndex) {
          stressSuccess = false;
          break;
        }
      } catch (err) {
        stressSuccess = false;
        break;
      }
    }
    record('P4-FR-D7', stressSuccess && editor.getGroupCount() === 9, 'Split stress test: 8 presses of Split Right creating 9 coexisting panes (FR-D7)');

    // ------------------------------------------------------------------------
    // 14. Pane Sashes & Real Pointer Drag Resize (FR-D4, FR-D5)
    // ------------------------------------------------------------------------
    editor.clear();
    const gLeft = editor.getActiveGroup();
    editor.openItem('/workspace/left.txt', 'left.txt', { mode: 'pinned' }, gLeft);
    const gRight = editor.splitActiveGroup('right');
    editor.openItem('/workspace/right.txt', 'right.txt', { mode: 'pinned' }, gRight);

    const sash = document.querySelector('.dv-sash');
    record('P4-FR-D4-SASH', sash !== null, 'Sashes exist between adjacent split panes (FR-D4)');


    const wLeftBefore = gLeft.element.getBoundingClientRect().width;
    const wRightBefore = gRight.element.getBoundingClientRect().width;

    if (sash) {
      const sashRect = sash.getBoundingClientRect();
      const startX = sashRect.left + sashRect.width / 2;
      const startY = sashRect.top + sashRect.height / 2;
      const deltaX = 50;

      sash.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: startX,
        clientY: startY,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      }));
      document.dispatchEvent(new PointerEvent('pointermove', {
        clientX: startX + deltaX,
        clientY: startY,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      }));
      document.dispatchEvent(new PointerEvent('pointerup', {
        clientX: startX + deltaX,
        clientY: startY,
        bubbles: true,
        cancelable: true,
        buttons: 0,
      }));
    }

    const wLeftAfter = gLeft.element.getBoundingClientRect().width;
    const wRightAfter = gRight.element.getBoundingClientRect().width;
    const resizedProperly = (wLeftAfter > wLeftBefore) && (wRightAfter < wRightBefore);
    record('P4-FR-D4-RESIZE', resizedProperly, 'Dragging sash resizes panes: left pane expands and right pane shrinks in real time (FR-D4)');

    const voidElLeft = gLeft.element.querySelector('.dv-void-container');
    const contentRight = gRight.element.querySelector('.dv-content-container');
    const hasVoidDrag = voidElLeft !== null && (voidElLeft.draggable === true || voidElLeft.classList.contains('dv-draggable'));

    let groupDragSuccess = false;
    if (voidElLeft && contentRight) {
      const rectRight = contentRight.getBoundingClientRect();
      const dtGroup = new DataTransfer();
      voidElLeft.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtGroup }));
      const gDropX = rectRight.left + rectRight.width / 2;
      const gDropY = rectRight.top + rectRight.height / 2;
      contentRight.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dtGroup, clientX: gDropX, clientY: gDropY }));
      contentRight.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtGroup, clientX: gDropX, clientY: gDropY }));
      contentRight.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtGroup, clientX: gDropX, clientY: gDropY }));
      voidElLeft.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dtGroup }));
      await wait(30);

      const remainingGroups = editor.getGroups();
      groupDragSuccess = remainingGroups.length === 1 &&
        remainingGroups[0].panels.some((p) => p.params?.targetId === '/workspace/left.txt') &&
        remainingGroups[0].panels.some((p) => p.params?.targetId === '/workspace/right.txt');
    }
    record('P4-FR-D5-HEADER', hasVoidDrag && groupDragSuccess, 'Group view header rendered with drag surface; dragging header into adjacent group moves and merges panels (FR-D5)');


    // ------------------------------------------------------------------------
    // 14b. Separator and drag-indicator visibility (FR-D4, FR-C6, UT-EDT-003)
    // ------------------------------------------------------------------------
    editor.clear();
    const gSepA = editor.getActiveGroup();
    editor.openItem('/workspace/sepA.txt', 'sepA.txt', { mode: 'pinned' }, gSepA);
    const gSepB = await uiSplit(gSepA, 'right');
    editor.openItem('/workspace/sepB.txt', 'sepB.txt', { mode: 'pinned' }, gSepB);
    // The boundary between two groups has to be *visible*, not merely present.
    // dockview injects its own stylesheet at runtime as an inline <style>, which
    // this app's CSP (style-src 'self') blocks outright, so every dv-* rule has
    // to live in src/style.css. The two rules that size this separator were
    // missing, which left it computing to 0x0 with a resolved colour -- present
    // to a DOM query, invisible to a user (user test UT-EDT-003).
    // A8 Round-2 (Major): scanning every container and stopping at the first
    // non-zero separator meant deleting one of the two orientation rules still
    // passed, as long as the other orientation happened to be present. Measure
    // horizontal and vertical separately and require both. A vertical split is
    // created here so both orientations exist in the layout at this point.
    await uiSplit(gSepB, 'below');
    await wait(80);

    function measureSeparator(orientation) {
      for (const host of Array.from(document.querySelectorAll('.dv-split-view-container.dv-separator-border.dv-' + orientation))) {
        const view = host.querySelector(':scope > .dv-view-container > .dv-view:not(:first-child)');
        if (!view) continue;
        const cs = getComputedStyle(view, '::before');
        return {
          w: parseFloat(cs.width) || 0,
          h: parseFloat(cs.height) || 0,
          color: cs.backgroundColor,
        };
      }
      return null;
    }

    // A horizontal split-view lays its children out left-to-right, so the
    // separator between them is a vertical hairline: 1px wide, full height.
    const sepH = measureSeparator('horizontal');
    const sepV = measureSeparator('vertical');
    const sepHOk = Boolean(sepH) && sepH.w >= 1 && sepH.h > 1;
    const sepVOk = Boolean(sepV) && sepV.h >= 1 && sepV.w > 1;
    record(
      'P4-SEPARATOR-SIZE',
      sepHOk && sepVOk,
      'Editor group separators render with a non-zero size in BOTH orientations (horizontal split: ' + JSON.stringify(sepH) + ', vertical split: ' + JSON.stringify(sepV) + ') (FR-D4, UT-EDT-003)'
    );
    const sepColors = [sepH && sepH.color, sepV && sepV.color];
    record(
      'P4-SEPARATOR-COLOR',
      sepColors.every((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && !/,\s*0\s*\)$/.test(c)),
      'Both separators render in an opaque colour (' + JSON.stringify(sepColors) + ') (FR-D4, UT-EDT-003)'
    );

    // Same root cause: the only drag-and-drop class this project styled,
    // `dv-drop-target-overlay`, is a name dockview 8.2.0 never emits, so a tab
    // drag showed no drop zone at all. Assert against the class the library
    // actually renders, while a drag is genuinely in flight.
    const dndTabEl = document.querySelector('.dv-tab');
    const dndTargetEl = gSepB.element.querySelector('.dv-content-container');
    let dndSelectionBg = 'rgba(0, 0, 0, 0)';
    let dndSelectionBorder = 0;
    let dndSelectionRect = 'none';
    if (dndTabEl && dndTargetEl) {
      const dtHint = new DataTransfer();
      const hintRect = dndTargetEl.getBoundingClientRect();
      const hintX = hintRect.left + hintRect.width / 2;
      const hintY = hintRect.top + hintRect.height / 2;
      dndTabEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtHint }));
      dndTargetEl.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dtHint, clientX: hintX, clientY: hintY }));
      dndTargetEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtHint, clientX: hintX, clientY: hintY }));
      await wait(60);
      const selectionEl = document.querySelector('.dv-drop-target-selection');
      if (selectionEl) {
        const cs = getComputedStyle(selectionEl);
        const rect = selectionEl.getBoundingClientRect();
        // A8 Round-1 (Major): colour and border width alone do not mean the
        // indicator is on screen. A rule that hid it (display/visibility/
        // opacity) or collapsed it to nothing would still have passed.
        // A8 Round-2 (Major): checking only the element itself still allowed a
        // hidden ancestor, an off-screen position, or fully transparent
        // colours. Walk the ancestor chain, require the rect to intersect the
        // viewport, and reject zero-alpha paint.
        let visibleChain = true;
        for (let node = selectionEl; node && node !== document.body; node = node.parentElement) {
          const ns = getComputedStyle(node);
          if (ns.display === 'none' || ns.visibility === 'hidden' || (parseFloat(ns.opacity) || 0) === 0) {
            visibleChain = false;
            break;
          }
        }
        const onScreen = rect.width >= 1 && rect.height >= 1
          && rect.right > 0 && rect.bottom > 0
          && rect.left < window.innerWidth && rect.top < window.innerHeight;
        const opaque = (c) => Boolean(c) && c !== 'transparent' && !/,\s*0\s*\)$/.test(c);
        const painted = visibleChain
          && onScreen
          && opaque(cs.backgroundColor)
          && cs.borderTopStyle !== 'none'
          && opaque(cs.borderTopColor);
        if (painted) {
          dndSelectionBg = cs.backgroundColor;
          dndSelectionBorder = parseFloat(cs.borderTopWidth) || 0;
        }
        dndSelectionRect = Math.round(rect.width) + 'x' + Math.round(rect.height);
      }
      dndTabEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dtHint }));
      await wait(30);
    }
    record('P4-DND-INDICATOR', dndSelectionBg !== 'rgba(0, 0, 0, 0)' && dndSelectionBorder >= 1, 'Dragging a tab paints a drop indicator that is actually on screen (bg ' + dndSelectionBg + ', border ' + dndSelectionBorder + 'px, rect ' + dndSelectionRect + ') (FR-C6, UT-EDT-003)');
    // ------------------------------------------------------------------------
    // 15. Tab Reordering within same group (FR-C5)
    // ------------------------------------------------------------------------
    editor.clear();
    const roGroup = editor.getActiveGroup();
    const tA = editor.openItem('/workspace/tA.txt', 'tA.txt', { mode: 'pinned' }, roGroup);
    const tB = editor.openItem('/workspace/tB.txt', 'tB.txt', { mode: 'pinned' }, roGroup);
    record('P4-REORDER-INIT', roGroup.panels[0].id === tA.id && roGroup.panels[1].id === tB.id, 'Tabs initially ordered [tA, tB]');

    const tabEls = Array.from(roGroup.element.querySelectorAll('.dv-tab'));
    const tabElA = tabEls.find((el) => el.dataset.tabPanelId === tA.id);
    const tabElB = tabEls.find((el) => el.dataset.tabPanelId === tB.id);
    record('P4-FR-C5-DRAGGABLE', Boolean(tabElA && tabElB && tabElA.draggable && tabElB.draggable), 'Tab elements are rendered with draggable=true (FR-C5)');

    // Move tB to index 0 via native DragEvent dropped onto left zone of tabElA
    const dtReorder = new DataTransfer();
    tabElB.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtReorder }));
    const rectA = tabElA.getBoundingClientRect();
    const dropX = rectA.left + rectA.width * 0.3;
    const dropY = rectA.top + rectA.height / 2;
    tabElA.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dtReorder, clientX: dropX, clientY: dropY }));
    tabElA.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtReorder, clientX: dropX, clientY: dropY }));
    tabElA.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtReorder, clientX: dropX, clientY: dropY }));
    tabElB.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dtReorder }));
    await wait(40);
    record('P4-FR-C5', roGroup.panels[0].id === tB.id && roGroup.panels[1].id === tA.id, 'Tab reordering inside same group updates tab sequence to [tB, tA] via native DragEvent (FR-C5)');

    // ------------------------------------------------------------------------
    // 16. Tab Drag to Edge (FR-C7) & Drag Outside Window (FR-C8)
    // ------------------------------------------------------------------------
    // Drag outside window (FR-C8)
    const groupCountBeforeOutside = editor.getGroupCount();
    const panelCountBeforeOutside = editor.getPanelCount();
    const currentTabElB = roGroup.element.querySelector('.dv-tab[data-tab-panel-id="' + tB.id + '"]');
    const isTabBInDom = currentTabElB !== null && document.contains(currentTabElB);
    if (isTabBInDom) {
      const dtOutside = new DataTransfer();
      currentTabElB.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtOutside }));
      window.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtOutside, clientX: -500, clientY: -500 }));
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtOutside, clientX: -500, clientY: -500 }));
      currentTabElB.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dtOutside }));
      await wait(20);
    }
    const isFloatingDisabled = (editor.getApi().component?.options?.disableFloatingGroups === true || editor.getApi()._options?.disableFloatingGroups === true);
    const groupsUnchanged = editor.getGroupCount() === groupCountBeforeOutside && editor.getPanelCount() === panelCountBeforeOutside;
    const noFloatingGroups = (editor.getApi().floatingGroups || []).length === 0;
    const noPopoutGroups = (editor.getApi().popoutGroups || []).length === 0;
    const tabsStayIntact = roGroup.panels.length === 2 && roGroup.panels[0].id === tB.id && roGroup.panels[1].id === tA.id;
    record('P4-FR-C8', isTabBInDom && isFloatingDisabled && groupsUnchanged && noFloatingGroups && noPopoutGroups && tabsStayIntact, 'Dragging tab outside window does not create floating group/new window, tabs stay intact (FR-C8, D-27)');

    // Drag tab to edge to split pane (FR-C7)
    const currentTabA = roGroup.element.querySelector('.dv-tab[data-tab-panel-id="' + tA.id + '"]');
    const roContent = roGroup.element.querySelector('.dv-content-container');
    let edgeSplitSuccess = false;
    if (currentTabA && roContent) {
      const roContentRect = roContent.getBoundingClientRect();
      const dtEdge = new DataTransfer();
      currentTabA.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtEdge }));
      const edgeX = roContentRect.right - 10;
      const edgeY = roContentRect.top + roContentRect.height / 2;
      roContent.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dtEdge, clientX: edgeX, clientY: edgeY }));
      roContent.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtEdge, clientX: edgeX, clientY: edgeY }));
      roContent.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtEdge, clientX: edgeX, clientY: edgeY }));
      currentTabA.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dtEdge }));
      await wait(40);

      const edgeGroups = editor.getGroups();
      edgeSplitSuccess = edgeGroups.length === 2 &&
        edgeGroups[0].panels.some((p) => p.id === tB.id) &&
        edgeGroups[1].panels.some((p) => p.id === tA.id) &&
        edgeGroups[1].element.getBoundingClientRect().left > edgeGroups[0].element.getBoundingClientRect().left;
    }
    record('P4-FR-C7', edgeSplitSuccess, 'Dragging tab to right edge of pane splits the pane and creates a new group on the right containing that tab (FR-C7)');

    // ------------------------------------------------------------------------
    // 17. Tab Title Right-Click: Zero Context Menus in Base Shell (FR-C9, D-22)
    // ------------------------------------------------------------------------
    const tabEl = document.querySelector('.dv-tab');
    if (tabEl) {
      tabEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    }
    const contextMenus = document.querySelectorAll('.context-menu, .dv-context-menu');
    record('P4-FR-C9', contextMenus.length === 0, 'Right clicking tab title in base shell produces strictly 0 context menus (FR-C9, D-22)');

    // ------------------------------------------------------------------------
    // 18. Native Tab Close Button (FR-C3) vs Ctrl+W vs Menu Close (FR-N6b)
    // ------------------------------------------------------------------------
    editor.clear();
    const cGroup = editor.getActiveGroup();
    const cTab1 = editor.openItem('/workspace/cTab1.txt', 'cTab1.txt', { mode: 'pinned' }, cGroup);
    const cTab2 = editor.openItem('/workspace/cTab2.txt', 'cTab2.txt', { mode: 'pinned' }, cGroup);
    const cTab3 = editor.openItem('/workspace/cTab3.txt', 'cTab3.txt', { mode: 'pinned' }, cGroup);

    // Activate middle tab (cTab2)
    cTab2.api.setActive();
    record('P4-FR-C3-INIT', cGroup.panels.length === 3 && cGroup.activePanel?.id === cTab2.id, '3 tabs exist and middle tab is active');

    // Click native close button on active tab - strictly NO controller fallback!
    const closeBtn = document.querySelector('.dv-tab.dv-active-tab .dv-default-tab-action');
    if (!closeBtn) {
      throw new Error('Native tab close button (.dv-tab.dv-active-tab .dv-default-tab-action) not found in DOM!');
    }
    clickEl(closeBtn);

    const activeAfterClose = cGroup.activePanel;
    const isAdjacentActive = activeAfterClose?.id === cTab1.id || activeAfterClose?.id === cTab3.id;
    record('P4-FR-C3', cGroup.panels.length === 2 && isAdjacentActive, 'Clicking tab close button on middle tab reduces count from 3 to 2 and activates adjacent tab (FR-C3, D-16)');

    // Keyboard shortcut Ctrl+W (FR-N6b)
    const countBeforeCtrlW = editor.getPanelCount();
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'w',
      code: 'KeyW',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    record('P4-FR-N6b-KEY', editor.getPanelCount() === countBeforeCtrlW - 1, 'Pressing Ctrl+W dispatches keydown and closes active tab (FR-N6b)');

    // File menu "탭 닫기" (FR-N6b) via DOM click
    const cTabNew = editor.openItem('/workspace/cTabNew.txt', 'cTabNew.txt', { mode: 'pinned' }, cGroup);
    const countBeforeFileMenu = editor.getPanelCount();
    clickMenuRow('file', 'file:close-tab');
    record('P4-FR-N6b-MENU', editor.getPanelCount() === countBeforeFileMenu - 1, 'File menu "탭 닫기" clicked via DOM closes active tab (FR-N6b)');

    // ------------------------------------------------------------------------
    // 19. Pane Disappearance & Last Empty Pane Invariants (FR-C4, FR-J1, FR-J7)
    // ------------------------------------------------------------------------
    editor.clear();
    const g1 = editor.getActiveGroup();
    const tabG1 = editor.openItem('/workspace/p1.txt', 'p1.txt', { mode: 'pinned' }, g1);

    const g2 = await uiSplit(g1, 'right');
    const tabG2 = editor.openItem('/workspace/p2.txt', 'p2.txt', { mode: 'pinned' }, g2);

    record('P4-MULTI-GROUP-INIT', editor.getGroupCount() === 2, '2 groups exist before closing tab in g2');
    await uiCloseTab(tabG2.id);
    record('P4-FR-J1', editor.getGroupCount() === 1, 'Group disappears when a user closes its last tab with the tab close button and another group exists (FR-C4, FR-J1)');

    // A8 Round-1 (Major): the group-collapse transition was only ever driven
    // by the tab's [x]. Ctrl+W closing a group's LAST tab is a separate code
    // path (closeActiveTab -> confirmAndClose), and breaking just that one
    // left the suite green. Drive the same transition from the keyboard.
    const g2b = await uiSplit(g1, 'right');
    const tabG2b = editor.openItem('/workspace/p2b.txt', 'p2b.txt', { mode: 'pinned' }, g2b);
    await wait(60);
    const groupsBeforeCtrlWLast = editor.getGroupCount();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'w', ctrlKey: true, bubbles: true, cancelable: true,
    }));
    await wait(120);
    record(
      'P4-FR-J1-CTRLW',
      groupsBeforeCtrlWLast === 2 && editor.getGroupCount() === 1,
      'Group disappears when Ctrl+W closes its last tab and another group exists (FR-C4, FR-J1, FR-N6b)'
    );

    // Close last tab of the only remaining group, again from its own [x]
    await uiCloseTab(tabG1.id);
    record('P4-FR-J7-COUNT', editor.getGroupCount() === 1 && editor.getPanelCount() === 0, 'Last group remains as empty pane (칸 수 1, 탭 수 0) (FR-C4, FR-J7)');
    record('P4-FR-J7-DOM', editorContainer.children.length > 0, 'Editor container remains visible in DOM on empty pane (FR-J7)');

    // ------------------------------------------------------------------------
    // 20. "활성 칸 탭 모두 닫기" (FR-J2, FR-J3, FR-J4, FR-J5)
    // ------------------------------------------------------------------------
    // In empty pane, closeAllTabsInGroup changes nothing (FR-J4)
    clickMenuRow('view', 'view:close-active-tabs');
    await wait(20); // closeAllTabsInGroup is async (Phase 6: dirty-confirmation gate on every panel close)
    record('P4-FR-J4', editor.getGroupCount() === 1 && editor.getPanelCount() === 0, '"활성 칸 탭 모두 닫기" on empty pane changes nothing (FR-J4)');

    // Multi-tab group close & disposal count test (FR-J2, FR-J5)
    editor.clear();
    const mg1 = editor.getActiveGroup();
    const mt1 = editor.openItem('/workspace/m1.txt', 'm1.txt', { mode: 'pinned' }, mg1);
    const mt2 = editor.openItem('/workspace/m2.txt', 'm2.txt', { mode: 'pinned' }, mg1);
    const mt3 = editor.openItem('/workspace/m3.txt', 'm3.txt', { mode: 'pinned' }, mg1);

    // Create 2nd pane so mg1 disappears when closed
    const mg2 = editor.splitActiveGroup('right');
    editor.openItem('/workspace/mOther.txt', 'mOther.txt', { mode: 'pinned' }, mg2);

    // Make mg1 active
    editor.setActiveGroup(mg1);

    // Trigger View menu "활성 칸 탭 모두 닫기" via DOM click
    clickMenuRow('view', 'view:close-active-tabs');
    await wait(20); // closeAllTabsInGroup is async (Phase 6: dirty-confirmation gate on every panel close)
    record('P4-FR-J2', editor.getGroupCount() === 1, '"활성 칸 탭 모두 닫기" closes multi-tab group and disappears when other group exists (FR-J2)');
    const d1 = editor.getLifecycleStats(mt1.id).disposalCount;
    const d2 = editor.getLifecycleStats(mt2.id).disposalCount;
    const d3 = editor.getLifecycleStats(mt3.id).disposalCount;
    record('P4-FR-J5', d1 === 1 && d2 === 1 && d3 === 1, '"활성 칸 탭 모두 닫기" disposes every tab in that group (FR-J5)');

    // ------------------------------------------------------------------------
    // 21. Restart from Empty Pane: 3 Paths (FR-J8)
    // ------------------------------------------------------------------------
    editor.clear();
    record('P4-RESTART-EMPTY', editor.getGroupCount() === 1 && editor.getPanelCount() === 0, 'Pane is empty (칸 수 1, 탭 수 0)');

    // Path 1: Tree item pick
    tree.focusItemById('/workspace/docA.txt');
    sendTreeKey('Enter');
    record('P4-FR-J8-PATH1', editor.getPanelCount() === 1, 'Restart path 1: picking file from tree opens first tab in empty pane (FR-J8)');

    // Return to empty pane
    editor.closeActiveTab();

    // Path 2 (v0.1): the Activity Bar split icon — gone in v0.2 (SPEC 0.1,
    // FR-C5, D-3). The ID is kept for the v0.1 matrix and now asserts absence.
    const actBtnRestart = document.querySelector('.activity-bar-item[data-item-id^="activity:split"]');
    record('P4-FR-J8-PATH2', actBtnRestart === null, 'Restart path 2 (Activity Bar split icon) no longer exists (v0.1 FR-J8 → v0.2 FR-C5)');

    // Path 3: View menu split item clicked in DOM
    clickMenuRow('view', 'view:split-vertical');
    record('P4-FR-J8-PATH3', editor.getGroupCount() === 2, 'Restart path 3: View menu split creates a 2nd pane from the empty pane (FR-J8)');

    // ------------------------------------------------------------------------
    // 22. Tab Dirty Indicator (FR-L1)
    // ------------------------------------------------------------------------
    editor.clear();
    const dTab = editor.openItem('/workspace/dirty.txt', 'dirty.txt', { mode: 'pinned' }, undefined);
    editor.setTabDirty(dTab.id, true);
    record('P4-FR-L1-SET', dTab.title.startsWith('●'), 'setTabDirty(true) prefixes title with ● (FR-L1)');
    editor.setTabDirty(dTab.id, false);
    record('P4-FR-L1-CLEAR', !dTab.title.includes('●'), 'setTabDirty(false) restores title without ● (FR-L1)');

    // ------------------------------------------------------------------------
    // 23. Zero Commands Invariant (FR-D8, FR-J3, FR-J6)
    // ------------------------------------------------------------------------
    const allMenuItems = menu.getGroups().flatMap((g) => g.items);
    const menuHasClosePane = allMenuItems.some((it) => it.label.includes('칸 닫기') || it.label.includes('칸 삭제') || it.id.includes('close-group'));
    record('P4-FR-D8-MENU', !menuHasClosePane, 'Menu contains zero 칸 닫기/칸 삭제 items (FR-D8, FR-J6)');

    const actBarHasClosePane = activityBar.getItems().some((it) => it.label.includes('칸 닫기') || it.label.includes('칸 삭제') || it.id.includes('close-group'));
    record('P4-FR-D8-ACTBAR', !actBarHasClosePane, 'Activity Bar contains zero 칸 닫기/칸 삭제 items (FR-D8, FR-J6)');

    const actBarHasCloseAll = activityBar.getItems().some((it) => it.label.includes('활성 칸 탭 모두 닫기') || it.id.includes('close-active-tabs'));
    record('P4-FR-J3-ACTBAR', !actBarHasCloseAll, 'Activity bar contains zero "활성 칸 탭 모두 닫기" items (FR-J3)');

    const viewHasCloseAll = allMenuItems.some((it) => it.id === 'view:close-active-tabs');
    record('P4-FR-J3-VIEWMENU', viewHasCloseAll, 'View menu contains "활성 칸 탭 모두 닫기" (FR-J2, FR-J3)');

    const allPassed = results.every((r) => r.pass);
    return { success: allPassed, results };
  } catch (err) {
    record('GLOBAL_EXCEPTION', false, 'Uncaught error in test suite: ' + (err?.message || err));
    return { success: false, results };
  }
};
