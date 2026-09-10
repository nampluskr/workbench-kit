/**
 * Host-neutral v0.2 Phase 3 acceptance suite — 창 껍데기 배치.
 *
 * Covers FR-C1 ~ FR-C11.
 *
 * Judged on screen (NFR-3): positions from bounding rects, visibility from
 * computed style, icon identity from the glyph the codicon font actually draws
 * (the computed ::before content), text from what the element shows. State is
 * produced only through the buttons, keys and menu rows a user operates.
 * The runner sets window.__expectedCommitDate (git log -1 --format=%cs),
 * window.__expectedVersion ("major.minor" from package.json) and
 * window.__expectedHost ("Electron" or "PyWebView").
 */
window.__runV02Phase3Suite = async function runV02Phase3Suite() {
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

    /** The glyph a codicon element draws: its computed ::before content. */
    function glyphOf(button) {
      const icon = button ? button.querySelector('.codicon') : null;
      return icon ? getComputedStyle(icon, '::before').content : null;
    }

    async function press(key, mods) {
      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {})));
      await wait(120);
    }

    async function clickEl(el) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(120);
    }

    async function clickMenuRow(categoryId, itemId) {
      const hamburger = byId('menu-hamburger-btn');
      if (!byId('workbench-menu-dropdown')) await clickEl(hamburger);
      const catRow = document.querySelector('.menu-category-row[data-category-id="' + categoryId + '"]');
      if (catRow) await clickEl(catRow);
      const itemRow = document.querySelector('.menu-item-row[data-item-id="' + itemId + '"]');
      if (!itemRow) throw new Error('Menu row for ' + itemId + ' not found');
      await clickEl(itemRow);
    }

    const zenBtn = byId('titlebar-zen-btn');
    const themeBtn = byId('titlebar-theme-btn');
    const minBtn = byId('window-min-btn');
    const maxBtn = byId('window-max-btn');
    const closeBtn = byId('window-close-btn');

    // ------------------------------------------------------------------------
    // FR-C1 — the five on the right, in order
    // ------------------------------------------------------------------------
    {
      const five = [zenBtn, themeBtn, minBtn, maxBtn, closeBtn];
      const allVisible = five.every(visible);
      const xs = five.map((el) => (el ? el.getBoundingClientRect().left : NaN));
      const ascending = xs.every((x, i) => i === 0 || x > xs[i - 1]);
      const rightHalf = xs.every((x) => x > window.innerWidth / 2);
      record(
        'V2P3-FR-C1',
        allVisible && ascending && rightHalf,
        'Title bar right shows Zen · Color Theme · Minimize · Maximize/Restore · Close in that order (FR-C1) xs=' + JSON.stringify(xs.map(Math.round))
      );
    }

    // ------------------------------------------------------------------------
    // FR-C2 · FR-C11 — Zen icon follows Zen state, however it was changed
    // ------------------------------------------------------------------------
    const zenOffGlyph = glyphOf(zenBtn);
    await clickEl(zenBtn);
    const zenOnByButton = app.viewState.isZenMode;
    const zenOnGlyph = glyphOf(zenBtn);
    await press('Escape');
    const zenOffAfterEscape = !app.viewState.isZenMode && glyphOf(zenBtn) === zenOffGlyph;
    record(
      'V2P3-FR-C2',
      zenOnByButton && zenOnGlyph && zenOffGlyph && zenOnGlyph !== zenOffGlyph && zenOffAfterEscape,
      'The Zen icon draws a different glyph while Zen is on than while it is off (FR-C2) off=' + zenOffGlyph + ' on=' + zenOnGlyph
    );

    // ------------------------------------------------------------------------
    // FR-C3 — theme icon follows the theme
    // ------------------------------------------------------------------------
    const glyphByTheme = {};
    for (let i = 0; i < 3; i++) {
      await clickEl(themeBtn);
      glyphByTheme[app.theme.getTheme()] = glyphOf(themeBtn);
    }
    const themesSeen = Object.keys(glyphByTheme);
    const glyphsDistinct = new Set(Object.values(glyphByTheme)).size === 3;
    record(
      'V2P3-FR-C3',
      themesSeen.length === 3 && glyphsDistinct,
      'Pressing the theme icon cycles all three themes and the icon draws a different glyph for each (FR-C3) ' + JSON.stringify(glyphByTheme)
    );

    // FR-C11: F11 / Escape and the View menu drive the same icons.
    await press('F11');
    const zenByKey = app.viewState.isZenMode && glyphOf(zenBtn) === zenOnGlyph;
    await press('Escape');
    const zenOffByKey = !app.viewState.isZenMode && glyphOf(zenBtn) === zenOffGlyph;
    await clickMenuRow('view', 'view:zen-mode');
    const zenByMenu = app.viewState.isZenMode && glyphOf(zenBtn) === zenOnGlyph;
    await press('Escape');
    let themeByMenu = true;
    for (let i = 0; i < 3; i++) {
      await clickMenuRow('view', 'view:cycle-color-theme');
      if (glyphOf(themeBtn) !== glyphByTheme[app.theme.getTheme()]) themeByMenu = false;
    }
    record(
      'V2P3-FR-C11',
      zenByKey && zenOffByKey && zenByMenu && themeByMenu,
      'Changing Zen with F11 / Escape / the View menu, and the theme with the View menu, updates the title bar icons to the same glyphs (FR-C11) keyOn=' +
        zenByKey + ' keyOff=' + zenOffByKey + ' menuZen=' + zenByMenu + ' menuTheme=' + themeByMenu
    );

    // ------------------------------------------------------------------------
    // FR-C4 · FR-C5 · FR-C6 — Activity Bar holds only area toggles
    // ------------------------------------------------------------------------
    const actItems = Array.from(document.querySelectorAll('#activity-bar .activity-bar-item')).filter(visible);
    const actIds = actItems.map((el) => el.dataset.itemId || '');
    const actIcons = actItems.map((el) => (el.querySelector('.codicon') || {}).className || '');
    record(
      'V2P3-FR-C4',
      actIds.every((id) => !/zen|theme/.test(id)) &&
        actIcons.every((c) => !/screen-full|screen-normal|color-mode|circle-large/.test(c)),
      'The Activity Bar holds 0 Zen and 0 colour-theme actions (FR-C4) ids=' + JSON.stringify(actIds)
    );

    {
      const noSplitInBar =
        actIds.every((id) => !/split/.test(id)) && actIcons.every((c) => !/split-horizontal|split-vertical/.test(c));
      editor.clear();
      await wait(100);
      const g0 = editor.getActiveGroup();
      const headerSplit = g0.element.querySelector('.tab-action-split-right');
      const before = editor.getGroupCount();
      if (headerSplit) await clickEl(headerSplit);
      const headerWorks = editor.getGroupCount() === before + 1;
      await clickMenuRow('view', 'view:split-horizontal');
      const menuWorks = editor.getGroupCount() === before + 2;
      record(
        'V2P3-FR-C5',
        noSplitInBar && headerWorks && menuWorks,
        'The Activity Bar holds 0 split actions, while splitting from the group header and from the menu still works (FR-C5) header=' +
          headerWorks + ' menu=' + menuWorks
      );
      editor.clear();
      await wait(80);
    }

    {
      const sortedByY = actItems
        .map((el) => ({ id: el.dataset.itemId, top: el.getBoundingClientRect().top }))
        .sort((a, b) => a.top - b.top);
      const firstIsTitle = sortedByY.length > 0 && sortedByY[0].id === 'activity:toggle-titlebar';
      const lastIsStatus = sortedByY.length > 0 && sortedByY[sortedByY.length - 1].id === 'activity:toggle-statusbar';

      const titleToggle = document.querySelector('.activity-bar-item[data-item-id="activity:toggle-titlebar"]');
      const statusToggle = document.querySelector('.activity-bar-item[data-item-id="activity:toggle-statusbar"]');
      await clickEl(titleToggle);
      const titleOnlyHidden = !visible(byId('titlebar')) && visible(byId('statusbar'));
      await clickEl(titleToggle);
      const titleBack = visible(byId('titlebar'));
      await clickEl(statusToggle);
      const statusOnlyHidden = !visible(byId('statusbar')) && visible(byId('titlebar'));
      await clickEl(statusToggle);
      const statusBack = visible(byId('statusbar'));
      record(
        'V2P3-FR-C6',
        firstIsTitle && lastIsStatus && titleOnlyHidden && titleBack && statusOnlyHidden && statusBack,
        'The topmost Activity Bar action is the title bar toggle and the bottommost the status bar toggle; each hides and restores only its own area (FR-C6) order=' +
          JSON.stringify(sortedByY.map((i) => i.id))
      );
    }

    // ------------------------------------------------------------------------
    // FR-C7 · FR-C8 · FR-C9 — program information line
    // ------------------------------------------------------------------------
    // pywebview exposes its bridge a moment after load; give the one-line
    // update that listens for it a chance to run before reading.
    await wait(300);
    const info = byId('window-title');
    const hamburger = byId('menu-hamburger-btn');
    const infoText = info ? info.textContent.trim() : '';
    const infoRect = info ? info.getBoundingClientRect() : null;
    const hamRect = hamburger ? hamburger.getBoundingClientRect() : null;
    const format = /^Workbench-Kit v(\d+\.\d+) \((\d{4}-\d{2}-\d{2})\) - (Electron|PyWebView)$/.exec(infoText);
    record(
      'V2P3-FR-C7',
      Boolean(format) && visible(info) && infoRect && hamRect && infoRect.left >= hamRect.right && infoRect.left < window.innerWidth / 2,
      'Program information sits left-aligned right after the menu button, in the exact format (FR-C7) text="' + infoText + '"'
    );
    record(
      'V2P3-FR-C8',
      Boolean(format) && format[2] === window.__expectedCommitDate && format[1] === window.__expectedVersion,
      'The date shown is the last commit date and the version matches package.json (FR-C8) shown=' +
        (format ? format[1] + '/' + format[2] : 'none') + ' expected=' + window.__expectedVersion + '/' + window.__expectedCommitDate
    );
    record(
      'V2P3-FR-C9',
      Boolean(format) && format[3] === window.__expectedHost,
      'The host branch name is written exactly, case included (FR-C9) shown=' + (format ? format[3] : 'none') + ' expected=' + window.__expectedHost
    );

    // ------------------------------------------------------------------------
    // FR-C10 — the status bar's right side is the app's
    // ------------------------------------------------------------------------
    {
      const right = byId('statusbar-right');
      const text = right ? right.textContent : '';
      const shellInfo = /workbench-kit|v\d+\.\d+|electron|pywebview/i.test(text);
      record(
        'V2P3-FR-C10',
        right && !shellInfo && /Presets/.test(text) && byId('statusbar-app-info') === null,
        'The status bar right side carries 0 program / version / host entries from the shell and keeps the preset information (FR-C10) text="' + text.trim() + '"'
      );
    }

    const success = results.every((r) => r.pass);
    return { success, results };
  } catch (err) {
    record('RUNNER_ERR', false, 'Unhandled error in v0.2 Phase 3 suite: ' + String(err && err.stack ? err.stack : err));
    return { success: false, results };
  }
};
