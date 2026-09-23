// Verifies that the production terminal preset activates xterm's WebGL
// renderer and keeps the typography contract used by its DOM fallback.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-terminal-renderer-'));
app.setPath('userData', path.join(fixture, 'profile'));
require('../src/hosts/electron/main.cjs');

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('Production host did not create a window');
  if (win.webContents.isLoading()) {
    await new Promise((resolve, reject) => {
      win.webContents.once('did-finish-load', resolve);
      win.webContents.once('did-fail-load', (_event, code, reason) => reject(new Error(`${code}: ${reason}`)));
    });
  }
  win.webContents.setBackgroundThrottling(false);
  win.show();
  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const panel = window.__workbenchApp.openResource(
        ${JSON.stringify(fixture)}, 'Renderer test', 'terminal', 'cmd', 'pinned', true
      );
      panel?.api?.setActive?.();
      const deadline = Date.now() + 5000;
      let view;
      while (Date.now() < deadline) {
        const views = [...document.querySelectorAll('.preset-terminal-view')];
        view = views.find((candidate) => candidate.offsetWidth > 0 && candidate.offsetHeight > 0)
          || views.at(-1);
        if (view?.querySelector('.xterm')) break;
        await wait(50);
      }
      const xterm = view?.querySelector('.xterm');
      const style = xterm ? getComputedStyle(xterm) : null;
      const result = {
        visibilityState: document.visibilityState,
        terminalMounted: Boolean(view),
        terminalViewCount: document.querySelectorAll('.preset-terminal-view').length,
        terminalViewSize: view ? [view.offsetWidth, view.offsetHeight] : null,
        panelId: panel?.id || '',
        webglCanvasPresent: Boolean(view?.querySelector('canvas')),
        canvasClasses: [...(view?.querySelectorAll('canvas') || [])].map((canvas) => canvas.className),
        computedFontFamily: style?.fontFamily || '',
        computedFontSize: style?.fontSize || '',
        computedLetterSpacing: style?.letterSpacing || '',
        d2CodingPrimary: Boolean(style?.fontFamily.includes('D2Coding')),
        fontSize14: style?.fontSize === '14px',
        letterSpacingZero: style?.letterSpacing === '0px' || style?.letterSpacing === 'normal',
      };
      await wait(500);
      await panel?.api?.close?.();
      await wait(1000);
      return result;
    })()`);
    console.log(JSON.stringify(result));
    const passed = result.terminalMounted && result.webglCanvasPresent && result.d2CodingPrimary
      && result.fontSize14 && result.letterSpacingZero;
    win.destroy();
    app.exit(passed ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('wb-terminal-renderer-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Profile can remain locked briefly. */ }
  }
});
