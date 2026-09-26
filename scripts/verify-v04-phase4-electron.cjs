const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsOps = require('../src/hosts/electron/fs-ops.cjs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04-p4-'));
app.setPath('userData', path.join(fixture, 'profile'));
const sample = path.join(fixture, 'sample.md');
const linked = path.join(fixture, 'linked.md');
const hashed = path.join(fixture, 'notes#v2.md');
fs.writeFileSync(linked, '# Linked', 'utf8');
fs.writeFileSync(hashed, '# Hashed', 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(path.join(fixture, 'pixel.png'), png);
fs.writeFileSync(sample, '# Top\n\n[local](./linked.md) [case](./LINKED.md) [encoded](./notes%23v2.md) [external](https://example.com/path) [anchor](#bottom) [bad](file:///C:/Windows/win.ini)\n\n![local](./pixel.png) ![remote](https://example.com/x.png) ![escape](../outside.png)\n\n' + 'paragraph\n\n'.repeat(80) + '# Bottom', 'utf8');
const calls = { external: [], images: [] };
app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-v04-p4-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Windows may hold the profile briefly. */ }
  }
});
ipcMain.handle('fs:read-text-file', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('fs:read-legacy-text-file', (_e, file) => fsOps.readLegacyTextFile(file));
ipcMain.handle('fs:write-text-file', async (_e, file, value) => { await fs.promises.writeFile(file, value, 'utf8'); return true; });
ipcMain.handle('fs:probe-text-file', (_e, file) => fsOps.probeTextFile(file));
ipcMain.handle('fs:path-exists', () => true);
ipcMain.handle('fs:list-drives', () => []);
ipcMain.handle('fs:read-dir', async (_e, dirPath) => {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name, path: path.join(dirPath, entry.name), isContainer: entry.isDirectory(),
  }));
});
ipcMain.handle('fs:read-local-image', async (_e, source, relative) => {
  calls.images.push([source, relative]);
  if (source !== sample || relative !== './pixel.png') throw new Error('Unsafe image request');
  return { mime: 'image/png', base64: png.toString('base64') };
});
ipcMain.handle('app:open-external-url', (_e, url) => { calls.external.push(url); return true; });
for (const channel of ['terminal:start', 'terminal:read', 'terminal:write', 'terminal:resize', 'terminal:close']) ipcMain.handle(channel, () => null);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: true, webPreferences: {
    preload: path.join(__dirname, '../src/hosts/electron/preload.cjs'),
    contextIsolation: true, nodeIntegration: false, sandbox: true,
  } });
  try {
    win.webContents.on('console-message', (details) => console.log('renderer:', details.message));
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      await window.__workbenchApp.openRenderedMarkdown(${JSON.stringify(sample)});
      const app = window.__workbenchApp;
      const renderedPanel = app.editor.getActivePanel();
      const rendered = app.editor.getContentRenderer(renderedPanel.id).element.querySelector('.markdown-rendered');
      for (let i = 0; i < 40 && !rendered?.querySelector('img[src^="blob:"]'); i++) await wait(100);
      const image = rendered.querySelector('img[alt="local"]');
      await image.decode();
      const imageOk = image.src.startsWith('blob:') && image.getBoundingClientRect().width > 0 && image.naturalWidth > 0;
      const remote = rendered.querySelector('img[alt="remote"]');
      const escape = rendered.querySelector('img[alt="escape"]');
      const blocked = !remote.getAttribute('src') && !escape.getAttribute('src');
      rendered.querySelector('a[href="#bottom"]').click();
      const anchor = rendered.scrollTop > 0;
      rendered.querySelector('a[href^="https:"]').click();
      rendered.querySelector('a[href^="file:"]')?.click();
      await wait(150);
      const editor = app.editor.openItem(${JSON.stringify(sample)}, 'sample.md', {mode: 'pinned', forceNew: true, meta: {kind: 'file', mode: 'editor'}});
      await wait(250);
      app.kindRegistry.getInnerForTest(editor.id).appendContentForTest('\\nSaved change');
      const beforeSave = !rendered.textContent.includes('Saved change');
      const saved = await app.kindRegistry.save(editor.id);
      for (let i = 0; i < 30 && !rendered.textContent.includes('Saved change'); i++) await wait(100);
      const afterSave = rendered.textContent.includes('Saved change');
      renderedPanel.api.setActive();
      document.querySelector('[data-item-id="activity:markdown-rendering"]')?.click();
      rendered.querySelector('a[href="./linked.md"]').click();
      await wait(350);
      const localLink = app.editor.getActivePanel()?.params?.targetId?.toLowerCase().replaceAll('\\\\', '/') === ${JSON.stringify(linked.replaceAll('\\', '/').toLowerCase())} && app.editor.getActivePanel()?.params?.mode === 'rendered';
      const localHasNoError = !app.statusMessages.getText().includes('target no longer exists');
      renderedPanel.api.setActive();
      rendered.querySelector('a[href="./LINKED.md"]').click();
      await wait(350);
      const caseLink = app.editor.getActivePanel()?.params?.targetId?.toLowerCase().replaceAll('\\\\', '/') === ${JSON.stringify(linked.replaceAll('\\', '/').toLowerCase())} && !app.statusMessages.getText().includes('target no longer exists');
      renderedPanel.api.setActive();
      rendered.querySelector('a[href="./notes%23v2.md"]').click();
      await wait(350);
      const encodedLink = app.editor.getActivePanel()?.params?.targetId?.toLowerCase().replaceAll('\\\\', '/') === ${JSON.stringify(hashed.replaceAll('\\', '/').toLowerCase())};
      const noMissingTarget = localHasNoError && !app.statusMessages.getText().includes('target no longer exists');
      const modePanel = app.editor.getActivePanel();
      const modeRoot = app.editor.getContentRenderer(modePanel.id).element.querySelector('.markdown-rendered');
      app.kindRegistry.focusPanel(modePanel.id);
      const renderedFocused = modeRoot.contains(document.activeElement);
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }));
      const f4Editor = modePanel.params.mode === 'editor' && document.getElementById('statusbar-mode-btn').textContent === 'File: Editor';
      await wait(150);
      // No manual refocus from here on: each switch must leave focus where
      // the next F3/F4 is heard (the rendered view lost it after F3).
      const pressOnFocused = async (key) => {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        await wait(150);
      };
      await pressOnFocused('F3');
      const f3Rendered = modePanel.params.mode === 'rendered' && document.getElementById('statusbar-mode-btn').textContent === 'File: Rendered';
      await pressOnFocused('F4');
      const f4AfterF3 = modePanel.params.mode === 'editor';
      await pressOnFocused('F3');
      const f3AfterF4 = modePanel.params.mode === 'rendered';
      const modeButton = document.getElementById('statusbar-mode-btn');
      modeButton.focus();
      modeButton.click();
      await wait(150);
      const statusToEditor = modePanel.params.mode === 'editor';
      await pressOnFocused('F3');
      const f3AfterStatus = modePanel.params.mode === 'rendered';
      modeButton.focus();
      modeButton.click();
      await wait(150);
      modeButton.focus();
      modeButton.click();
      await wait(150);
      await pressOnFocused('F4');
      const f4AfterStatus = modePanel.params.mode === 'editor';
      return {
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("img-src 'self' blob:"),
        image: imageOk, remoteBlocked: blocked, anchor,
        external: true, beforeSave, saved, afterSave,
        localLink, caseLink,
        encodedLink, noMissingTarget, renderedFocused, f4Editor, f3Rendered,
        f4AfterF3, f3AfterF4, statusToEditor, f3AfterStatus, f4AfterStatus,
      };
    })()`);
    result.external = calls.external.length === 1 && calls.external[0] === 'https://example.com/path';
    result.imageCalls = calls.images.some((call) => call[1] === './pixel.png') &&
      calls.images.some((call) => call[1] === '../outside.png') &&
      calls.images.every((call) => call[0] === sample && ['./pixel.png', '../outside.png'].includes(call[1]));
    console.log(JSON.stringify(result));
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
