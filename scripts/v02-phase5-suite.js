/**
 * Host-neutral v0.2 Phase 5 acceptance suite — 탐색기 구조.
 *
 * Covers FR-X1 ~ FR-X9.
 *
 * Judged on screen (NFR-3): the explorer header text, the rendered view-action
 * buttons and their x order, real pointer drags on the resize handle, and the
 * measured x of tree icons and indent guides. Actions go through the buttons,
 * keys and input rows a user operates. The runner provides window.__testTmpDir
 * (a real folder two levels deep) and never stubs the tree data.
 */
window.__runV02Phase5Suite = async function runV02Phase5Suite() {
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

    const tree = app.tree;
    const dir = window.__testTmpDir;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const byId = (id) => document.getElementById(id);

    function visible(el) {
      if (!el) return false;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    async function clickEl(el) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(60);
    }

    async function until(check, ms) {
      const end = Date.now() + (ms || 3000);
      while (Date.now() < end) {
        if (check()) return true;
        await wait(40);
      }
      return Boolean(check());
    }

    const headerTitle = byId('sidebar-title');
    const newFileBtn = byId('sidebar-action-new-file');
    const newFolderBtn = byId('sidebar-action-new-folder');
    const refreshBtn = byId('sidebar-action-refresh');
    const collapseAllBtn = byId('sidebar-action-collapse-all');

    // ------------------------------------------------------------------------
    // FR-X1 — the explorer title is always EXPLORER
    // ------------------------------------------------------------------------
    {
      const beforeText = headerTitle ? headerTitle.textContent.trim() : null;
      await app.openFolder(dir);
      await until(() => tree.getRoot() && tree.getRoot().id === dir, 4000);
      await wait(80);
      const afterText = headerTitle ? headerTitle.textContent.trim() : null;
      const rootLeaf = String(dir).split(/[\\/]/).filter(Boolean).pop() || '';
      record(
        'V2P5-FR-X1',
        beforeText === 'EXPLORER' && afterText === 'EXPLORER' &&
          !(rootLeaf && new RegExp(rootLeaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(afterText)),
        'The explorer header reads EXPLORER before and after a folder is open, with 0 occurrences of the root folder name (FR-X1) ' +
          JSON.stringify({ beforeText, afterText, rootLeaf })
      );
    }

    // ------------------------------------------------------------------------
    // FR-X2 — New File · New Folder · Refresh · Collapse All, in that order
    // FR-X3 — 0 Preset Info in the view titlebar
    // ------------------------------------------------------------------------
    {
      const four = [newFileBtn, newFolderBtn, refreshBtn, collapseAllBtn];
      const allVisible = four.every(visible);
      const xs = four.map((el) => (el ? el.getBoundingClientRect().left : NaN));
      const inOrder = xs.every((x, i) => i === 0 || x > xs[i - 1]);
      const actionsHost = byId('sidebar-actions');
      const presetInHeader = actionsHost
        ? actionsHost.querySelectorAll('[data-id*="preset" i], [title*="Preset" i], [aria-label*="Preset" i]').length
        : -1;
      const headerText = byId('sidebar-header') ? byId('sidebar-header').textContent : '';
      record(
        'V2P5-FR-X2',
        allVisible && inOrder,
        'New File, New Folder, Refresh, Collapse All are all visible with strictly increasing x (FR-X2) ' + JSON.stringify(xs)
      );
      record(
        'V2P5-FR-X3',
        presetInHeader === 0 && !/preset/i.test(headerText),
        'The view titlebar contains 0 elements that call preset information (FR-X3) count=' + presetInHeader
      );
    }

    // ------------------------------------------------------------------------
    // FR-X4 — New File / New Folder open an inline input row; Enter -> app, Escape -> nothing
    // ------------------------------------------------------------------------
    {
      let calls = 0;
      let lastName = null;
      let lastType = null;
      let shellCreatedRows = 0;
      const rowsNow = () => tree.getVisibleItems().length;

      window.__workbenchAppSurface.setSidebarNewItemHandler((req) => {
        calls++;
        lastName = req.name;
        lastType = req.type;
      });
      await wait(20);

      // A9-style probe: any real filesystem write the shell might do would
      // change disk contents, which a refresh would then surface. Count rows
      // AND read the folder directly through the tree's provider before/after.
      const listDir = async () => {
        try {
          const kids = await tree.getDataProvider().getChildren(tree.getRoot());
          return kids.map((k) => k.label).sort();
        } catch {
          return null;
        }
      };
      const diskBefore = await listDir();

      // New File -> exactly one input row -> Enter commits once, verbatim, leaf.
      const rowsBefore = rowsNow();
      await clickEl(newFileBtn);
      await wait(40);
      const input1 = document.querySelector('.tree-input-row .tree-input-field');
      const opened1 = Boolean(input1) && document.querySelectorAll('.tree-input-row').length === 1;
      if (input1) {
        input1.value = '  spaced name .txt  ';
        input1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await wait(60);
      }
      const enterFileOK = calls === 1 && lastName === '  spaced name .txt  ' && lastType === 'leaf' &&
        document.querySelectorAll('.tree-input-row').length === 0;

      // New Folder -> input row -> Enter commits once as a container.
      const callsBeforeFolder = calls;
      await clickEl(newFolderBtn);
      await wait(40);
      const inputFolder = document.querySelector('.tree-input-row .tree-input-field');
      const openedFolder = Boolean(inputFolder) && document.querySelectorAll('.tree-input-row').length === 1;
      if (inputFolder) {
        inputFolder.value = 'a-new-folder';
        inputFolder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await wait(60);
      }
      const enterFolderOK = calls === callsBeforeFolder + 1 && lastName === 'a-new-folder' && lastType === 'container' &&
        document.querySelectorAll('.tree-input-row').length === 0;

      // New Folder -> input row -> Escape does nothing.
      const callsBeforeEscape = calls;
      await clickEl(newFolderBtn);
      await wait(40);
      const input2 = document.querySelector('.tree-input-row .tree-input-field');
      const opened2 = Boolean(input2);
      if (input2) {
        input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await wait(40);
      }
      const escapeOK = opened2 && calls === callsBeforeEscape && document.querySelectorAll('.tree-input-row').length === 0;

      const diskAfter = await listDir();
      const diskUnchanged = diskBefore !== null && diskAfter !== null &&
        JSON.stringify(diskBefore) === JSON.stringify(diskAfter);
      if (rowsNow() > rowsBefore) shellCreatedRows += rowsNow() - rowsBefore;

      record(
        'V2P5-FR-X4',
        opened1 && openedFolder && enterFileOK && enterFolderOK && escapeOK &&
          shellCreatedRows === 0 && diskUnchanged,
        'New File / New Folder open exactly one input row; Enter commits once with the verbatim name and generic leaf/container type; Escape does nothing; the shell adds 0 rows and the folder on disk is unchanged (FR-X4, NFR-6) ' +
          JSON.stringify({ opened1, openedFolder, enterFileOK, enterFolderOK, escapeOK, shellCreatedRows, diskUnchanged })
      );
    }

    // ------------------------------------------------------------------------
    // FR-X5 · FR-X6 · FR-X7 — resize by dragging the boundary
    // ------------------------------------------------------------------------
    {
      const sidebar = byId('sidebar');
      const editor = byId('editor-container');
      const handle = byId('sidebar-resize-handle');
      const root = byId('workbench-root');

      // Reset to the initial width (FR-X7's target) before measuring.
      root.style.removeProperty('--sidebar-width');
      await wait(40);
      const initialWidth = sidebar.getBoundingClientRect().width;
      const storageKeysBefore = (() => {
        try { return Object.keys(localStorage).slice(); } catch { return []; }
      })();
      const storageSnapshot = (() => {
        try { return JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))); }
        catch { return '{}'; }
      })();

      // A drag that samples the sidebar width AFTER EACH pointermove, so a
      // width that only jumps on pointerup would show as a step, not a ramp.
      async function drag(toClientX) {
        const hr = handle.getBoundingClientRect();
        const startX = hr.left + hr.width / 2;
        const y = hr.top + hr.height / 2;
        handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: startX, clientY: y, buttons: 1, pointerId: 1 }));
        const samples = [sidebar.getBoundingClientRect().width];
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const x = startX + ((toClientX - startX) * i) / steps;
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 1, pointerId: 1 }));
          await wait(8);
          samples.push(sidebar.getBoundingClientRect().width);
        }
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: toClientX, clientY: y, buttons: 0, pointerId: 1 }));
        await wait(20);
        return samples;
      }

      const editorBefore = editor.getBoundingClientRect().width;
      const sidebarBefore = sidebar.getBoundingClientRect().width;
      const ramp = await drag(handle.getBoundingClientRect().left + 160);
      const editorAfter = editor.getBoundingClientRect().width;
      const sidebarAfter = sidebar.getBoundingClientRect().width;
      // Continuous: at least 3 distinct intermediate widths, each >= the last.
      const distinctRamp = new Set(ramp.map(Math.round)).size;
      const monotone = ramp.every((w, i) => i === 0 || w >= ramp[i - 1] - 1);
      const widened = sidebarAfter > sidebarBefore + 40;
      const editorGaveSpace = Math.abs((editorBefore - editorAfter) - (sidebarAfter - sidebarBefore)) < 6;
      record(
        'V2P5-FR-X5',
        widened && editorGaveSpace && distinctRamp >= 3 && monotone,
        'Dragging the boundary widens the explorer through several intermediate widths (not one jump), and the editor area gives up exactly that space (FR-X5) ' +
          JSON.stringify({ ramp: ramp.map(Math.round), distinctRamp, editorDelta: Math.round(editorBefore - editorAfter), sidebarDelta: Math.round(sidebarAfter - sidebarBefore) })
      );

      // Keyboard path (NFR-8): focus the handle and nudge with arrows / Home.
      handle.focus();
      const kbFocused = document.activeElement === handle;
      const wKbStart = sidebar.getBoundingClientRect().width;
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await wait(20);
      const wKbWider = sidebar.getBoundingClientRect().width;
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      await wait(20);
      const wKbBack = sidebar.getBoundingClientRect().width;
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
      await wait(20);
      const wKbHome = sidebar.getBoundingClientRect().width;
      record(
        'V2P5-FR-X5-KEYBOARD',
        kbFocused && wKbWider > wKbStart && wKbBack < wKbWider && wKbHome < wKbBack,
        'The resize handle is focusable and ArrowRight / ArrowLeft / Home change the explorer width (FR-X5, NFR-8) ' +
          JSON.stringify({ wKbStart: Math.round(wKbStart), wKbWider: Math.round(wKbWider), wKbBack: Math.round(wKbBack), wKbHome: Math.round(wKbHome) })
      );

      // Many app actions (FR-I10 allows any number) must not push the shell's
      // four or the title off screen at the minimum width (A13 R2 Major) — the
      // app-action box gives up space and clips first. And a button that is
      // clipped out of view must leave the tab order (A13 R3 Major).
      for (let n = 1; n <= 10; n++) {
        window.__workbenchAppSurface.addSidebarViewAction({
          id: 'app:sidebar:crowd-' + n, title: 'Crowd ' + n, iconClass: 'codicon-beaker', action: () => {},
        });
      }
      await wait(40);

      // Drag hard to the left, past any sane minimum.
      await drag(-400);
      await wait(30);
      const minWidth = sidebar.getBoundingClientRect().width;
      const header = byId('sidebar-header');
      const sr = sidebar.getBoundingClientRect();
      // The full title is painted, not ellipsized.
      const titleFullyPainted = headerTitle.scrollWidth <= headerTitle.getBoundingClientRect().width + 1;
      const titleInSidebar = visible(headerTitle) &&
        headerTitle.getBoundingClientRect().left >= sr.left - 1 &&
        headerTitle.getBoundingClientRect().right <= sr.right + 1;
      const actionsFit = [newFileBtn, newFolderBtn, refreshBtn, collapseAllBtn].every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= sr.left - 1 && r.right <= sr.right + 1 && visible(el);
      });
      // Try to go even narrower — it must not shrink further.
      await drag(-800);
      await wait(30);
      const clampedHard = Math.abs(sidebar.getBoundingClientRect().width - minWidth) < 2;

      // Every app-action button that is clipped out of the app-action box is
      // removed from the tab order (tabindex -1) and marked aria-hidden; every
      // one still visible is tabbable.
      const appBox = byId('sidebar-app-actions');
      const appBtns = appBox ? Array.from(appBox.children) : [];
      const boxRight = appBox ? appBox.getBoundingClientRect().right : 0;
      let clippedCount = 0;
      const clipStateOK = appBtns.every((b) => {
        const isClipped = b.getBoundingClientRect().right > boxRight + 1;
        if (isClipped) clippedCount++;
        return isClipped
          ? b.tabIndex === -1 && b.getAttribute('aria-hidden') === 'true'
          : b.tabIndex === 0 && !b.hasAttribute('aria-hidden');
      });

      record(
        'V2P5-FR-X6',
        titleFullyPainted && titleInSidebar && actionsFit && clampedHard && minWidth >= 100 &&
          clipStateOK && clippedCount > 0,
        'At the minimum width — with ten app actions crowding the header — the FULL EXPLORER text and all four shell actions stay inside the explorer, it will not shrink further, and every clipped app-action button is out of the tab order (FR-X6, FR-I10, NFR-8) ' +
          JSON.stringify({ minWidth: Math.round(minWidth), titleFullyPainted, titleInSidebar, actionsFit, clippedCount, clipStateOK })
      );

      // FR-X7 / D-8: the dragged width is never persisted. Prove it two ways —
      // (1) nothing width-related was written to localStorage by any of the
      // drags above, and (2) clearing the runtime override (what a fresh load
      // has) returns to the initial width, not the dragged one.
      const storageKeysAfter = (() => { try { return Object.keys(localStorage).slice(); } catch { return []; } })();
      const storageSnapshotAfter = (() => {
        try { return JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))); }
        catch { return '{}'; }
      })();
      const noNewStorage = storageKeysAfter.length === storageKeysBefore.length && storageSnapshotAfter === storageSnapshot;
      root.style.removeProperty('--sidebar-width');
      await wait(40);
      const afterReopen = sidebar.getBoundingClientRect().width;
      record(
        'V2P5-FR-X7',
        noNewStorage && Math.abs(afterReopen - initialWidth) < 2 && Math.abs(afterReopen - minWidth) > 10,
        'No drag wrote a width to storage, and clearing the runtime width returns to the initial value, not the dragged one (FR-X7, D-8) ' +
          JSON.stringify({ initialWidth: Math.round(initialWidth), afterReopen: Math.round(afterReopen), minWidth: Math.round(minWidth), noNewStorage })
      );
    }

    // ------------------------------------------------------------------------
    // FR-X8 · FR-X9 — nested indentation and the vertical guides
    // ------------------------------------------------------------------------
    {
      // Expand two levels deep.
      const rootNode = tree.getRoot();
      tree.setExpanded(rootNode.id, true);
      await wait(30);
      const firstFolder = tree.getVisibleItems().find((it) => it.node.isContainer && it.depth === 0);
      if (firstFolder) {
        tree.setExpanded(firstFolder.node.id, true);
        await wait(40);
        const sub = tree.getVisibleItems().find((it) => it.node.isContainer && it.depth === 1);
        if (sub) {
          tree.setExpanded(sub.node.id, true);
          await wait(40);
        }
      }
      await wait(40);

      const rowByDepth = {};
      for (const it of tree.getVisibleItems()) {
        if (rowByDepth[it.depth] === undefined) {
          const el = document.querySelector(`.tree-row[data-id="${CSS.escape(it.node.id)}"]`);
          if (el) rowByDepth[it.depth] = el;
        }
      }
      const depths = Object.keys(rowByDepth).map(Number).sort((a, b) => a - b);
      // Content start of a row = its twistie's left edge (a fixed-width box
      // present on every row, spacer or not).
      const contentX = (el) => {
        const t = el.querySelector('.tree-twistie');
        return t ? t.getBoundingClientRect().left : el.getBoundingClientRect().left;
      };
      const contentXs = depths.map((d) => contentX(rowByDepth[d]));
      const steps = [];
      for (let i = 1; i < contentXs.length; i++) steps.push(contentXs[i] - contentXs[i - 1]);
      const consistentStep = steps.length >= 2 && steps.every((s) => s > 0 && Math.abs(s - steps[0]) <= 1);
      record(
        'V2P5-FR-X8',
        depths.length >= 3 && contentXs.every((x, i) => i === 0 || x > contentXs[i - 1]) && consistentStep,
        'Each depth\'s row content starts further right than its parent\'s, by a constant step (FR-X8) ' +
          JSON.stringify({ depthsSeen: depths, contentXs: contentXs.map(Math.round), steps: steps.map(Math.round) })
      );

      const deepest = depths[depths.length - 1];
      const deepRow = rowByDepth[deepest];
      const units = deepRow ? Array.from(deepRow.querySelectorAll('.tree-indent-unit')) : [];
      const sidebarLeft = byId('sidebar').getBoundingClientRect().left;
      // Each unit's left edge is where its guide (::before at left:0) is drawn,
      // and it must line up with the content start of the row at that depth.
      const unitXs = units.map((u) => u.getBoundingClientRect().left);
      const guidesVisible = units.every((u) => {
        const cs = getComputedStyle(u, '::before');
        return cs.content !== 'none' && parseFloat(cs.width || '0') > 0;
      });
      const alignedToDepth = units.length === deepest &&
        unitXs.every((ux, i) => Math.abs(ux - contentXs[i]) <= 2);
      const noneGlued = unitXs.every((ux) => ux - sidebarLeft > 4);
      record(
        'V2P5-FR-X9',
        units.length > 0 && guidesVisible && alignedToDepth && noneGlued,
        'Each vertical guide (an indent unit\'s ::before) is drawn, sits at its depth\'s indent x, and 0 are glued to the explorer\'s left edge (FR-X9) ' +
          JSON.stringify({ unitXs: unitXs.map(Math.round), contentXs: contentXs.map(Math.round), sidebarLeft: Math.round(sidebarLeft) })
      );
    }

    const allPassed = results.every((r) => r.pass);
    return { success: allPassed, results };
  } catch (err) {
    record('GLOBAL_EXCEPTION', false, 'Uncaught error in v0.2 Phase 5 suite: ' + (err && err.stack ? err.stack : err));
    return { success: false, results };
  }
};
