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
app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-v04-p3-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Windows may hold the profile briefly. */ }
  }
});
ipcMain.handle('fs:read-text-file', async (_event, file) => fs.promises.readFile(file, 'utf8'));
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
      const colors = {};
      for (const theme of ['dark', 'light', 'gray']) {
        document.documentElement.dataset.theme = theme;
        colors[theme] = Boolean(keyword && getComputedStyle(keyword).color !== getComputedStyle(rendered).color);
      }
      return {
        math: formulas.length >= 2 && [...formulas].every(e => e.getBoundingClientRect().width > 0),
        font: [...document.fonts].some(f => f.family.includes('KaTeX') && f.status === 'loaded'),
        css: [...document.styleSheets].some(s => s.href && s.href.includes('/assets/') && [...s.cssRules].some(r => r.cssText.includes('.katex'))) && getComputedStyle(formulas[0]).fontFamily.includes('KaTeX'),
        highlight: Boolean(keyword && code.textContent.includes('const safe')),
        colors: Object.values(colors).every(Boolean),
        safe: !rendered.querySelector('script, img, video, audio, svg, [onclick], [onerror], .evil, [href^="javascript:"]') && !rendered.querySelector('span[style*="fixed"]') && window.__attack === undefined,
      };
    })()`);
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
