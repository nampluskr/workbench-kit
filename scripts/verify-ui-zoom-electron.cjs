const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-zoom-check-'));
app.setPath('userData', profileDir);
require('../src/hosts/electron/main.cjs');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const closeTo = (actual, expected) => Math.abs(actual - expected) < 0.01;
const finish = (win, code) => {
  win.destroy();
  const target = fs.realpathSync(profileDir);
  const parent = fs.realpathSync(os.tmpdir());
  if (path.dirname(target) === parent && path.basename(target).startsWith('wb-zoom-check-')) {
    try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Windows may still hold the profile. */ }
  }
  process.exit(code);
};

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const press = async (keyCode, modifiers) => {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        await delay(100);
      };
      const zoom = () => win.webContents.getZoomFactor();
      if (!closeTo(zoom(), 1)) throw new Error(`Initial zoom: ${zoom()}`);
      const baseFonts = await win.webContents.executeJavaScript(`(() => {
        const sample = document.createElement('div');
        sample.className = 'markdown-rendered';
        document.body.appendChild(sample);
        const markdown = getComputedStyle(sample).fontSize;
        sample.remove();
        return { markdown, body: getComputedStyle(document.body).fontSize,
          titlebar: getComputedStyle(document.querySelector('.workbench-titlebar')).fontSize };
      })()`);
      process.stdout.write(`BASE_FONTS ${JSON.stringify(baseFonts)}\n`);
      if (baseFonts.markdown !== '14.4px' || baseFonts.body !== '16px' || baseFonts.titlebar !== '13px') {
        throw new Error(`Unexpected base fonts: ${JSON.stringify(baseFonts)}`);
      }

      await press('-', ['control']);
      if (!closeTo(zoom(), 0.9)) throw new Error(`Ctrl+- zoom: ${zoom()}`);

      await press('+', ['control', 'shift']);
      if (!closeTo(zoom(), 1)) throw new Error(`Ctrl+Plus zoom: ${zoom()}`);

      await press('-', ['control']);
      await press('0', ['control', 'shift']);
      if (!closeTo(zoom(), 1)) throw new Error(`Ctrl+Shift+0 zoom: ${zoom()}`);

      const menuResult = await win.webContents.executeJavaScript(`(() => {
        const menu = window.__workbenchApp.menu;
        menu.openMenu();
        document.querySelector('[data-category-id="view"]').click();
        document.querySelector('[data-item-id="view:appearance"]').dispatchEvent(
          new MouseEvent('mouseenter', { bubbles: true })
        );
        const row = document.querySelector('[data-item-id="view:zoom-in"]');
        if (!row) return false;
        row.click();
        return true;
      })()`);
      await delay(100);
      if (!menuResult || !closeTo(zoom(), 1.1)) throw new Error(`Menu Zoom In: ${zoom()}`);
      const beforeWheel = await win.webContents.executeJavaScript(`(() => {
        const sample = document.createElement('div');
        sample.className = 'markdown-rendered';
        sample.textContent = 'Markdown zoom sample';
        document.body.appendChild(sample);
        const result = { font: parseFloat(getComputedStyle(sample).fontSize),
          uiZoom: getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() };
        sample.remove();
        return result;
      })()`);
      if (!closeTo(beforeWheel.font * zoom(), 14.4) || beforeWheel.uiZoom !== '1.1') {
        throw new Error(`Markdown changed with UI zoom: ${JSON.stringify(beforeWheel)}`);
      }
      win.webContents.sendInputEvent({ type: 'mouseWheel', x: 500, y: 400,
        deltaX: 0, deltaY: 100, modifiers: ['control'] });
      await delay(120);
      if (!closeTo(zoom(), 1.1)) throw new Error(`Ctrl+wheel outside Markdown changed UI zoom: ${zoom()}`);
      const markdownWheel = await win.webContents.executeJavaScript(`(() => {
        const sample = document.createElement('div');
        sample.className = 'markdown-rendered';
        sample.textContent = 'Markdown zoom sample';
        const other = document.createElement('div');
        other.className = 'markdown-rendered';
        document.body.append(sample, other);
        sample.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true }));
        const up = { markdownZoom: sample.style.getPropertyValue('--markdown-zoom'),
          font: parseFloat(getComputedStyle(sample).fontSize),
          otherFont: parseFloat(getComputedStyle(other).fontSize) };
        sample.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 100, bubbles: true, cancelable: true }));
        const down = sample.style.getPropertyValue('--markdown-zoom');
        sample.remove();
        other.remove();
        return { up, down };
      })()`);
      if (!closeTo(zoom(), 1.1) || markdownWheel.up.markdownZoom !== '1.1' ||
          !closeTo(markdownWheel.up.font * zoom(), 15.84) ||
          !closeTo(markdownWheel.up.otherFont * zoom(), 14.4) || markdownWheel.down !== '1') {
        throw new Error(`Markdown-only wheel zoom failed: ${JSON.stringify(markdownWheel)}`);
      }

      await new Promise((resolve) => {
        win.webContents.once('did-finish-load', resolve);
        win.reload();
      });
      await delay(120);
      const reloaded = await win.webContents.executeJavaScript(`(() => {
        const sample = document.createElement('div');
        sample.className = 'markdown-rendered';
        document.body.appendChild(sample);
        const result = { font: parseFloat(getComputedStyle(sample).fontSize),
          uiZoom: getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() };
        sample.remove();
        return result;
      })()`);
      if (!closeTo(reloaded.font * zoom(), 14.4) || !closeTo(Number(reloaded.uiZoom), zoom())) {
        throw new Error(`Markdown zoom drifted after reload: ${JSON.stringify(reloaded)}, host ${zoom()}`);
      }

      process.stdout.write('PASS: UI keyboard/menu zoom excludes Markdown; Ctrl+wheel zooms Markdown only\n');
      finish(win, 0);
    } catch (error) {
      process.stderr.write(`FAIL: ${error.stack || error}\n`);
      finish(win, 1);
    }
  });
});
