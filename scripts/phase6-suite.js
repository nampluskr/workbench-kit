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
      // openItem() on the currently-active tab updates it IN PLACE (FR-B1) —
      // dockview does not fire onDidActivePanelChange for that, since the
      // active panel reference never changes. FR-G3 is specifically about
      // switching TO an existing tab, so this creates a second, genuinely
      // different panel and then explicitly switches TO it.
      const panelG3 = editor.addNewTab();
      editor.openItem(missingFilePath, 'phase6-missing-file.txt', { meta: { kind: 'file' } });
      if (panelBeforeG3) panelBeforeG3.api.setActive();
      await wait(30);
      statusElForG3.textContent = '';
      statusElForG3.classList.remove('statusbar-message-error');
      panelG3.api.setActive();
      await wait(150);
      record(
        'P6-FR-G3',
        statusElForG3.textContent.length > 0 && statusElForG3.classList.contains('statusbar-message-error'),
        'Switching to a tab whose target no longer exists shows a status-bar error (FR-G3)'
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
    const scratch = document.createElement('div');
    scratch.style.position = 'fixed';
    scratch.style.left = '-9999px';
    scratch.style.width = '400px';
    scratch.style.height = '200px';
    document.body.appendChild(scratch);

    const findView = new TextEditorView({ value: 'find me here', language: 'plaintext' });
    scratch.appendChild(findView.element);
    await wait(20);
    findView.runActionForTest('actions.find');
    await wait(30);
    record('P6-FR-P2-FIND', Boolean(findView.element.querySelector('.find-widget')), "The find widget opens via monaco's find action (FR-P2)");
    // Round-1 adversarial finding (Minor): the widget-presence check above
    // never proved a match was actually found or replaced. Drive the find
    // controller's own model directly to prove that.
    await findView.findAndReplaceForTest('me', 'YOU');
    record('P6-FR-P2-REPLACE', findView.getValue() === 'find YOU here', 'Find/replace locates the match and replaces it in the model (FR-P2)');
    findView.dispose();
    scratch.removeChild(scratch.firstChild);

    const undoView = new TextEditorView({ value: 'line one', language: 'plaintext' });
    scratch.appendChild(undoView.element);
    await wait(20);
    undoView.appendTextForTest(' two');
    const afterTypeValue = undoView.getValue();
    undoView.triggerCommand('undo');
    await wait(20);
    const afterUndoValue = undoView.getValue();
    undoView.triggerCommand('redo');
    await wait(20);
    const afterRedoValue = undoView.getValue();
    record(
      'P6-FR-P3-UNDOREDO',
      afterTypeValue === 'line one two' && afterUndoValue === 'line one' && afterRedoValue === 'line one two',
      'Undo restores prior content and redo restores the edit (FR-P3)'
    );
    undoView.dispose();
    scratch.removeChild(scratch.firstChild);

    const roView = new TextEditorView({ value: 'read only content', language: 'plaintext', readOnly: true });
    scratch.appendChild(roView.element);
    await wait(20);
    roView.appendTextForTest('X');
    await wait(20);
    record('P6-FR-P4', roView.getValue() === 'read only content', 'Read-only view rejects edits (FR-P4)');
    roView.dispose();
    scratch.removeChild(scratch.firstChild);

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
      "Clicking the tab's own close button on a dirty tab shows a confirm dialog with exactly [저장, 저장 안 함, 취소] (FR-L2)"
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
      '저장 안 함 closes the tab with 0 additional save calls (FR-L4, FR-P7)'
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
      '저장 calls the save handler exactly once and then closes the tab (FR-L3)'
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
    record('P6-FR-L6-DISCARD', quitResultDiscarded === true, "저장 안 함 during quit confirms it's OK to quit (FR-L6)");

    // ------------------------------------------------------------------------
    // 5. Status bar messages and progress (FR-G2 ~ FR-G4, FR-N10a, FR-N10b, WK-035)
    // ------------------------------------------------------------------------
    const statusEl = document.getElementById('statusbar-message');

    const openPromise = app.openFolder('C:\\definitely-does-not-exist-xyz123\\phase6-test');
    // No wait here: startProgress() runs synchronously before the first
    // await inside openFolder(), so it is already true the instant control
    // returns to us — a real ENOENT on a local path can reject fast enough
    // that even a few ms of delay would already observe it cleared.
    record('P6-FR-G4-START', app.statusMessages.isProgressActive(), 'Progress indicator is active immediately after opening a folder (FR-G4)');
    await openPromise;
    record('P6-FR-G4-END', !app.statusMessages.isProgressActive(), 'Progress indicator clears once the operation finishes (FR-G4)');
    record(
      'P6-FR-G2',
      statusEl.textContent.length > 0 &&
        statusEl.classList.contains('statusbar-message-error') &&
        document.querySelectorAll('.workbench-context-menu, .workbench-confirm-overlay').length === 0,
      'Unreadable folder shows 1 status-bar error line and 0 floating elements (FR-G2)'
    );

    app.statusMessages.showMessage('shell message');
    const surface = window.__workbenchAppSurface;
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
      await app.openFolder(testDir);
      await wait(80);
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

      const rootLabelEl = document.getElementById('sidebar-title');
      const restartOk = editor.getGroupCount() === 1 && editor.getPanelCount() === 0;
      record('P6-FR-K1-RESTORE', Boolean(rootLabelEl && rootLabelEl.textContent !== 'EXPLORER'), 'Restart reopens the last folder in the tree (FR-K1)');
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
        app.showRecentFoldersPicker();
        await wait(30);
        const pickerItems = Array.from(document.querySelectorAll('.workbench-context-menu .context-menu-item-row'));
        const targetItem = pickerItems.find((el) => el.textContent === testDir);
        record(
          'P6-FR-N6A-PICKER',
          pickerItems.length === recentAfterBoth.length && Boolean(targetItem),
          "File > 최근 폴더 shows every stored entry, not only the most recent (FR-N6a, D-16)"
        );
        if (targetItem) targetItem.click();
        await wait(80);
        record(
          'P6-FR-N6A',
          Boolean(rootLabelEl && rootLabelEl.textContent !== 'EXPLORER') && localStorage.getItem('workbench:last-folder') === testDir,
          'Picking the OLDER (non-most-recent) entry reopens THAT folder, same as Open Folder would (FR-N6a)'
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
