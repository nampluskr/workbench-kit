// Exercise the production preload, IPC handlers, and renderer together.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-root-resize-'));
fs.mkdirSync(path.join(fixture, 'profile'));
fs.mkdirSync(path.join(fixture, 'root', 'child'), { recursive: true });
fs.mkdirSync(path.join(fixture, 'other'));
app.setPath('userData', path.join(fixture, 'profile'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error('Timed out'); app.exit(1); }, 30000);

app.once('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const root = path.join(fixture, 'root');
      const other = path.join(fixture, 'other');
      const navigation = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const app = window.__workbenchApp;
        await app.editor.openItem(${JSON.stringify(root)}, 'Root test', { meta: { kind: 'folder' } });
        await wait(250);
        const panel = document.querySelector('.folder-file-list');
        const input = panel.querySelector('.folder-file-list-path-input');
        const button = panel.querySelector('.folder-file-list-root');
        const icon = !!button?.querySelector('.codicon-root-folder');
        const child = [...panel.querySelectorAll('[data-id]')].find(el => el.dataset.id.endsWith('child'));
        child.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await wait(150);
        const childVisited = input.value === ${JSON.stringify(path.join(root, 'child'))};
        button.click();
        await wait(150);
        const childReturned = input.value === ${JSON.stringify(root)};
        input.value = ${JSON.stringify(other)};
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wait(150);
        const otherVisited = input.value === ${JSON.stringify(other)};
        button.click();
        await wait(150);
        return { icon, childVisited, childReturned, otherVisited, otherReturned: input.value === ${JSON.stringify(root)} };
      })()`);
      assert.ok(Object.values(navigation).every(Boolean), JSON.stringify(navigation));
      console.log('Root navigation:', navigation);

      const directions = ['top', 'bottom', 'left', 'right', 'topleft', 'topright', 'bottomleft', 'bottomright'];
      for (const direction of directions) {
        win.setBounds({ x: 100, y: 100, width: 800, height: 600 });
        await wait(60);
        const before = win.getBounds();
        const dx = direction.includes('left') ? -30 : direction.includes('right') ? 30 : 0;
        const dy = direction.includes('top') ? -20 : direction.includes('bottom') ? 20 : 0;
        await win.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-resize-grip="${direction}"]').dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, screenX: 400, screenY: 400, bubbles: true }));
          await new Promise(r => setTimeout(r, 60));
          document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, screenX: ${400 + dx}, screenY: ${400 + dy} }));
          document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
        })()`);
        await wait(80);
        assert.deepEqual(win.getBounds(), {
          x: before.x + (direction.includes('left') ? dx : 0),
          y: before.y + (direction.includes('top') ? dy : 0),
          width: before.width + Math.abs(dx), height: before.height + Math.abs(dy),
        }, direction);
      }
      console.log('All eight resize directions passed');
      const beforeQuickClick = win.getBounds();
      await win.webContents.executeJavaScript(`(async () => {
        const grip = document.querySelector('[data-resize-grip="right"]');
        grip.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, screenX: 400, screenY: 400 }));
        document.dispatchEvent(new MouseEvent('mouseup'));
        await new Promise(r => setTimeout(r, 60));
        document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, screenX: 500, screenY: 400 }));
        document.dispatchEvent(new MouseEvent('mouseup'));
      })()`);
      await wait(80);
      assert.deepEqual(win.getBounds(), beforeQuickClick);
      console.log('Quick release does not start a delayed drag');
      win.maximize();
      await wait(150);
      assert.equal(await win.webContents.executeJavaScript('window.workbenchHost.getWindowBounds()'), null);
      console.log('Maximized window rejects resize');
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});

app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('wb-root-resize-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Profile files may still be locked. */ }
  }
});
require('../src/hosts/electron/main.cjs');
