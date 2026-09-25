const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-terminal-host-'));
app.setPath('userData', path.join(fixture, 'profile'));
require('../src/hosts/electron/main.cjs');

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('Production host did not create a window');
  if (win.webContents.isLoading()) {
    await new Promise((resolve, reject) => {
      win.webContents.once('did-finish-load', resolve);
      win.webContents.once('did-fail-load', (_e, code, reason) => reject(new Error(`${code}: ${reason}`)));
    });
  }
  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const host = window.workbenchHost;
      const chunks = [];
      const unsub = host.onTerminalData((id, data) => chunks.push({ id, data }));
      const id = await host.terminalStart('cmd', ${JSON.stringify(fixture)});
      const initial = await host.terminalRead(id);
      await host.terminalWrite(id, 'echo WB_HOST_PUSH_CHECK\\r');
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !chunks.some((item) => item.id === id && item.data.includes('WB_HOST_PUSH_CHECK'))) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const pushed = chunks.some((item) => item.id === id && item.data.includes('WB_HOST_PUSH_CHECK'));
      const later = await host.terminalRead(id);
      await host.terminalClose(id);
      const remainingId = await host.terminalStart('cmd', ${JSON.stringify(fixture)});
      unsub();
      return { started: Boolean(id), pushed, noBufferedDuplicate: later.output === '',
        initialReadWorked: typeof initial.output === 'string', remainingForQuit: Boolean(remainingId) };
    })()`);
    console.log(JSON.stringify(result));
    if (!Object.values(result).every(Boolean)) app.exit(1);
    else { win.destroy(); app.quit(); }
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
