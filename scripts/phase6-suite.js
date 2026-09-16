/**
 * Host-neutral Phase 6 Acceptance Test Suite for workbench-kit.
 *
 * Can be executed in any browser environment (Electron, pywebview/WebView2, Chrome).
 * Expects `window.__testTmpDir` to be set by the runner to a real, readable
 * directory path before this suite runs (FR-K1 needs one real folder).
 * Returns a structured array of assertion results:
 *   { success: boolean, results: [{ id: string, pass: boolean, msg: string }] }
 */
window.__runPhase6TestSuite = async function runPhase6TestSuite() {
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
    const TextEditorView = window.__TextEditorView;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const activePanelContentEl = () => document.querySelector('.editor-panel-content');

    // Round-1 adversarial finding (Major): the original close/dirty tests
    // called `panel.api.close()` directly. dockview's own tab close button
    // does the exact same thing (see defaultTab.ts's click handler), so
    // clicking the REAL rendered button is what actually proves `wirePanelClose`
    // intercepts the path a user takes, not just the one a test calls.
    function findTabCloseButton(title) {
      const tabs = Array.from(document.querySelectorAll('.dv-tab'));
      const tab = tabs.find((t) => {
        const contentEl = t.querySelector('.dv-default-tab-content');
        return contentEl && contentEl.textContent === title;
      });
      return tab ? tab.querySelector('.dv-default-tab-action') : null;
    }

    async function clickTabCloseButton(title) {
      const btn = findTabCloseButton(title);
      if (btn) btn.click();
      return Boolean(btn);
    }

    function clickEl(el) {
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }

    /**
     * Switches to a tab by pressing it. dockview activates on `pointerdown`
     * and commits the switch in a requestAnimationFrame callback, so the host
     * window has to be painting (see the runners' `show: true`).
     * Returns false if there is no such tab to press.
     */
    async function uiActivateTab(panelId) {
      const el = document.querySelector('.dv-tab[data-tab-panel-id="' + panelId + '"]');
      if (!el) return false;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
      await wait(150);
      return true;
    }

    /** Walks the hamburger -> category -> item chain a user clicks through. */
    function clickMenuRow(categoryId, itemId) {
      const hamburger = document.getElementById('menu-hamburger-btn');
      if (!document.getElementById('workbench-menu-dropdown')) {
        clickEl(hamburger);
      }
      const catRow = document.querySelector(`.menu-category-row[data-category-id="${categoryId}"]`);
      if (catRow) clickEl(catRow);
      const itemRow = document.querySelector(`.menu-item-row[data-item-id="${itemId}"]`);
      if (!itemRow) throw new Error(`Menu row for ${itemId} not found in DOM`);
      clickEl(itemRow);
    }

    /**
     * Opens a folder the way a user does: File > 폴더 열기, with only the
     * native OS picker's return value stubbed (the runners read
     * `window.__nextDialogPath`). Everything between the menu row and the host
     * bridge stays real production code. Resolves once the tree root has
     * changed or the status bar has reported the failure.
     */
    async function uiOpenFolder(folderPath, timeoutMs) {
      const rootBefore = tree.getRoot();
      const statusBefore = document.getElementById('statusbar-message').textContent;
      window.__nextDialogPath = folderPath;
      clickMenuRow('file', 'file:open-folder');
      const deadline = Date.now() + (timeoutMs || 4000);
      while (Date.now() < deadline) {
        await wait(10);
        const rootNow = tree.getRoot();
        const statusNow = document.getElementById('statusbar-message').textContent;
        if (rootNow !== rootBefore || statusNow !== statusBefore) break;
      }
      // Let the status/progress bookkeeping settle before anything is read.
      await wait(80);
      delete window.__nextDialogPath;
    }

    async function clickDialogButton(choice) {
      await wait(30);
      const btn = document.querySelector(`.confirm-dialog-btn[data-choice="${choice}"]`);
      if (btn) btn.click();
      return Boolean(btn);
    }

    // ------------------------------------------------------------------------
    // 1. Monaco text/code view: mount, colorization, line numbers, find
    //    (FR-P1, FR-P2, WK-032)
    // ------------------------------------------------------------------------
    editor.clear();
    editor.openItem('/phase6/a.txt', 'a.txt', { meta: { kind: 'file' } });
    await wait(80);
    const contentEl = activePanelContentEl();
    const viewEl = contentEl ? contentEl.querySelector('.text-editor-view') : null;
    record('P6-FR-P1-MOUNTED', viewEl !== null, 'File preset mounts a monaco-backed text view (D-18)');

    const coloredTokenCount = viewEl ? viewEl.querySelectorAll('[class^="mtk"]').length : 0;
    record('P6-FR-P1-COLOR', coloredTokenCount > 0, `At least 1 syntax-colored token renders (found ${coloredTokenCount}) (FR-P1)`);
    record(
      'P6-FR-P1-LINENUM',
      Boolean(viewEl && viewEl.querySelector('.margin-view-overlays')),
      'Line-number column renders (FR-P1)'
    );

    // ------------------------------------------------------------------------
    // 1b. FR-G3: switching to a tab whose target has disappeared shows a
    //     status-bar error. Uses a real (but empty) directory so the parent
    //     lookup genuinely succeeds while the specific file genuinely does
    //     not exist — round-1 session review finding: this had 0 runtime
    //     coverage even though main.ts wires it via onActivePanelChange.
    // ------------------------------------------------------------------------
    if (window.__testTmpDir) {
      const missingFilePath = window.__testTmpDir.replace(/[/\\]+$/, '') + '\\phase6-missing-file.txt';
      const statusElForG3 = document.getElementById('statusbar-message');
      const panelBeforeG3 = editor.getActivePanel();
      // FR-G3 is specifically about switching TO an existing tab, so the
      // missing target needs its own panel, distinct from whatever is active.
      // v0.2 note: this used to be addNewTab() followed by openItem(), relying
      // on the [+] empty tab absorbing the open (v0.1 FR-B3). That rule is
      // superseded (SPEC 0.1), so the panel is opened directly and confirmed.
      const panelG3 = editor.openItem(missingFilePath, 'phase6-missing-file.txt', {
        mode: 'pinned',
        meta: { kind: 'file' },
      });
      // A8 Round-1 (Critical): both switches used to go through
      // `panel.api.setActive()`, so breaking the tab's own pointer activation
      // left this assertion passing while a user could no longer trigger the
      // error at all. Both switches now press the tab.
      if (panelBeforeG3) await uiActivateTab(panelBeforeG3.id);
      statusElForG3.textContent = '';
      statusElForG3.classList.remove('statusbar-message-error');
      const switchedToG3 = await uiActivateTab(panelG3.id);
      await wait(200);
      record(
        'P6-FR-G3',
        switchedToG3 &&
          editor.getActivePanel() &&
          editor.getActivePanel().id === panelG3.id &&
          statusElForG3.textContent.length > 0 &&
          statusElForG3.classList.contains('statusbar-message-error'),
        'Pressing the tab of a resource whose target no longer exists switches to it and shows a status-bar error (FR-G3)'
      );
    } else {
      record('P6-FR-G3', false, 'window.__testTmpDir was not provided by the runner');
    }

    // ------------------------------------------------------------------------
    // 2. Find/replace, undo/redo, read-only, and disabled features — all on
    //    isolated instances, driven through monaco's public action/edit APIs
    //    rather than synthetic keyboard events (which monaco's keybinding
    //    service does not reliably honor from script-dispatched, untrusted
    //    events) (FR-P2 ~ FR-P5, X-12, WK-032, WK-033)
    // ------------------------------------------------------------------------
    const surface = window.__workbenchAppSurface;

    const scratch = document.createElement('div');
    scratch.style.position = 'fixed';
    scratch.style.left = '-9999px';
    scratch.style.width = '400px';
    scratch.style.height = '200px';
    document.body.appendChild(scratch);

    // ------------------------------------------------------------------------
    // A7 Round-1 (R1-4) / Round-3 (R3-2) reopened: these three used to build
    // TextEditorView instances offscreen and drive them through test-only
    // helpers (`runActionForTest`, `triggerCommand`, `findAndReplaceForTest`),
    // on the stated grounds that monaco's keybinding service would not honour
    // script-dispatched events. That premise turned out to be wrong: the
    // blocker was the hidden host window, not the events. monaco commits a
    // keybinding through a requestAnimationFrame-driven path, so nothing
    // happened while the renderer was not painting. With a painting window
    // (see the runners) real keys land, so the shortcuts a user actually
    // presses are what is asserted below.
    // ------------------------------------------------------------------------

    /** The element monaco routes keyboard input through in this version. */
    function monacoInput(root) {
      return root.querySelector('.native-edit-context') || root.querySelector('textarea.inputarea');
    }

    /** Presses a key on the focused editor, the way a user would. */
    function pressKey(target, key, code, keyCode, mods) {
      target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({
        key: key, code: code, keyCode: keyCode, which: keyCode,
        bubbles: true, cancelable: true,
      }, mods || {})));
    }

    /** What the user can actually read in the editor viewport. */
    function visibleEditorText(root) {
      return Array.from(root.querySelectorAll('.view-line'))
        .map((l) => l.textContent.replace(/ /g, ' '))
        .join('\n');
    }

    /** Types into one of the find widget's own input boxes. */
    function fillWidgetInput(inputEl, value) {
      inputEl.focus();
      inputEl.value = value;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // FR-P2: open find/replace with Ctrl+H, drive the widget's own inputs and
    // press its own Replace All button.
    editor.clear();
    await editor.openItem('/workspace/find-me.js', 'find-me.js', { meta: { kind: 'file' } });
    await wait(400);
    const findRoot = document.querySelector('.monaco-editor');
    const findInputCtx = findRoot ? monacoInput(findRoot) : null;
    let findWidgetOpened = false;
    let replaceApplied = false;
    if (findInputCtx) {
      findInputCtx.focus();
      await wait(60);
      pressKey(findInputCtx, 'h', 'KeyH', 72, { ctrlKey: true });
      await wait(300);
      const widget = document.querySelector('.find-widget');
      findWidgetOpened = Boolean(widget && widget.classList.contains('visible'));
      if (widget) {
        const findBox = widget.querySelector('.find-part textarea.input, .find-part input.input');
        const replaceBox = widget.querySelector('.replace-part textarea.input, .replace-part input.input');
        // The Replace All button is a sibling of `.replace-part`, not inside
        // it, so address it by the label a screen reader would read out.
        const replaceAllBtn = widget.querySelector('.codicon-replace-all')
          || widget.querySelector('[aria-label^="Replace All"]');
        if (findBox && replaceBox && replaceAllBtn) {
          fillWidgetInput(findBox, 'preset');
          await wait(150);
          fillWidgetInput(replaceBox, 'PRESET');
          await wait(150);
          replaceAllBtn.click();
          await wait(250);
          replaceApplied = visibleEditorText(findRoot).includes('PRESET');
        }
      }
    }
    record('P6-FR-P2-FIND', findWidgetOpened, 'Pressing Ctrl+H in the editor opens the find/replace widget (FR-P2)');
    record('P6-FR-P2-REPLACE', replaceApplied, "The widget's own Replace All button replaces the match in the visible text (FR-P2)");

    // FR-P3: undo and redo through their real keyboard shortcuts, on the same
    // real tab, undoing the edit the Replace All button above actually made.
    // A8 Round-2 (Critical): this used to build an offscreen TextEditorView
    // and create its edit with `appendTextForTest()`, so breaking the wiring
    // between a real editor tab and the keyboard left it green.
    let afterUndoText = '';
    let afterRedoText = '';
    if (findInputCtx && replaceApplied) {
      findInputCtx.focus();
      await wait(60);
      pressKey(findInputCtx, 'z', 'KeyZ', 90, { ctrlKey: true });
      await wait(250);
      afterUndoText = visibleEditorText(findRoot);
      pressKey(findInputCtx, 'y', 'KeyY', 89, { ctrlKey: true });
      await wait(250);
      afterRedoText = visibleEditorText(findRoot);
    }
    record(
      'P6-FR-P3-UNDOREDO',
      replaceApplied && afterUndoText.includes('preset') && !afterUndoText.includes('PRESET') && afterRedoText.includes('PRESET'),
      'In a real editor tab, Ctrl+Z undoes the replace the widget made and Ctrl+Y redoes it, as seen in the visible text (undo: ' + JSON.stringify(afterUndoText) + ', redo: ' + JSON.stringify(afterRedoText) + ') (FR-P3)'
    );

    // FR-P4: read-only has to hold in a real tab against the same real
    // controls -- an app registers a read-only resource kind through the
    // documented registration slot (FR-I1), and neither a typed character nor
    // the find widget's Replace All may change what is on screen.
    // A8 Round-2 (Critical): the old version dispatched an untrusted
    // `beforeinput` (which has no default insertion behaviour) and then leaned
    // on `appendTextForTest()` for the real assertion.
    const RO_KIND = 'phase6-readonly';
    const roViews = [];
    surface.kindRegistry.register(RO_KIND, () => {
      const view = new TextEditorView({ value: 'read only content', language: 'plaintext', readOnly: true });
      roViews.push(view);
      return { element: view.element, dispose: () => view.dispose() };
    });
    editor.clear();
    await editor.openItem('/workspace/readonly.txt', 'readonly.txt', { meta: { kind: RO_KIND } });
    await wait(400);
    const roRoot = document.querySelector('.monaco-editor');
    const roTextBefore = roRoot ? visibleEditorText(roRoot) : '';
    let roReplaceAttempted = false;
    if (roRoot) {
      const roInputCtx = monacoInput(roRoot);
      if (roInputCtx) {
        roInputCtx.focus();
        await wait(60);
        pressKey(roInputCtx, 'X', 'KeyX', 88, {});
        await wait(120);
        pressKey(roInputCtx, 'h', 'KeyH', 72, { ctrlKey: true });
        await wait(300);
        const roWidget = document.querySelector('.find-widget');
        if (roWidget) {
          const roFind = roWidget.querySelector('.find-part textarea.input, .find-part input.input');
          const roReplace = roWidget.querySelector('.replace-part textarea.input, .replace-part input.input');
          const roReplaceAll = roWidget.querySelector('.codicon-replace-all')
            || roWidget.querySelector('[aria-label^="Replace All"]');
          if (roFind && roReplace && roReplaceAll) {
            fillWidgetInput(roFind, 'only');
            await wait(150);
            fillWidgetInput(roReplace, 'ONLY');
            await wait(150);
            roReplaceAll.click();
            await wait(300);
            roReplaceAttempted = true;
          }
        }
      }
    }
    const roTextAfter = roRoot ? visibleEditorText(roRoot) : '';
    record(
      'P6-FR-P4',
      roTextBefore.includes('read only content') &&
        roTextAfter === roTextBefore &&
        !roTextAfter.includes('ONLY'),
      'A read-only tab rejects a typed character and the find widget\'s Replace All; its visible text is unchanged (replace attempted: ' + roReplaceAttempted + ', text: ' + JSON.stringify(roTextAfter) + ') (FR-P4)'
    );
    editor.clear();
    for (const v of roViews) v.dispose();

    // monaco always creates a `.minimap` DOM node structurally (its class
    // name does not depend on the enabled option), so the actual signal for
    // "off" is that it renders with 0 width/height and 0 canvas content,
    // not that the element is absent.
    const minimapEls = Array.from(document.querySelectorAll('.minimap'));
    const anyMinimapVisible = minimapEls.some((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && el.querySelector('canvas');
    });
    record('P6-FR-P5-MINIMAP', !anyMinimapVisible, 'No minimap renders with visible size or canvas content (X-12, FR-P5)');

    // Round-1 session review finding: 'editor.action.insertCursorBelow' is
    // an action registered by the multiCursor contribution, which
    // texteditor.ts never imports — so getAction() returns undefined and
    // the test passed vacuously (nothing ran, rather than something being
    // blocked). 'createCursor' is a CORE command (coreCommands.js, always
    // present, no contribution needed), so this now actually creates a
    // second cursor and proves the collapse-back listener retracts it.
    const mcView = new TextEditorView({ value: 'a\nb\nc\nd', language: 'plaintext' });
    scratch.appendChild(mcView.element);
    await wait(20);
    mcView.triggerCommand('createCursor', { position: { lineNumber: 1, column: 1 } });
    mcView.triggerCommand('createCursor', { position: { lineNumber: 2, column: 1 } });
    await wait(20);
    record('P6-FR-P5-MULTICURSOR', mcView.getSelectionCount() === 1, 'A second cursor created via the core createCursor command is collapsed back to 1 (X-12, FR-P5)');
    mcView.dispose();
    scratch.removeChild(scratch.firstChild);

    // Round-1 session review finding: autocomplete/hover were only checked
    // via static source grep. Since texteditor.ts imports neither the
    // suggest nor hover contribution, their actions/controllers do not
    // exist at all — this asserts that structural absence directly,
    // which is stronger evidence of "off" than a behavioral probe would be
    // (a behavioral probe against an uninitialized feature is vacuous the
    // same way the multi-cursor one was).
    const featureCheckView = new TextEditorView({ value: 'const x = ;;;', language: 'javascript' });
    scratch.appendChild(featureCheckView.element);
    await wait(20);
    record(
      'P6-FR-P5-SUGGEST',
      !featureCheckView.hasActionForTest('editor.action.triggerSuggest'),
      'The suggest/autocomplete controller is not registered at all, so quickSuggestions cannot fire (X-12, FR-P5)'
    );
    record(
      'P6-FR-P5-HOVER',
      !featureCheckView.hasActionForTest('editor.action.showHover'),
      'The hover (language service) controller is not registered at all (X-12, FR-P5)'
    );
    // Round-1 adversarial finding (Minor): FR-P5's literal wording also
    // requires "오류 표시 0건" (0 error markers), which the suggest/hover
    // absence checks above never exercised. Deliberately invalid syntax
    // still produces 0 markers, since no diagnostics worker is imported.
    await wait(150);
    record(
      'P6-FR-P5-MARKERS',
      featureCheckView.getMarkerCountForTest() === 0,
      'Syntactically invalid content produces 0 error markers — no language-service diagnostics worker is imported (X-12, FR-P5)'
    );
    featureCheckView.dispose();
    scratch.remove();

    // ------------------------------------------------------------------------
    // 4. Dirty indicator and save-confirmation dialog (FR-L1 ~ FR-L7, FR-P7,
    //    WK-034). Uses a lightweight fake view (no monaco instance) — this
    //    exercises the shell's own dirty/confirm/save plumbing in
    //    kind-registry.ts and editor.ts, which is what FR-L1 ~ FR-L7 are
    //    actually about; monaco itself is already covered in section 2.
    // ------------------------------------------------------------------------
    editor.clear();
    let saveCallCount = 0;
    const dirtySetters = new Map();
    app.kindRegistry.register('phase6-test-kind', (targetId) => {
      const element = document.createElement('div');
      element.className = 'phase6-fake-view';
      let dirtyCb = null;
      dirtySetters.set(targetId, (dirty) => {
        if (dirtyCb) dirtyCb(dirty);
      });
      return {
        element,
        dispose: () => dirtySetters.delete(targetId),
        onDirtyChange: (cb) => {
          dirtyCb = cb;
          return () => {
            dirtyCb = null;
          };
        },
        save: () => {
          saveCallCount++;
          return true;
        },
      };
    });

    function openDirtyTestTab(targetId) {
      return editor.openItem(`/phase6/${targetId}`, targetId, { meta: { kind: 'phase6-test-kind' } });
    }

    // FR-L1: dirty indicator appears and clears
    editor.addNewTab();
    const panelA = openDirtyTestTab('l1.txt');
    await wait(30);
    dirtySetters.get('/phase6/l1.txt')(true);
    await wait(20);
    record('P6-FR-L1-SET', (panelA.title || '').startsWith('●'), 'Marking a view dirty adds the ● indicator (FR-L1)');
    dirtySetters.get('/phase6/l1.txt')(false);
    await wait(20);
    record('P6-FR-L1-CLEAR', !(panelA.title || '').startsWith('●'), 'Marking it saved again clears ● (FR-L1)');

    // FR-L7: closing an unmodified tab shows 0 dialogs
    const panelClean = openDirtyTestTab('clean.txt');
    await wait(20);
    const panelCountBeforeClean = editor.getPanelCount();
    const cleanCloseClicked = await clickTabCloseButton('clean.txt');
    await wait(30);
    record(
      'P6-FR-L7',
      cleanCloseClicked && editor.getPanelCount() === panelCountBeforeClean - 1 && !app.confirmDialog.isOpen(),
      "Clicking the tab's own close button on an unmodified tab closes it immediately with 0 confirm dialogs (FR-L7)"
    );

    // FR-L2, FR-L5: dirty tab close shows exactly 3 buttons; Cancel keeps it open
    const panelCancel = openDirtyTestTab('cancel.txt');
    await wait(20);
    dirtySetters.get('/phase6/cancel.txt')(true);
    await wait(20);
    const cancelCloseClicked = await clickTabCloseButton('● cancel.txt');
    await wait(30);
    const dialogButtons = Array.from(document.querySelectorAll('.confirm-dialog-btn')).map((b) => b.dataset.choice);
    record(
      'P6-FR-L2',
      cancelCloseClicked && app.confirmDialog.isOpen() && dialogButtons.length === 3 && dialogButtons.includes('save') && dialogButtons.includes('discard') && dialogButtons.includes('cancel'),
      "Clicking the tab's own close button on a dirty tab shows a confirm dialog with exactly [Save, Don't Save, Cancel] (FR-L2)"
    );
    await clickDialogButton('cancel');
    await wait(30);
    record(
      'P6-FR-L5',
      editor.getPanels().some((p) => p.id === panelCancel.id) && (panelCancel.title || '').startsWith('●'),
      'Cancel leaves the tab open with its edits and ● intact (FR-L5)'
    );

    // FR-L4, FR-P7: Discard closes without calling save
    const saveCallsBeforeDiscard = saveCallCount;
    await clickTabCloseButton('● cancel.txt');
    await clickDialogButton('discard');
    await wait(30);
    record(
      'P6-FR-L4',
      !editor.getPanels().some((p) => p.id === panelCancel.id) && saveCallCount === saveCallsBeforeDiscard,
      "Don't Save closes the tab with 0 additional save calls (FR-L4, FR-P7)"
    );

    // FR-L3: Save calls the app-registered handler exactly once, then closes
    const panelSave = openDirtyTestTab('save.txt');
    await wait(20);
    dirtySetters.get('/phase6/save.txt')(true);
    await wait(20);
    const saveCallsBeforeSave = saveCallCount;
    await clickTabCloseButton('● save.txt');
    await clickDialogButton('save');
    await wait(30);
    record(
      'P6-FR-L3',
      saveCallCount === saveCallsBeforeSave + 1 && !editor.getPanels().some((p) => p.id === panelSave.id),
      "Save calls the save handler exactly once and then closes the tab (FR-L3)"
    );

    // FR-L6: quitting with a dirty tab open shows the same confirm dialog.
    // The Cancel case goes through the real exit path — handleExitRequest()
    // now does nothing but call closeWindow(), the exact same call the
    // title-bar close button makes, which reaches each host's actual native
    // close gate (Electron's win.on('close'), pywebview's events.closing) and
    // only THAT gate calls confirmQuit(). This proves the gate itself asks
    // and honors Cancel, not just that confirmQuit() returns the right value
    // in isolation (round-2 adversarial finding, Major). The Discard case
    // stays on confirmQuit() directly: letting the real gate's affirmative
    // path run to completion would actually tear down this very host
    // process, killing the test harness mid-run before it could report.
    const panelQuit = openDirtyTestTab('quit.txt');
    await wait(20);
    dirtySetters.get('/phase6/quit.txt')(true);
    await wait(20);
    app.handleExitRequest();
    // Round-trip through IPC/events.closing and back into this renderer's
    // confirmQuit() takes longer than an in-process call.
    await wait(300);
    const dialogShownForQuit = app.confirmDialog.isOpen();
    await clickDialogButton('cancel');
    await wait(50);
    record(
      'P6-FR-L6-CANCEL',
      dialogShownForQuit && editor.getPanels().some((p) => p.id === panelQuit.id),
      "handleExitRequest() (the real File > Exit / title-bar / native-close path, through each host's actual close gate) asks first, and Cancel leaves the app running with the tab still open (FR-L6)"
    );

    const quitPromise2 = editor.confirmQuit();
    await clickDialogButton('discard');
    const quitResultDiscarded = await quitPromise2;
    record('P6-FR-L6-DISCARD', quitResultDiscarded === true, "Don't Save during quit confirms it's OK to quit (FR-L6)");

    // ------------------------------------------------------------------------
    // 5. Status bar messages and progress (FR-G2 ~ FR-G4, FR-N10a, FR-N10b, WK-035)
    // ------------------------------------------------------------------------
    const statusEl = document.getElementById('statusbar-message');

    // Driven through the real File > 폴더 열기 menu row now (A7 R1-4). Because
    // that path crosses an IPC boundary, "progress was shown" can no longer be
    // read synchronously the way a direct openFolder() call allowed: the
    // window between start and the ENOENT rejection is short and does not line
    // up with any single await here. Sample it instead, so the assertion is
    // "progress became visible at some point during the operation" -- which is
    // what FR-G4 actually promises the user.
    const statusTexts = [];
    const statusObserver = new MutationObserver(() => statusTexts.push(statusEl.textContent));
    statusObserver.observe(statusEl, { childList: true, characterData: true, subtree: true });
    await uiOpenFolder('C:\\definitely-does-not-exist-xyz123\\phase6-test');
    statusObserver.disconnect();
    // A8 Round-1 (Major): checking only that the progress text appeared let an
    // implementation that starts progress and immediately stops it -- before
    // the operation it describes has finished -- pass. Require that nothing
    // blanks the line between the progress text and the outcome: the entry
    // following the progress text has to be the error, not an empty string.
    const progressIndex = statusTexts.findIndex((t) => t.startsWith('Opening folder:'));
    const afterProgress = progressIndex >= 0 ? statusTexts.slice(progressIndex + 1) : [];
    const clearedEarly = afterProgress.some((t) => t.trim() === '');
    record(
      'P6-FR-G4-START',
      progressIndex >= 0 && !clearedEarly,
      'The status line shows the "Opening folder" progress text and keeps it until the operation reports its outcome, with no blank in between (saw: ' + JSON.stringify(statusTexts) + ') (FR-G4)'
    );
    record('P6-FR-G4-END', !app.statusMessages.isProgressActive(), 'Progress indicator clears once the operation finishes (FR-G4)');
    record(
      'P6-FR-G2',
      statusEl.textContent.length > 0 &&
        statusEl.classList.contains('statusbar-message-error') &&
        document.querySelectorAll('.workbench-context-menu, .workbench-confirm-overlay').length === 0,
      'Unreadable folder shows 1 status-bar error line and 0 floating elements (FR-G2)'
    );

    app.statusMessages.showMessage('shell message');
    surface.showStatusMessage('app message');
    record(
      'P6-FR-N10A',
      statusEl.textContent === 'app message' && !statusEl.classList.contains('statusbar-message-error'),
      "The app's message uses the exact text supplied and wins as the most recent (FR-N10a, D-32)"
    );

    surface.startStatusProgress('app progress');
    await wait(300);
    record('P6-FR-N10B-PERSIST', app.statusMessages.isProgressActive(), 'App-started progress is not auto-cleared by the shell (FR-N10b)');
    surface.stopStatusProgress();
    record('P6-FR-N10B-STOP', !app.statusMessages.isProgressActive(), 'App can turn its own progress off (FR-N10b)');

    // ------------------------------------------------------------------------
    // 6. Restart state and recent folders (FR-K1 ~ FR-K3, FR-N6a, WK-036)
    // ------------------------------------------------------------------------
    const testDir = window.__testTmpDir;
    if (testDir) {
      editor.clear();
      editor.openItem('/phase6/leftover.txt', 'leftover.txt', { meta: { kind: 'file' } });
      await wait(30);
      await uiOpenFolder(testDir);
      const savedPath = (() => {
        try {
          return localStorage.getItem('workbench:last-folder');
        } catch {
          return null;
        }
      })();
      record('P6-FR-K1-PERSIST', savedPath === testDir, 'Opening a folder persists it as the last-opened folder (FR-K1)');

      tree.clearRoot();
      // Simulates the fresh EditorController a real restart would start
      // with — 'leftover.txt' above stands in for whatever tabs were open
      // when the app last closed, which a real restart never resurrects.
      editor.clear();
      await app.restoreLastSession();
      await wait(100);

      // A8 Round-1 (Critical): this used to accept any sidebar title other
      // than 'EXPLORER', so a restore that reopened an entirely different
      // folder passed. FR-K1 requires the restored root to BE the folder that
      // was last opened, so compare the root's identity, not its emptiness.
      const restoredRoot = tree.getRoot();
      const restartOk = editor.getGroupCount() === 1 && editor.getPanelCount() === 0;
      record(
        'P6-FR-K1-RESTORE',
        Boolean(restoredRoot) && restoredRoot.id === testDir,
        'Restart reopens exactly the last-opened folder as the tree root (restored: ' + (restoredRoot ? restoredRoot.id : 'none') + ', expected: ' + testDir + ') (FR-K1)'
      );
      record('P6-FR-K2', restartOk, "restoreLastSession() itself adds 0 tabs/panes; prior tabs/panes are not restored (FR-K2, D-27)");

      const visibleRows = document.querySelectorAll('.tree-row:not(.tree-input-row)');
      record('P6-FR-K3', visibleRows.length <= 1, 'Restart shows only the root row; tree expansion is not restored (FR-K3, D-27)');

      // FR-N6a, D-16: "최근에 연 폴더 목록" — proves picking a SPECIFIC,
      // non-most-recent entry from the list works, not just "reopen the
      // last one" (round-1 session review finding: the old test only had
      // 1 recent folder, so it passed by coincidence even though the menu
      // exposed no way to pick among several).
      const testDir2 = window.__testTmpDir2;
      if (testDir2) {
        await app.openFolder(testDir2);
        await wait(80);
        const recentAfterBoth = app.getRecentFolders();
        record(
          'P6-FR-N6A-LIST',
          recentAfterBoth[0] === testDir2 && recentAfterBoth.includes(testDir),
          'The recent-folders list keeps both distinct entries, most recent first (D-16)'
        );

        tree.clearRoot();
        // v0.2 FR-M7: the list is File > Recent Folders' own submenu.
        clickMenuRow('file', 'file:open-recent');
        await wait(30);
        const pickerItems = Array.from(document.querySelectorAll('.menu-child-submenu[data-parent-item="file:open-recent"] > .menu-item-row'));
        const targetItem = pickerItems.find((el) => el.querySelector('.menu-item-label')?.textContent === testDir);
        record(
          'P6-FR-N6A-PICKER',
          pickerItems.length === recentAfterBoth.length && Boolean(targetItem),
          "File > Recent Folders shows every stored entry, not only the most recent (FR-N6a, D-16, v0.2 FR-M7)"
        );
        if (targetItem) targetItem.click();
        await wait(80);
        record(
          'P6-FR-N6A',
          // Same A8 Round-1 (Critical) correction as FR-K1: identify the root
          // that got opened instead of merely noting the title changed.
          Boolean(tree.getRoot()) && tree.getRoot().id === testDir && localStorage.getItem('workbench:last-folder') === testDir,
          'Picking the OLDER (non-most-recent) entry reopens THAT folder as the tree root, same as Open Folder would (FR-N6a)'
        );
      } else {
        record('P6-FR-N6A-LIST', false, 'window.__testTmpDir2 was not provided by the runner');
        record('P6-FR-N6A-PICKER', false, 'window.__testTmpDir2 was not provided by the runner');
        record('P6-FR-N6A', false, 'window.__testTmpDir2 was not provided by the runner');
      }
    } else {
      record('P6-FR-K1-PERSIST', false, 'window.__testTmpDir was not provided by the runner');
      record('P6-FR-K1-RESTORE', false, 'window.__testTmpDir was not provided by the runner');
      record('P6-FR-K2', false, 'window.__testTmpDir was not provided by the runner');
      record('P6-FR-K3', false, 'window.__testTmpDir was not provided by the runner');
      record('P6-FR-N6A-LIST', false, 'window.__testTmpDir was not provided by the runner');
      record('P6-FR-N6A-PICKER', false, 'window.__testTmpDir was not provided by the runner');
      record('P6-FR-N6A', false, 'window.__testTmpDir was not provided by the runner');
    }

    return { success: results.every((r) => r.pass), results };
  } catch (err) {
    record('RUNNER_ERR', false, 'Unhandled error in Phase 6 suite: ' + (err && err.stack ? err.stack : String(err)));
    return { success: false, results };
  }
};
