const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04-p3-'));
app.setPath('userData', path.join(fixture, 'profile'));
const sample = path.join(fixture, 'sample.md');
fs.writeFileSync(sample, '$x^2 + y^2$\n\n$$\\frac{a}{b}$$\n\n```js\nconst safe = "ok";\n<img src=x onerror="window.__attack=1">\n```\n\n$\\htmlClass{evil}{x}$ $\\href{javascript:window.__attack=3}{x}$ $\\htmlStyle{position:fixed}{x}$\n\n![remote](//attacker.example/share/a.png)\n<video src="//attacker.example/share/a.png"></video>\n<span style="position:fixed" onclick="window.__attack=2">raw</span>', 'utf8');
fs.appendFileSync(sample, '\n\n# GitHub style heading\n\n## foo_bar\n\n[Jump](#foo_bar)\n\n$\\sqrt{2}$ $\\overrightarrow{AB}$\n\nInline `token` and https://example.com\n\n- [x] Finished\n\n> [!NOTE]\n> A note\n\n| One | Two |\n| --- | ---: |\n| a | b |\n| c | d |\n', 'utf8');
app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-v04-p3-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Windows may hold the profile briefly. */ }
  }
});
ipcMain.handle('fs:read-text-file', async (_event, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('window:zoom', () => 1);
ipcMain.handle('fs:read-legacy-text-file', async (_event, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('fs:path-exists', () => true);
ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:read-dir', () => []);
for (const channel of ['terminal:start', 'terminal:read', 'terminal:write', 'terminal:resize', 'terminal:close']) {
  ipcMain.handle(channel, () => null);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: true, webPreferences: {
    preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
    contextIsolation: true, nodeIntegration: false, sandbox: true,
  } });
  try {
    win.webContents.on('console-message', (details) => console.log('renderer:', JSON.stringify(details)));
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 40 && !window.__workbenchApp; i++) await new Promise(r => setTimeout(r, 100));
      await window.__workbenchApp.openRenderedMarkdown(${JSON.stringify(sample)});
      const panel = window.__workbenchApp.editor.getActivePanel();
      const root = window.__workbenchApp.editor.getContentRenderer(panel.id).element;
      const rendered = root.querySelector('.markdown-rendered');
      for (let i = 0; i < 40 && !rendered?.querySelector('.katex'); i++) await new Promise(r => setTimeout(r, 100));
      await document.fonts.ready;
      const formulas = rendered.querySelectorAll('.katex');
      const code = rendered.querySelector('pre code.hljs');
      const keyword = code?.querySelector('.hljs-keyword');
      const copyButton = rendered.querySelector('.markdown-code-copy');
      const copyIconReady = Boolean(copyButton?.querySelector('.codicon-copy') && copyButton.getAttribute('aria-label') === 'Copy code');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text) => { window.__copiedMarkdownCode = text; },
      } });
      copyButton?.click();
      await new Promise(r => setTimeout(r, 20));
      const colors = {};
      const originalTheme = window.__workbenchApp.theme.getTheme();
      for (const theme of ['dark', 'light', 'gray']) {
        window.__workbenchApp.theme.setTheme(theme);
        colors[theme] = Boolean(keyword && getComputedStyle(keyword).color !== getComputedStyle(rendered).color);
      }
      window.__workbenchApp.theme.setTheme(originalTheme);
      const styleParts = {
        heading: Boolean(rendered.querySelector('h1') && getComputedStyle(rendered.querySelector('h1')).borderBottomStyle === 'solid'),
        codeBlock: getComputedStyle(rendered.querySelector('pre')).backgroundColor !== getComputedStyle(rendered).backgroundColor,
        inlineCode: getComputedStyle(rendered.querySelector('p code')).backgroundColor !== getComputedStyle(rendered).backgroundColor &&
          getComputedStyle(rendered.querySelector('p code')).fontWeight === '700' &&
          getComputedStyle(rendered.querySelector('p code')).fontFamily.includes('Workbench D2Coding') &&
          getComputedStyle(code).fontWeight !== '700',
        codeCopyStyle: Boolean(copyButton && getComputedStyle(copyButton).borderTopStyle === 'none' &&
          getComputedStyle(copyButton).backgroundColor === 'rgba(0, 0, 0, 0)'),
        task: Boolean(rendered.querySelector('.markdown-task-item input:checked:disabled')),
        alert: Boolean(rendered.querySelector('.markdown-alert-note .markdown-alert-title')),
        link: Boolean(rendered.querySelector('a[href="https://example.com"]')),
        anchor: Boolean(rendered.querySelector('#md-foo_bar') && rendered.querySelector('a[href="#foo_bar"]')),
        tableAlign: Boolean(rendered.querySelector('th.markdown-align-right') && getComputedStyle(rendered.querySelector('th.markdown-align-right')).textAlign === 'right'),
        tableLines: Boolean(rendered.querySelector('table') && getComputedStyle(rendered.querySelector('table')).borderCollapse === 'collapse' &&
          getComputedStyle(rendered.querySelector('th')).borderLeftWidth === '1px'),
      };
      return {
        math: formulas.length >= 4 && [...formulas].every(e => e.getBoundingClientRect().width > 0) && rendered.querySelectorAll('.katex svg').length >= 2,
        font: [...document.fonts].some(f => f.family.includes('KaTeX') && f.status === 'loaded'),
        css: [...document.styleSheets].some(s => s.href && s.href.includes('/assets/') && [...s.cssRules].some(r => r.cssText.includes('.katex'))) && getComputedStyle(formulas[0]).fontFamily.includes('KaTeX'),
        highlight: Boolean(keyword && code.textContent.includes('const safe')),
        colors: Object.values(colors).every(Boolean),
        githubStyle: Object.values(styleParts).every(Boolean),
        copy: Boolean(copyIconReady && copyButton?.querySelector('.codicon-check') &&
          copyButton.getAttribute('aria-label') === 'Code copied' &&
          rendered.querySelector('.markdown-code-status')?.textContent === 'Code copied' &&
          window.__copiedMarkdownCode === code.textContent),
        icon: (() => {
          const svg = document.querySelector('[data-item-id="activity:markdown-rendering"] svg');
          const rect = svg?.querySelector('rect');
          return Boolean(rect && rect.getAttribute('x') === '1' && rect.getAttribute('y') === '3' &&
            rect.getAttribute('width') === '18' && rect.getAttribute('height') === '13');
        })(),
        safe: !rendered.querySelector('script, img[src], video, audio, [onclick], [onerror], .evil, [href^="javascript:"]') && [...rendered.querySelectorAll('svg')].every(svg => svg.closest('.katex')) && !rendered.querySelector('span[style*="fixed"]') && window.__attack === undefined,
      };
    })()`);
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
