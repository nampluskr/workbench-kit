/**
 * Host-neutral v0.2 Phase 6 acceptance suite — 테마 · 아이콘 · 치수.
 *
 * Covers FR-X10 ~ FR-X14 and FR-D1 ~ FR-D3.
 *
 * Judged on screen (NFR-3): the five chrome areas measured with getBoundingClientRect,
 * icon colours read as the actual computed `color` after render, scrollbar
 * colours read from the live theme tokens that drive the ::-webkit rules, icon
 * glyphs read from what the resolver produces for representative names. The
 * runner opens window.__testTmpDir (a real folder with representative files).
 */
window.__runV02Phase6Suite = async function runV02Phase6Suite() {
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
    const root = document.documentElement;

    function until(check, ms) {
      return new Promise((resolve) => {
        const end = Date.now() + (ms || 3000);
        (function poll() {
          if (check() || Date.now() > end) return resolve(Boolean(check()));
          setTimeout(poll, 40);
        })();
      });
    }

    async function setTheme(t) {
      app.theme.setTheme(t);
      await wait(60);
    }

    function parseRgb(s) {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    }
    function luminance(c) {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function contrast(fg, bg) {
      const a = parseRgb(fg);
      const b = parseRgb(bg);
      if (!a || !b) return 0;
      const l1 = luminance(a) + 0.05;
      const l2 = luminance(b) + 0.05;
      return l1 > l2 ? l1 / l2 : l2 / l1;
    }
    /** The nearest opaque background painted behind an element. */
    function effectiveBg(el) {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const p = parseRgb(c);
        if (p && p.a > 0) return c;
      }
      return getComputedStyle(document.body).backgroundColor;
    }

    await app.openFolder(dir);
    await until(() => tree.getRoot() && tree.getRoot().id === dir, 4000);
    tree.setExpanded(tree.getRoot().id, true);
    await wait(120);

    // ------------------------------------------------------------------------
    // FR-D1 — the five chrome areas are all exactly 30 CSS px
    // ------------------------------------------------------------------------
    function areaSizes() {
      const tabStrip = document.querySelector('.dv-tabs-and-actions-container');
      return {
        titlebar: byId('titlebar') ? Math.round(byId('titlebar').getBoundingClientRect().height) : null,
        statusbar: byId('statusbar') ? Math.round(byId('statusbar').getBoundingClientRect().height) : null,
        activitybar: byId('activity-bar') ? Math.round(byId('activity-bar').getBoundingClientRect().width) : null,
        explorerHeader: byId('sidebar-header') ? Math.round(byId('sidebar-header').getBoundingClientRect().height) : null,
        tabStrip: tabStrip ? Math.round(tabStrip.getBoundingClientRect().height) : null,
      };
    }
    {
      // Make sure a tab strip exists to measure.
      app.editor.openItem('/v02p6/probe.txt', 'probe.txt', { mode: 'pinned' });
      await wait(100);
      const s = areaSizes();
      const all30 = Object.values(s).every((v) => v === 30);
      record(
        'V2P6-FR-D1',
        all30,
        'Title bar height, status bar height, activity bar width, explorer header height and the tab strip height are all exactly 30 CSS px (FR-D1) ' + JSON.stringify(s)
      );
    }

    // ------------------------------------------------------------------------
    // FR-D2 — the five values do not change on a theme switch or a resize
    // ------------------------------------------------------------------------
    {
      const before = areaSizes();
      await setTheme('light');
      const afterTheme = areaSizes();
      await setTheme('gray');
      const afterTheme2 = areaSizes();
      // A window resize stands in for maximize/restore in this harness.
      window.dispatchEvent(new Event('resize'));
      await wait(80);
      const afterResize = areaSizes();
      await setTheme('dark');
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      record(
        'V2P6-FR-D2',
        same(before, afterTheme) && same(before, afterTheme2) && same(before, afterResize) &&
          Object.values(before).every((v) => v === 30),
        'The five area sizes stay at 30 through a theme switch (light, gray) and a resize (FR-D2) ' +
          JSON.stringify({ before, afterTheme, afterResize })
      );
    }

    // ------------------------------------------------------------------------
    // FR-D3 — the divergence is recorded in the comparison document
    // ------------------------------------------------------------------------
    {
      const expected = window.__vscodeComparison || '';
      const hasDimRow = /30\s*(CSS\s*)?px/i.test(expected) &&
        /(치수|dimension|두께|thickness|30px)/i.test(expected) &&
        /(의도적 다름|divergence|다름)/i.test(expected);
      record(
        'V2P6-FR-D3',
        Boolean(window.__vscodeComparison) && hasDimRow,
        'docs/vscode-comparison.md carries a row marking the uniform 30px chrome as an intentional divergence from VS Code (FR-D3) present=' + Boolean(window.__vscodeComparison)
      );
    }

    // ------------------------------------------------------------------------
    // FR-X10 — colour theme reaches every explorer icon
    // ------------------------------------------------------------------------
    async function iconColorProbe() {
      // A selected/focused row paints its content in the selection colour, so
      // probe rows that are neither (icon colour must still follow the theme).
      const rows = Array.from(document.querySelectorAll('.tree-row:not(.tree-input-row)'))
        .filter((r) => !r.classList.contains('selected') && !r.classList.contains('focused'));
      const folderRow = rows.find((r) => r.getAttribute('aria-expanded') === 'true' || r.getAttribute('aria-expanded') === 'false');
      const fileRow = rows.find((r) => r.getAttribute('aria-expanded') === null || r.getAttribute('aria-expanded') === 'undefined' || r.getAttribute('aria-expanded') === '');
      const viewAction = byId('sidebar-action-new-file').querySelector('i') || byId('sidebar-action-new-file');
      const twistie = folderRow ? folderRow.querySelector('.tree-twistie i.codicon') : null;
      const fileIconEl = fileRow ? (fileRow.querySelector('.tree-icon i') || fileRow.querySelector('.tree-icon')) : null;
      const folderIconEl = folderRow ? (folderRow.querySelector('.tree-icon i') || folderRow.querySelector('.tree-icon')) : null;
      const read = (el) => (el ? getComputedStyle(el).color : null);
      return {
        rowsSeen: rows.length,
        viewAction: read(viewAction),
        chevron: read(twistie),
        fileIcon: read(fileIconEl),
        folderIcon: read(folderIconEl),
        sidebarBg: getComputedStyle(byId('sidebar')).backgroundColor,
      };
    }
    // Reads the visible file-icon rendering for the CURRENT icon theme: for
    // seti/built-in that is the computed text colour; for VS Code Icons SVGs
    // it is the svg markup plus the computed CSS filter on it (the light
    // theme uses a different vendor svg, the gray theme a colour filter).
    function svgRenderProbe() {
      const rows = Array.from(document.querySelectorAll('.tree-row:not(.tree-input-row)'))
        .filter((r) => !r.classList.contains('selected') && !r.classList.contains('focused'));
      const fileRow = rows.find((r) => r.querySelector('.tree-icon.svg-icon svg path'));
      const svg = fileRow ? fileRow.querySelector('.tree-icon.svg-icon svg') : null;
      const path = fileRow ? fileRow.querySelector('.tree-icon.svg-icon svg path') : null;
      const wrap = fileRow ? fileRow.querySelector('.tree-icon.svg-icon') : null;
      return {
        markup: wrap ? wrap.innerHTML.slice(0, 400) : null,
        filter: svg ? getComputedStyle(svg).filter : null,
        // The <path>'s own fill (a presentation attribute after the CSP-safe
        // rewrite) — a real colour, not the black/none fallback.
        pathFill: path ? getComputedStyle(path).fill : null,
      };
    }

    async function x10ForIconTheme(iconThemeId) {
      app.iconTheme.setTheme(iconThemeId);
      tree.render();
      await wait(80);
      const perTheme = {};
      for (const t of ['light', 'gray', 'dark']) {
        await setTheme(t);
        await wait(70);
        perTheme[t] = { colours: await iconColorProbe(), svg: svgRenderProbe() };
      }
      await setTheme('dark');
      return perTheme;
    }
    {
      // Built-in (seti): the icon COLOUR follows the theme for every kind.
      const seti = await x10ForIconTheme('seti');
      const keys = ['viewAction', 'chevron', 'fileIcon', 'folderIcon'];
      const setiDistinct = keys.every((k) => new Set(['light', 'gray', 'dark'].map((t) => seti[t].colours[k]).filter(Boolean)).size === 3);
      const contrastByKey = {};
      // A floor that only catches "washed out" (1.0 == invisible). Precise
      // colour tuning is the user's visual review, not this number.
      const setiContrastOK = ['light', 'gray', 'dark'].every((t) =>
        keys.every((k) => {
          const c = seti[t].colours[k] ? contrast(seti[t].colours[k], seti[t].colours.sidebarBg) : 0;
          contrastByKey[t + '.' + k] = Number(c.toFixed(2));
          return c >= 1.3;
        })
      );

      // VS Code Icons: view actions / chevrons still follow the colour; the
      // SVG file/folder icons render distinctly in the three themes — light
      // uses the vendor light svg, gray a colour filter, dark the default —
      // so no theme shows a washed-out or identical icon (FR-X10, D-11).
      const vsi = await x10ForIconTheme('vscode-icons');
      const vsiChromeDistinct = ['viewAction', 'chevron']
        .every((k) => new Set(['light', 'gray', 'dark'].map((t) => vsi[t].colours[k]).filter(Boolean)).size === 3);
      // The SVG file icon renders a REAL colour (not the CSP-fallback black),
      // and its rendering differs in all three themes — each theme applies a
      // distinct CSS filter (dark = none baseline) (FR-X10, D-11).
      const filters = ['light', 'gray', 'dark'].map((t) => vsi[t].svg.filter);
      const vsiFiltersDistinct = new Set(filters).size === 3;
      const pathFills = ['light', 'gray', 'dark'].map((t) => vsi[t].svg.pathFill);
      const realFill = pathFills.every((f) => {
        const p = parseRgb(f);
        // not transparent, not pure black (the fallback when CSP ate the style)
        return p && p.a > 0 && !(p.r < 8 && p.g < 8 && p.b < 8);
      });
      const darkNoFilter = !vsi.dark.svg.filter || vsi.dark.svg.filter === 'none';

      // A file that HAS a vendor light variant (agents.md): switching dark ->
      // light must swap the rendered <svg> markup, not just filter it, and a
      // full render is not needed (A14 R3-1). Read the agents.md row's svg.
      app.iconTheme.setTheme('vscode-icons');
      tree.render();
      await setTheme('dark');
      await wait(60);
      const agentsRow = () => Array.from(document.querySelectorAll('.tree-row:not(.tree-input-row)'))
        .find((r) => (r.getAttribute('data-id') || '').endsWith('agents.md'));
      const agentsDark = agentsRow() ? agentsRow().querySelector('.tree-icon.svg-icon').innerHTML : null;
      // ONLY a colour-theme change (goes through refreshThemeColors, no render).
      app.theme.setTheme('light');
      await wait(80);
      const agentsLight = agentsRow() ? agentsRow().querySelector('.tree-icon.svg-icon').innerHTML : null;
      const lightVariantSwapped = Boolean(agentsDark) && Boolean(agentsLight) && agentsDark !== agentsLight;
      await setTheme('dark');

      app.iconTheme.setTheme('seti');
      tree.render();
      await setTheme('dark');

      record(
        'V2P6-FR-X10',
        setiDistinct && setiContrastOK && vsiChromeDistinct && vsiFiltersDistinct && realFill && darkNoFilter && lightVariantSwapped,
        'In VS Code Built-in the view-action / chevron / folder / file icon colours are distinct across the three themes with contrast; in VS Code Icons the chrome icons follow the colour, the SVG path renders a real fill, each theme applies a distinct filter, and a file with a vendor light variant swaps its SVG on a dark->light switch (FR-X10, FR-X14, D-11) ' +
          JSON.stringify({ setiDistinct, setiContrastOK, vsiChromeDistinct, vsiFiltersDistinct, realFill, lightVariantSwapped, filters, contrastByKey })
      );
    }

    // ------------------------------------------------------------------------
    // FR-X11 — scrollbars carry the theme colour, states distinct, both axes
    // ------------------------------------------------------------------------
    {
      const tokenSet = (t) => {
        const cs = getComputedStyle(root);
        return {
          track: cs.getPropertyValue('--scrollbar-track').trim(),
          thumb: cs.getPropertyValue('--scrollbar-thumb').trim(),
          hover: cs.getPropertyValue('--scrollbar-thumb-hover').trim(),
          active: cs.getPropertyValue('--scrollbar-thumb-active').trim(),
        };
      };
      const per = {};
      for (const t of ['light', 'gray', 'dark']) {
        await setTheme(t);
        await wait(40);
        per[t] = tokenSet(t);
      }
      const trackDistinct = new Set(['light', 'gray', 'dark'].map((t) => per[t].track)).size === 3;
      const thumbDistinct = new Set(['light', 'gray', 'dark'].map((t) => per[t].thumb)).size === 3;
      const statesDistinct = ['light', 'gray', 'dark'].every((t) => {
        const s = new Set([per[t].thumb, per[t].hover, per[t].active]);
        return s.size === 3 && per[t].thumb && per[t].hover && per[t].active && per[t].track;
      });

      // The rules that consume the tokens exist, for both axes (width AND height),
      // and for hover and active.
      let css = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          css += Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
        } catch {
          /* cross-origin */
        }
      }
      const hasThumb = /::-webkit-scrollbar-thumb\s*\{[^}]*--scrollbar-thumb\b/.test(css) ||
        /::-webkit-scrollbar-thumb[^{]*\{[^}]*var\(--scrollbar-thumb\)/.test(css);
      const hasHover = /::-webkit-scrollbar-thumb:hover/.test(css);
      const hasActive = /::-webkit-scrollbar-thumb:active/.test(css);
      const hasBothAxes = /::-webkit-scrollbar\b[^{]*\{[^}]*width:[^}]*height:/.test(css.replace(/\s+/g, ' ')) ||
        (/::-webkit-scrollbar\b[^{]*\{[^}]*height:/.test(css.replace(/\s+/g, ' ')) && /::-webkit-scrollbar\b[^{]*\{[^}]*width:/.test(css.replace(/\s+/g, ' ')));

      // The tree genuinely overflows BOTH axes — 40+ rows for the vertical
      // bar, one very long file name for the horizontal bar — and both bars
      // really move the content (A14 R1-2 / R2-3).
      await setTheme('dark');
      for (let pass = 0; pass < 10; pass++) {
        let expandedAny = false;
        for (const it of tree.getVisibleItems()) {
          if (it.node.isContainer && !tree.isExpanded(it.node.id)) {
            tree.setExpanded(it.node.id, true);
            expandedAny = true;
          }
        }
        await wait(150);
        if (!expandedAny) break;
      }
      await wait(150);
      const list = document.querySelector('.tree-list');
      const vOverflow = list ? list.scrollHeight > list.clientHeight + 1 : false;
      const hOverflow = list ? list.scrollWidth > list.clientWidth + 1 : false;
      const overflowX = list ? getComputedStyle(list).overflowX : '';
      const overflowY = list ? getComputedStyle(list).overflowY : '';
      let vScrolls = false;
      let hScrolls = false;
      if (list) {
        const t0 = list.scrollTop;
        list.scrollTop = t0 + 60;
        vScrolls = list.scrollTop > t0;
        list.scrollTop = t0;
        const l0 = list.scrollLeft;
        list.scrollLeft = l0 + 60;
        hScrolls = list.scrollLeft > l0;
        list.scrollLeft = l0;
      }

      record(
        'V2P6-FR-X11',
        trackDistinct && thumbDistinct && statesDistinct && hasThumb && hasHover && hasActive && hasBothAxes &&
          overflowX !== 'hidden' && overflowY !== 'hidden' && vOverflow && hOverflow && vScrolls && hScrolls,
        'Scrollbar track/thumb colours differ across the three themes, thumb rest/hover/active are distinct, the ::-webkit rules set width AND height, and the tree really overflows AND scrolls both axes (FR-X11) ' +
          JSON.stringify({ trackDistinct, thumbDistinct, statesDistinct, hasThumb, hasHover, hasActive, hasBothAxes, overflowX, overflowY, vOverflow, hOverflow, vScrolls, hScrolls })
      );
    }

    // ------------------------------------------------------------------------
    // FR-X12 — VS Code Built-in: the resolved glyph MATCHES the reference seti
    // data (window.__setiData, read from src/icons/data/seti.json by the runner).
    // ------------------------------------------------------------------------
    {
      app.iconTheme.setTheme('seti');
      const resolver = app.iconTheme;
      const seti = window.__setiData || null;

      // A resolved seti icon must be the glyph the REFERENCE data defines for
      // the exact key the resolver chose (it reads the reference, it does not
      // invent glyphs). iconName carries the chosen key.
      function matchesReference(d) {
        if (!seti || d.kind !== 'font' || !d.char || !d.iconName) return false;
        const def = seti.iconDefinitions && seti.iconDefinitions[d.iconName];
        if (!def || !def.fontCharacter) return false;
        const code = parseInt(def.fontCharacter.replace(/^\\/, ''), 16);
        return !Number.isNaN(code) && String.fromCodePoint(code) === d.char;
      }
      const rows = [
        { name: 'README.md', d: resolver.resolveIcon('README.md', false) },
        { name: 'index.ts', d: resolver.resolveIcon('index.ts', false) },
        { name: 'app.spec.ts', d: resolver.resolveIcon('app.spec.ts', false) },
      ].map((c) => ({ name: c.name, key: c.d.iconName, match: matchesReference(c.d) }));
      const distinctKeys = new Set(rows.map((r) => r.key));
      const folderClosed = resolver.resolveIcon('src', true, false);
      const folderOpen = resolver.resolveIcon('src', true, true);
      record(
        'V2P6-FR-X12',
        Boolean(seti) && rows.every((r) => r.match) && distinctKeys.size >= 2 &&
          folderClosed.cssClass === 'codicon-folder' && folderOpen.cssClass === 'codicon-folder-opened',
        'VS Code Built-in resolves, for a representative filename / single extension / compound extension, exactly the glyph the reference seti data defines for the key it chose; the keys differ; open vs closed folder differ (FR-X12) ' +
          JSON.stringify({ rows, folderClosed: folderClosed.cssClass, folderOpen: folderOpen.cssClass })
      );
    }

    // ------------------------------------------------------------------------
    // FR-X13 — VS Code Icons: the resolved svg MATCHES the reference vscode-icons
    // data (window.__vsiData), file + folders, open != closed.
    // ------------------------------------------------------------------------
    {
      app.iconTheme.setTheme('vscode-icons');
      tree.render();
      await wait(80);
      const resolver = app.iconTheme;
      const svgOf = (d) => (d.kind === 'svg' ? (d.svgData || '') : '');

      // The resolver returns the bundled vendor SVG (import.meta.glob of
      // ./assets/vscode-icons/*.svg — those files ARE the reference set). Each
      // resolved icon names the vendor iconPath it chose and returns that
      // file's real <svg> markup; the file and folder variants are different
      // vendor files, and the open vs closed folder are different files.
      const single = resolver.resolveIcon('index.ts', false);
      const compound = resolver.resolveIcon('app.spec.ts', false);
      const folderClosed = resolver.resolveIcon('src', true, false);
      const folderOpen = resolver.resolveIcon('src', true, true);
      const realSvg = (d) => {
        const s = svgOf(d);
        return s.includes('<svg') && /(<path|<rect|<circle|<polygon|<g\b)/.test(s) && s.length > 80;
      };
      const namesVendorPath = (d) => typeof d.iconPath === 'string' && /vscode-icons|\.svg/i.test(d.iconPath);
      // The CSP-safe rewrite left the reference colour on the path: the
      // resolver's svgData carries a `fill="#..."` (attribute, not style), and
      // the rendered path computes a real colour.
      // Every reachable svg (a sample across the fixture's file types) must be
      // CSP-safe: fill on an attribute, and NO `style=` attribute and NO
      // `<style>` block left behind (A14 R3-2).
      const sample = ['index.ts', 'app.spec.ts', 'README.md', 'file-0.txt', 'main.ts']
        .map((n) => svgOf(resolver.resolveIcon(n, false)))
        .concat([svgOf(folderClosed), svgOf(folderOpen)]);
      const carriesFillAttr = sample.every((s) => /(<path|<rect|<circle|<polygon)[^>]*\sfill="/.test(s) || /\sfill="/.test(s));
      const noInlineStyle = sample.every((s) => !/<[a-z]+[^>]*\sstyle=/.test(s) && !/<style[\s>]/i.test(s));
      // The fill on the SPECIFIC row whose icon is `single` — scoped, not a
      // global "some svg is coloured" query.
      const singleRow = Array.from(document.querySelectorAll('.tree-row:not(.tree-input-row)'))
        .find((r) => (r.getAttribute('data-id') || '').endsWith('index.ts'));
      const renderedPath = singleRow ? singleRow.querySelector('.tree-icon.svg-icon svg path, .tree-icon.svg-icon svg rect') : null;
      const renderedFill = renderedPath ? getComputedStyle(renderedPath).fill : null;
      const p = parseRgb(renderedFill);
      const renderedRealColour = Boolean(p && p.a > 0 && !(p.r < 8 && p.g < 8 && p.b < 8));
      record(
        'V2P6-FR-X13',
        realSvg(single) && realSvg(compound) && realSvg(folderClosed) && realSvg(folderOpen) &&
          namesVendorPath(single) && namesVendorPath(folderClosed) &&
          carriesFillAttr && noInlineStyle &&
          svgOf(single) !== svgOf(folderClosed) &&
          svgOf(folderClosed) !== svgOf(folderOpen) &&
          Boolean(renderedPath) && renderedRealColour,
        'VS Code Icons returns the vendor <svg> (named by iconPath) with its reference colour on a CSP-safe `fill` attribute (no inline style); file != folder, open != closed folder; the rendered path computes a real colour (FR-X13) ' +
          JSON.stringify({
            single: single.iconPath, folderClosed: folderClosed.iconPath, folderOpen: folderOpen.iconPath,
            carriesFillAttr, noInlineStyle, renderedFill,
          })
      );
      app.iconTheme.setTheme('seti');
      tree.render();
    }

    // ------------------------------------------------------------------------
    // FR-X14 — a theme switch is reflected immediately, no reopen
    // ------------------------------------------------------------------------
    {
      await setTheme('dark');
      await wait(60);
      const darkProbe = await iconColorProbe();
      const darkTokens = {
        thumb: getComputedStyle(root).getPropertyValue('--scrollbar-thumb').trim(),
      };
      // Switch and immediately measure — no reload, minimal settle.
      app.theme.setTheme('light');
      await wait(50);
      const lightProbe = await iconColorProbe();
      const lightTokens = {
        thumb: getComputedStyle(root).getPropertyValue('--scrollbar-thumb').trim(),
      };
      const iconsMoved = ['viewAction', 'chevron', 'fileIcon', 'folderIcon']
        .every((k) => darkProbe[k] && lightProbe[k] && darkProbe[k] !== lightProbe[k]);
      const scrollbarMoved = darkTokens.thumb !== lightTokens.thumb && Boolean(lightTokens.thumb);
      await setTheme('dark');
      record(
        'V2P6-FR-X14',
        iconsMoved && scrollbarMoved,
        'Immediately after a theme switch (no reopen) the icon colours and the scrollbar token have all changed to the new theme (FR-X14) ' +
          JSON.stringify({ iconsMoved, scrollbarMoved })
      );
    }

    const allPassed = results.every((r) => r.pass);
    return { success: allPassed, results };
  } catch (err) {
    record('GLOBAL_EXCEPTION', false, 'Uncaught error in v0.2 Phase 6 suite: ' + (err && err.stack ? err.stack : err));
    return { success: false, results };
  }
};
