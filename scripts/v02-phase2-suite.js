/**
 * Host-neutral v0.2 Phase 2 acceptance suite — 선택과 포커스 표시.
 *
 * Covers FR-P9, FR-F1 ~ FR-F11.
 *
 * Judged on screen (NFR-3): which area is current is read from
 * document.activeElement, the focus ring from computed outline style, the
 * selection mark from computed background, and "distinguishable" from a
 * measured contrast ratio. State is only ever produced by pressing keys,
 * rows, tabs and menu rows. The runner must populate window.__testTmpDir with
 * alpha.txt, beta.txt, gamma.txt, sub/ and file-01.txt ~ file-40.txt.
 */
window.__runV02Phase2Suite = async function runV02Phase2Suite() {
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
    const sidebarContent = document.getElementById('sidebar-content');

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    function rowEl(nodeId) {
      return Array.from(document.querySelectorAll('.tree-row[data-id]')).find(
        (el) => el.getAttribute('data-id') === nodeId
      ) || null;
    }

    function tabEl(panelId) {
      return document.querySelector('.dv-tab[data-tab-panel-id="' + panelId + '"]');
    }

    async function pickRow(nodeId) {
      const el = rowEl(nodeId);
      if (!el) throw new Error('pickRow: no row for ' + nodeId);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      await wait(120);
    }

    async function doublePressRow(nodeId) {
      const el = rowEl(nodeId);
      if (!el) throw new Error('doublePressRow: no row for ' + nodeId);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
      await wait(150);
    }

    /** A key press lands on whatever holds focus, like a real keyboard. */
    async function press(key, mods) {
      const target = document.activeElement || document.body;
      target.dispatchEvent(
        new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {}))
      );
      await wait(90);
    }

    async function pressTab(panelId) {
      const el = tabEl(panelId);
      if (!el) throw new Error('pressTab: no tab for ' + panelId);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
      await wait(150);
    }

    async function clickMenuRow(categoryId, itemId) {
      const hamburger = document.getElementById('menu-hamburger-btn');
      if (!document.getElementById('workbench-menu-dropdown')) {
        hamburger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      const catRow = document.querySelector('.menu-category-row[data-category-id="' + categoryId + '"]');
      if (catRow) catRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const itemRow = document.querySelector('.menu-item-row[data-item-id="' + itemId + '"]');
      if (!itemRow) throw new Error('Menu row for ' + itemId + ' not found');
      itemRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(120);
    }

    /** Which area holds keyboard focus: 'tree', 'g0', 'g1', ... */
    function currentArea() {
      const a = document.activeElement;
      if (!a || a === document.body) return 'none';
      if (sidebarContent.contains(a)) return 'tree';
      const idx = editor.getGroups().findIndex((g) => g.element.contains(a));
      return idx >= 0 ? 'g' + idx : 'other';
    }

    function looksPreview(panelId) {
      const el = tabEl(panelId);
      if (!el) return null;
      const content = el.querySelector('.dv-default-tab-content') || el;
      return getComputedStyle(content).fontStyle === 'italic';
    }

    function hasRing(el) {
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== 'none' && (parseFloat(cs.outlineWidth) || 0) >= 1;
    }

    function selectedRow() {
      return document.querySelector('.tree-row.selected');
    }

    /**
     * Presses genuinely empty explorer space, found on screen: a point below
     * the last row that elementFromPoint says is not a row. Returns null when
     * no such point exists, so a layout with no visible empty space cannot
     * pass by dispatching at the list element directly (A10 Major).
     */
    async function clickExplorerEmptySpace() {
      const rows = Array.from(sidebarContent.querySelectorAll('.tree-row[data-id]'));
      const box = sidebarContent.getBoundingClientRect();
      const lastBottom = rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : box.top;
      const x = box.left + box.width / 2;
      const y = lastBottom + 20;
      if (y >= box.bottom - 2) return null;
      const target = document.elementFromPoint(x, y);
      if (!target || !sidebarContent.contains(target) || target.closest('.tree-row')) return null;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      await wait(120);
      return target;
    }

    function parseRgb(c) {
      const m = /rgba?\(([^)]+)\)/.exec(c || '');
      if (!m) return null;
      const p = m[1].split(',').map((s) => parseFloat(s));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }

    function luminance(rgb) {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
    }

    function contrast(c1, c2) {
      const a = parseRgb(c1);
      const b = parseRgb(c2);
      if (!a || !b) return 0;
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    /** The colour actually painted behind an element: first opaque ancestor. */
    function effectiveBg(el) {
      for (let n = el; n; n = n.parentElement) {
        const c = parseRgb(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) return getComputedStyle(n).backgroundColor;
      }
      return 'rgb(255, 255, 255)';
    }

    /**
     * The hover colour as it is actually painted over a background: the
     * theme's hover value resolved on a probe element, then composited. A10
     * Major: comparing token strings passed for visually identical colours
     * written differently.
     */
    function paintedHover(over) {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--button-hover-bg)';
      sidebarContent.appendChild(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const f = parseRgb(resolved);
      const b = parseRgb(over);
      if (!f || !b) return over;
      const a = f.a;
      return 'rgb(' + Math.round(f.r * a + b.r * (1 - a)) + ', ' + Math.round(f.g * a + b.g * (1 - a)) + ', ' + Math.round(f.b * a + b.b * (1 - a)) + ')';
    }

    // ------------------------------------------------------------------------
    // Fixture
    // ------------------------------------------------------------------------
    const testDir = window.__testTmpDir;
    if (!testDir) {
      record('V2P2-FIXTURE', false, 'window.__testTmpDir was not provided by the runner');
      return { success: false, results };
    }
    const sep = testDir.includes('\\') ? '\\' : '/';
    const fileA = testDir + sep + 'alpha.txt';
    const fileB = testDir + sep + 'beta.txt';
    const fileC = testDir + sep + 'gamma.txt';
    const file01 = testDir + sep + 'file-01.txt';
    const file02 = testDir + sep + 'file-02.txt';

    await app.openFolder(testDir);
    await wait(300);
    const rootNode = tree.getRoot();
    if (rootNode) await tree.setExpanded(rootNode.id, true);
    await wait(250);
    editor.clear();
    await wait(100);
    record('V2P2-FIXTURE', rowEl(fileA) !== null && rowEl(file01) !== null, 'Fixture folder is open and its rows are on screen');

    // Two groups, each with a confirmed tab and a preview tab — built with the
    // same presses a user would make.
    async function buildTwoGroups() {
      editor.clear();
      await wait(100);
      await doublePressRow(fileA);
      await pickRow(fileB);
      const g0 = editor.getActiveGroup();
      const splitBtn = g0.element.querySelector('.tab-action-split-right');
      splitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(200);
      await doublePressRow(fileC);
      await pickRow(file01);
      await wait(100);
      return editor.getGroups();
    }

    // ------------------------------------------------------------------------
    // FR-P9 · FR-F11 — preview vs confirmed, in all three themes
    // ------------------------------------------------------------------------
    editor.clear();
    await wait(100);
    await doublePressRow(fileA);
    const pinnedForTheme = editor.getActivePanel();
    await pickRow(fileB);
    const previewForTheme = editor.getActivePanel();

    const themeRows = [];
    for (let i = 0; i < 3; i++) {
      const pinnedContent = tabEl(pinnedForTheme.id).querySelector('.dv-default-tab-content');
      const previewContent = tabEl(previewForTheme.id).querySelector('.dv-default-tab-content');
      const pinnedStyle = getComputedStyle(pinnedContent);
      const previewStyle = getComputedStyle(previewContent);
      themeRows.push({
        theme: app.theme.getTheme(),
        italicDiffers: pinnedStyle.fontStyle !== previewStyle.fontStyle,
        pinnedContrast: contrast(pinnedStyle.color, effectiveBg(pinnedContent)),
        previewContrast: contrast(previewStyle.color, effectiveBg(previewContent)),
      });
      await clickMenuRow('view', 'view:cycle-color-theme');
    }
    const themesSeen = new Set(themeRows.map((r) => r.theme)).size;
    record(
      'V2P2-FR-P9',
      themesSeen === 3 && themeRows.every((r) => r.italicDiffers && r.pinnedContrast >= 3 && r.previewContrast >= 3),
      'In all three themes preview and confirmed titles differ in slant and both read against their background (FR-P9) ' +
        JSON.stringify(themeRows.map((r) => [r.theme, r.italicDiffers, r.pinnedContrast.toFixed(2), r.previewContrast.toFixed(2)]))
    );

    // ------------------------------------------------------------------------
    // FR-F1 — F6 / Shift+F6 cycle the visible areas
    // ------------------------------------------------------------------------
    await buildTwoGroups();
    tree.focusTree();
    await wait(80);
    const forward = [currentArea()];
    for (let i = 0; i < 3; i++) {
      await press('F6');
      forward.push(currentArea());
    }
    const backward = [currentArea()];
    for (let i = 0; i < 3; i++) {
      await press('F6', { shiftKey: true });
      backward.push(currentArea());
    }
    record(
      'V2P2-FR-F1',
      JSON.stringify(forward) === JSON.stringify(['tree', 'g0', 'g1', 'tree']) &&
        JSON.stringify(backward) === JSON.stringify(['tree', 'g1', 'g0', 'tree']),
      'F6 visits tree → each pane → back to tree, and Shift+F6 goes the other way (FR-F1) forward=' +
        JSON.stringify(forward) + ' backward=' + JSON.stringify(backward)
    );


    // A10 finding: F6 followed dockview's insertion order, not what is on
    // screen. Make the two differ — drag a tab to the LEFT edge of its own
    // pane, which creates the new group to the left of the existing one while
    // it is still second in insertion order — and require that F6 visits the
    // left pane first.
    {
      editor.clear();
      await wait(100);
      await doublePressRow(fileA);
      await doublePressRow(fileB);
      const home = editor.getActiveGroup();
      const tabB = home.panels.find((p) => p.params && p.params.targetId === fileB);
      const tabBEl = tabB ? tabEl(tabB.id) : null;
      const homeContent = home.element.querySelector('.dv-content-container');
      if (tabBEl && homeContent) {
        const r = homeContent.getBoundingClientRect();
        const ex = r.left + 10;
        const ey = r.top + r.height / 2;
        const dt = new DataTransfer();
        tabBEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        homeContent.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ex, clientY: ey }));
        homeContent.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ex, clientY: ey }));
        homeContent.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ex, clientY: ey }));
        tabBEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await wait(250);
      }
      const groups = editor.getGroups();
      const groupOfB = groups.find((g) => g.panels.some((p) => p.params && p.params.targetId === fileB));
      const groupOfA = groups.find((g) => g.panels.some((p) => p.params && p.params.targetId === fileA));
      const layoutOk =
        groups.length === 2 &&
        groupOfB && groupOfA && groupOfB !== groupOfA &&
        groupOfB.element.getBoundingClientRect().left < groupOfA.element.getBoundingClientRect().left &&
        groups.indexOf(groupOfB) > groups.indexOf(groupOfA);

      tree.focusTree();
      await wait(80);
      await press('F6');
      const firstIsLeft = Boolean(groupOfB) && groupOfB.element.contains(document.activeElement);
      await press('F6');
      const secondIsRight = Boolean(groupOfA) && groupOfA.element.contains(document.activeElement);
      await press('F6');
      const backToTree = currentArea() === 'tree';
      record(
        'V2P2-FR-F1-ORDER',
        layoutOk && firstIsLeft && secondIsRight && backToTree,
        'F6 visits panes in screen order even when that differs from the order they were created in (FR-F1) layout=' +
          layoutOk + ' left-first=' + firstIsLeft + ' right-second=' + secondIsRight + ' tree-last=' + backToTree
      );
    }

    // Tab inside an editor stays with the editor (D-10, v0.1 FR-I6).
    const editorRoot = editor.getGroups()[0].element.querySelector('.monaco-editor');
    let tabStayed = false;
    if (editorRoot) {
      const input = editorRoot.querySelector('.native-edit-context') || editorRoot.querySelector('textarea');
      if (input) {
        input.focus();
        await wait(80);
        // A10 Minor: staying in the area is not enough — a shell that swallowed
        // Tab would also stay. Whether monaco then indents cannot be observed
        // from a synthetic event (its EditContext input ignores untrusted
        // typing), so the check targets what the shell controls: a Tab
        // delivered to the tab's view element, where only a shell listener
        // could prevent it, must arrive unprevented.
        const before = currentArea();
        await press('Tab');
        const viewRoot = editor.getGroups()[0].element.querySelector('.dv-content-container > *');
        let unprevented = false;
        if (viewRoot) {
          const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
          viewRoot.dispatchEvent(tabEvent);
          unprevented = tabEvent.defaultPrevented === false;
        }
        await wait(60);
        tabStayed = before === 'g0' && currentArea() === 'g0' && unprevented;
      }
    }
    record(
      'V2P2-FR-F1-TAB',
      tabStayed,
      'Tab pressed inside an editor does not move to another area — Tab is not reserved (FR-F1, D-10)'
    );

    // F6 inside a tab's view belongs to the view (v0.1 FR-I6 names F6 as an app
    // key; D-10 human decision). The shell must neither move focus nor swallow
    // the key, so the event's defaultPrevented is read back as well.
    let f6Stayed = false;
    let f6Unprevented = false;
    if (editorRoot) {
      const viewInput = editorRoot.querySelector('.native-edit-context') || editorRoot.querySelector('textarea');
      if (viewInput) {
        viewInput.focus();
        await wait(80);
        const before = currentArea();
        const f6Event = new KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true });
        viewInput.dispatchEvent(f6Event);
        await wait(90);
        f6Stayed = before === 'g0' && currentArea() === 'g0';
        f6Unprevented = f6Event.defaultPrevented === false;
      }
    }
    record(
      'V2P2-FR-F1-F6-VIEW',
      f6Stayed && f6Unprevented,
      'F6 pressed inside a tab view stays with that view: the area does not change and the key is not swallowed (FR-F1, v0.1 FR-I6) stayed=' +
        f6Stayed + ' unprevented=' + f6Unprevented
    );

    // ------------------------------------------------------------------------
    // FR-F2 — Ctrl+Tab stays inside the active pane
    // ------------------------------------------------------------------------
    {
      const groups = await buildTwoGroups();
      const g0 = groups[0];
      const g1 = groups[1];
      editor.focusGroup(g0);
      await wait(80);
      const g0Before = g0.activePanel && g0.activePanel.id;
      const g1Before = g1.activePanel && g1.activePanel.id;
      await press('Tab', { ctrlKey: true });
      const g0After = g0.activePanel && g0.activePanel.id;
      const g1After = g1.activePanel && g1.activePanel.id;
      await press('Tab', { ctrlKey: true, shiftKey: true });
      const g0Back = g0.activePanel && g0.activePanel.id;
      record(
        'V2P2-FR-F2',
        g0Before !== g0After &&
          g1Before === g1After &&
          editor.getActiveGroup() === g0 &&
          g0Back === g0Before,
        'Ctrl+Tab switches tabs only inside the active pane and Ctrl+Shift+Tab switches back; the other pane is untouched (FR-F2)'
      );
    }

    // ------------------------------------------------------------------------
    // FR-F3 — moving between areas changes nothing selected
    // ------------------------------------------------------------------------
    {
      const groups = await buildTwoGroups();
      await pickRow(fileC);
      tree.focusTree();
      await wait(80);
      const selBefore = selectedRow() && selectedRow().getAttribute('data-id');
      const activeBefore = groups.map((g) => g.activePanel && g.activePanel.id);
      for (let i = 0; i < 3; i++) await press('F6');
      const selAfter = selectedRow() && selectedRow().getAttribute('data-id');
      const activeAfter = editor.getGroups().map((g) => g.activePanel && g.activePanel.id);
      record(
        'V2P2-FR-F3',
        selBefore && selBefore === selAfter && JSON.stringify(activeBefore) === JSON.stringify(activeAfter),
        'A full F6 round leaves the tree selection and every pane\'s active tab unchanged (FR-F3)'
      );
    }

    // ------------------------------------------------------------------------
    // FR-F4 — hidden areas are skipped
    // ------------------------------------------------------------------------
    {
      await buildTwoGroups();
      await clickMenuRow('view', 'view:toggle-sidebar');
      editor.focusGroup(editor.getGroups()[0]);
      await wait(80);
      const visitsHidden = [];
      for (let i = 0; i < 4; i++) {
        await press('F6');
        visitsHidden.push(currentArea());
      }
      await clickMenuRow('view', 'view:toggle-sidebar');

      await press('F11');
      editor.focusGroup(editor.getGroups()[0]);
      await wait(80);
      const visitsZen = [];
      for (let i = 0; i < 4; i++) {
        await press('F6');
        visitsZen.push(currentArea());
      }
      await press('Escape');
      record(
        'V2P2-FR-F4',
        !visitsHidden.includes('tree') && !visitsZen.includes('tree') && visitsHidden.length === 4 && visitsZen.every((a) => a.startsWith('g')),
        'With the explorer hidden, and in Zen, F6 never lands in the tree (FR-F4) hidden=' +
          JSON.stringify(visitsHidden) + ' zen=' + JSON.stringify(visitsZen)
      );
    }

    // ------------------------------------------------------------------------
    // FR-F5 — pressing the explorer's empty space
    // ------------------------------------------------------------------------
    {
      editor.clear();
      await wait(100);
      await doublePressRow(fileA);
      await pickRow(fileB);
      const panelsBefore = editor.getPanelCount();
      const activeBefore = editor.getActivePanel().id;
      // The 40-file fixture fills the explorer, so collapse everything first to
      // leave real empty space below the rows (Ctrl+ArrowLeft, a v0.1 tree key).
      tree.focusTree();
      await wait(60);
      await press('ArrowLeft', { ctrlKey: true });
      await wait(120);
      editor.focusGroup(editor.getActiveGroup());
      await wait(80);
      const selBefore = selectedRow() && selectedRow().getAttribute('data-id');
      const emptyTarget1 = await clickExplorerEmptySpace();
      const selAfter = selectedRow() && selectedRow().getAttribute('data-id');
      const keepCase =
        emptyTarget1 !== null &&
        currentArea() === 'tree' &&
        selBefore === selAfter &&
        editor.getPanelCount() === panelsBefore &&
        editor.getActivePanel().id === activeBefore;

      // Nothing selected: Escape clears the selection, then the empty space.
      tree.focusTree();
      await wait(60);
      await press('Escape');
      const clearedOk = document.querySelectorAll('.tree-row.selected').length === 0;
      // Found on screen again: Escape re-renders the tree and replaces its
      // elements, so nothing located before it can be reused.
      const emptyTarget2 = await clickExplorerEmptySpace();
      const firstVisible = document.querySelector('.tree-row[data-id]');
      const nowSelected = selectedRow();
      const firstCase =
        emptyTarget2 !== null &&
        clearedOk &&
        nowSelected &&
        firstVisible &&
        nowSelected.getAttribute('data-id') === firstVisible.getAttribute('data-id') &&
        editor.getPanelCount() === panelsBefore;
      record(
        'V2P2-FR-F5',
        keepCase && firstCase,
        'Pressing the explorer\'s empty space brings focus to the tree, keeps the selection and opens nothing; with nothing selected the first visible row is selected (FR-F5) keep=' +
          keepCase + ' first=' + firstCase
      );
      // Setup restore, not behaviour under test: this block collapsed the
      // tree to make empty space, and every later block presses file rows.
      const rootAgain = tree.getRoot();
      if (rootAgain) await tree.setExpanded(rootAgain.id, true);
      await wait(200);
    }

    // ------------------------------------------------------------------------
    // FR-F6 — selection background stays, only the ring moves
    // ------------------------------------------------------------------------
    {
      await buildTwoGroups();
      await pickRow(fileC);
      tree.focusTree();
      await wait(80);
      const row = selectedRow();
      const bgInTree = getComputedStyle(row).backgroundColor;
      const ringInTree = hasRing(row);
      await press('F6');
      const rowAfter = selectedRow();
      const bgInPane = getComputedStyle(rowAfter).backgroundColor;
      const ringInPane = hasRing(rowAfter);
      record(
        'V2P2-FR-F6',
        ringInTree && !ringInPane && bgInTree === bgInPane && currentArea().startsWith('g'),
        'Moving focus tree → pane keeps the selected row\'s background and removes only its focus ring (FR-F6) ring ' +
          ringInTree + '→' + ringInPane + ', bg ' + bgInTree + '→' + bgInPane
      );
    }

    // ------------------------------------------------------------------------
    // FR-F7 · FR-F8 · FR-F9 — tree cursor and active tab are independent
    // ------------------------------------------------------------------------
    {
      const groups = await buildTwoGroups();
      await pickRow(fileA);
      const selBefore = selectedRow() && selectedRow().getAttribute('data-id');
      const otherTab = groups[1].panels.find((p) => p !== groups[1].activePanel) || groups[1].panels[0];
      await pressTab(otherTab.id);
      const selAfter = selectedRow() && selectedRow().getAttribute('data-id');
      record(
        'V2P2-FR-F7',
        selBefore === selAfter && editor.getActivePanel().id === otherTab.id,
        'Switching the active tab does not drag the tree cursor along (FR-F7)'
      );

      tree.focusTree();
      await wait(60);
      const activeBefore = editor.getActivePanel().id;
      const countBefore = editor.getPanelCount();
      for (let i = 0; i < 3; i++) await press('ArrowDown');
      record(
        'V2P2-FR-F8',
        editor.getActivePanel().id === activeBefore && editor.getPanelCount() === countBefore,
        'Moving the tree cursor with arrow keys changes neither the active tab nor the tab count (FR-F8)'
      );

      await press('End');
      await wait(120);
      const listEl = sidebarContent.querySelector('.tree-list');
      const last = selectedRow();
      const lr = last ? last.getBoundingClientRect() : null;
      const vr = listEl.getBoundingClientRect();
      const overflowing = listEl.scrollHeight > listEl.clientHeight;
      record(
        'V2P2-FR-F9',
        overflowing && lr && lr.bottom > vr.top && lr.top < vr.bottom && listEl.scrollTop > 0,
        'Moving the cursor past the visible rows scrolls its row back into view (FR-F9) overflowing=' + overflowing
      );
    }

    // A10 Major: a real press on a dirty tab's close button opens the
    // confirmation dialog; the group's deferred focus pull used to take focus
    // back from it. Deliver the real pointer sequence, not just click().
    {
      editor.clear();
      await wait(100);
      await doublePressRow(fileA);
      const dirtyTab = editor.getActivePanel();
      editor.setTabDirty(dirtyTab.id, true);
      await wait(60);
      const closeBtn = tabEl(dirtyTab.id).querySelector('.dv-default-tab-action');
      closeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
      closeBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(250);
      const overlay = document.querySelector('.workbench-confirm-overlay');
      const focusInDialog = Boolean(overlay) && overlay.contains(document.activeElement);
      const cancelBtn = document.querySelector('.confirm-dialog-btn[data-choice="cancel"]');
      if (cancelBtn) {
        cancelBtn.click();
        await wait(120);
      }
      record(
        'V2P2-DIALOG-FOCUS',
        focusInDialog,
        "Pressing a dirty tab's close button leaves keyboard focus in the confirmation dialog it opens (FR-F10, D-28)"
      );
    }

    // ------------------------------------------------------------------------
    // FR-F10 · FR-F11 — every pane shows its active tab, one ring, all themes
    // ------------------------------------------------------------------------
    const perTheme = [];
    for (let t = 0; t < 3; t++) {
      const groups = await buildTwoGroups();
      editor.focusGroup(groups[1]);
      await wait(100);
      const active0 = tabEl(groups[0].activePanel.id);
      const active1 = tabEl(groups[1].activePanel.id);
      const inactive0 = tabEl(groups[0].panels.find((p) => p !== groups[0].activePanel).id);
      const ringed = Array.from(document.querySelectorAll('.dv-tab')).filter(hasRing);
      const ringOnG1 = ringed.length === 1 && ringed[0] === active1;
      editor.focusGroup(groups[0]);
      await wait(100);
      const ringedAfter = Array.from(document.querySelectorAll('.dv-tab')).filter(hasRing);
      const ringMoved = ringedAfter.length === 1 && ringedAfter[0] === tabEl(groups[0].activePanel.id);
      const bgActive0 = getComputedStyle(active0).backgroundColor;
      const bgActive1 = getComputedStyle(active1).backgroundColor;
      const bgInactive0 = getComputedStyle(inactive0).backgroundColor;
      const ringColor = getComputedStyle(tabEl(groups[0].activePanel.id)).outlineColor;
      const ringContrast = contrast(ringColor, bgActive0);

      tree.focusTree();
      await wait(60);
      const cursorRow = document.querySelector('.tree-row.focused');
      const selRow = selectedRow();
      const sidebarBg = getComputedStyle(document.getElementById('sidebar')).backgroundColor;
      const rootStyle = getComputedStyle(document.documentElement);
      const hoverToken = rootStyle.getPropertyValue('--button-hover-bg').trim();
      const selectionToken = rootStyle.getPropertyValue('--menu-hover-bg').trim();

      perTheme.push({
        theme: app.theme.getTheme(),
        ringOnG1,
        ringMoved,
        activeBgsMatch: bgActive0 === bgActive1 && bgActive0 !== bgInactive0,
        ringContrast,
        treeRing: hasRing(cursorRow),
        selectionReads: selRow ? contrast(getComputedStyle(selRow).backgroundColor, sidebarBg) : 0,
        hoverVsSelection: selRow ? contrast(paintedHover(sidebarBg), getComputedStyle(selRow).backgroundColor) : 0,
        cursorRingReads: cursorRow
          ? contrast(
              getComputedStyle(cursorRow).outlineColor,
              parseRgb(getComputedStyle(cursorRow).backgroundColor) && parseRgb(getComputedStyle(cursorRow).backgroundColor).a > 0
                ? getComputedStyle(cursorRow).backgroundColor
                : sidebarBg
            )
          : 0,
      });
      await clickMenuRow('view', 'view:cycle-color-theme');
    }
    record(
      'V2P2-FR-F10',
      perTheme.every((r) => r.ringOnG1 && r.ringMoved && r.activeBgsMatch),
      'Every pane keeps its active-tab background, exactly one active tab carries the focus ring, and the ring follows the focused pane (FR-F10)'
    );
    record(
      'V2P2-FR-F11',
      new Set(perTheme.map((r) => r.theme)).size === 3 &&
        perTheme.every(
          (r) => r.ringContrast >= 3 && r.treeRing && r.cursorRingReads >= 3 && r.selectionReads >= 1.3 && r.hoverVsSelection >= 1.2
        ),
      'In all three themes the focus ring reads against its tab (≥3:1), the tree cursor ring shows, the selection stands off the sidebar, and hover differs from selection (FR-F11) ' +
        JSON.stringify(perTheme.map((r) => [r.theme, 'tabRing ' + r.ringContrast.toFixed(2), 'cursorRing ' + r.cursorRingReads.toFixed(2), 'sel/sidebar ' + r.selectionReads.toFixed(2), 'hover/sel ' + r.hoverVsSelection.toFixed(2)]))
    );

    const success = results.every((r) => r.pass);
    return { success, results };
  } catch (err) {
    record('RUNNER_ERR', false, 'Unhandled error in v0.2 Phase 2 suite: ' + String(err && err.stack ? err.stack : err));
    return { success: false, results };
  }
};
