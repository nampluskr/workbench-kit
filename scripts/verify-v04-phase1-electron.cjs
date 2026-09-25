const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsOps = require('../src/hosts/electron/fs-ops.cjs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04-p1-'));
app.setPath('userData', path.join(fixture, 'profile'));
const sample = path.join(fixture, 'sample.md');
fs.writeFileSync(sample, '# Heading\n\n- Item\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<b>bold</b>\n\n<script>window.__markdownAttack = 1</script><img src=x onerror="window.__markdownAttack = 2"><button onclick="window.__markdownAttack=4">press</button><a href="javascript:window.__markdownAttack=3">bad</a><form action="https://attacker.example"><input><button>submit</button></form><map name="m"><area href="https://attacker.example"></map><style>body { display: none }</style><div style="position:fixed">fake</div>', 'utf8');
app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-v04-p1-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Windows may hold the WebView profile briefly. */ }
  }
});

ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:read-dir', () => []);
ipcMain.handle('fs:read-text-file', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('fs:read-legacy-text-file', (_e, file) => fsOps.readLegacyTextFile(file));
ipcMain.handle('fs:probe-text-file', (_e, file) => fsOps.probeTextFile(file));
ipcMain.handle('fs:path-exists', () => true);
ipcMain.handle('terminal:start', () => 'unused');
ipcMain.handle('terminal:read', () => ({ output: '', exited: true }));
ipcMain.handle('terminal:write', () => {});
ipcMain.handle('terminal:resize', () => {});
ipcMain.handle('terminal:close', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200, height: 800, show: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      await window.__workbenchApp.openRenderedMarkdown(${JSON.stringify(sample)});
      const app = window.__workbenchApp;
      const panel = app.editor.getActivePanel();
      const root = app.editor.getContentRenderer(panel.id).element;
      const rendered = root.querySelector('.markdown-rendered');
      for (let attempt = 0; attempt < 30 && !rendered?.querySelector('table'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const table = rendered?.querySelector('table');
      const cell = table?.querySelector('td');
      const link = rendered?.querySelector('a');
      rendered?.querySelector('button')?.click();
      link?.click();
      return {
        mode: panel.params.mode === 'rendered' && panel.params.kind === 'markdown',
        tooltip: document.querySelector('.dv-active-tab')?.getAttribute('title')?.endsWith('Rendered') === true,
        content: Boolean(rendered?.querySelector('h1')?.textContent === 'Heading' && rendered?.querySelector('li')?.textContent === 'Item'),
        table: Boolean(cell && cell.getBoundingClientRect().width > 0 && getComputedStyle(cell).borderTopColor !== 'rgba(0, 0, 0, 0)'),
        rawHtml: rendered?.querySelector('b')?.textContent === 'bold',
        sanitized: !rendered?.querySelector('script, form, input, button, map, area, style, [style], [onerror], [onclick]') && !link?.getAttribute('href')?.startsWith('javascript:'),
        noExecution: window.__markdownAttack === undefined,
      };
    })()`);
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
