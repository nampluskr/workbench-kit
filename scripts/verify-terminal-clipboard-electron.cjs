// Verifies terminal copy/paste in the production Electron host: Ctrl+V and
// right click paste, Ctrl+C and right click copy a selection, and Ctrl+C with
// no selection still interrupts the running command.
const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-terminal-clipboard-'));
app.setPath('userData', path.join(fixture, 'profile'));
require('../src/hosts/electron/main.cjs');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('Production host did not create a window');
  if (win.webContents.isLoading()) await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  win.webContents.setBackgroundThrottling(false);
  win.show();
  const wc = win.webContents;
  const ev = (code) => wc.executeJavaScript(code);
  const key = async (keyCode, modifiers) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await wait(300);
  };
  const click = async (x, y, button) => {
    wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
    await wait(400);
  };
  const result = {};
  try {
    await ev(`(() => {
      window.__panel = window.__workbenchApp.openResource(${JSON.stringify(fixture)}, 'Clipboard test', 'terminal', 'cmd', 'pinned', true);
      window.__panel?.api?.setActive?.();
    })()`);
    await wait(3000);
    const transcript = () => ev('window.__workbenchApp.kindRegistry.getInnerForTest(window.__panel.id).getContentForTest()');
    const rect = await ev(`(() => { const r = document.querySelector('.xterm-screen').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; })()`);
    const cx = Math.round(rect.x + rect.w / 2);
    const cy = Math.round(rect.y + 40);
    await click(cx, cy, 'left');

    const count = async (marker) => (await transcript()).split(marker).length - 1;
    const pasted = async (marker, action) => {
      clipboard.writeText('echo ' + marker);
      const before = await count(marker);
      await action();
      return (await count(marker)) > before;
    };
    result.pasteCtrlV = await pasted('PASTE_CTRL_V', () => key('V', ['control']));
    result.pasteRightClick = await pasted('PASTE_RIGHT_CLICK', () => click(cx, cy, 'right'));

    const dragSelect = async () => {
      const y = Math.round(rect.y + 20);
      wc.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x + 12), y, button: 'left', clickCount: 1 });
      for (let x = 12; x < rect.w - 20; x += 40) wc.sendInputEvent({ type: 'mouseMove', x: Math.round(rect.x + x), y, button: 'left' });
      wc.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x + rect.w - 20), y, button: 'left', clickCount: 1 });
      await wait(400);
    };
    const copied = async (sentinel, action) => {
      clipboard.writeText(sentinel);
      await dragSelect();
      await action();
      const text = String(await clipboard.readText());
      return text !== sentinel && text.includes('Microsoft');
    };
    result.copyCtrlC = await copied('SENTINEL_CTRL_C', () => key('C', ['control']));
    result.copyRightClick = await copied('SENTINEL_RIGHT_CLICK', () => click(cx, cy, 'right'));

    // No selection now (each copy clears it): Ctrl+C must reach the shell.
    await key('Escape'); // cmd clears the prompt line the paste checks left behind
    clipboard.writeText('ping -n 30 127.0.0.1\r');
    await key('V', ['control']);
    await wait(3000);
    const mark = (await transcript()).length;
    await key('C', ['control']);
    await wait(2500);
    // ping prints "Control-C" only when the interrupt reaches it (any locale).
    const after = (await transcript()).slice(mark);
    result.ctrlCInterruptsWithoutSelection = after.includes('Control-C');
    if (!result.ctrlCInterruptsWithoutSelection) console.error('tail:', JSON.stringify(after.slice(-400)));
    console.log(JSON.stringify(result));
    win.destroy();
    app.exit(Object.values(result).every(Boolean) ? 0 : 1);
  } catch (error) {
    console.error(error, JSON.stringify(result));
    app.exit(1);
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('wb-terminal-clipboard-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Profile can remain locked briefly. */ }
  }
});
