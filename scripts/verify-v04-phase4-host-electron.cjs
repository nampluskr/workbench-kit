const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-v04-p4-host-'));
app.setPath('userData', path.join(fixture, 'profile'));
const sample = path.join(fixture, 'sample.md');
fs.writeFileSync(sample, '# Sample', 'utf8');
fs.writeFileSync(path.join(fixture, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'));
const outside = path.join(os.tmpdir(), `wb-v04-outside-${process.pid}.png`);
fs.writeFileSync(outside, 'outside');
app.on('quit', () => {
  const resolved = path.resolve(fixture);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('wb-v04-p4-host-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Windows may hold the profile briefly. */ }
  }
  if (outside.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(outside, { force: true });
});

require('../src/hosts/electron/main.cjs');
app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 50; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading() && win.webContents.getURL()) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!win) throw new Error('Production window did not open');
    const bridge = await win.webContents.executeJavaScript(`(async () => {
      const api = window.workbenchHost;
      const sample = ${JSON.stringify(sample)};
      const result = {};
      const valid = await api.readLocalImage(sample, './pixel.png');
      result.valid = valid.mime === 'image/png' && valid.base64.length > 0;
      for (const [key, value] of Object.entries({parent: '../${path.basename(outside)}', scheme: 'file:///C:/Windows/win.ini', network: '//attacker/share.png'})) {
        try { await api.readLocalImage(sample, value); result[key] = false; }
        catch { result[key] = true; }
      }
      result.invalidExternal = await api.openExternalUrl('file:///C:/Windows/win.ini') === false;
      return result;
    })()`);
    const navigation = await win.webContents.executeJavaScript(`new Promise(resolve => {
      const original = location.href;
      const frame = document.createElement('iframe');
      frame.src = 'about:blank';
      document.body.append(frame);
      setTimeout(() => { location.href = 'https://example.com/'; setTimeout(() => resolve(location.href === original), 250); }, 50);
    })`);
    bridge.navigation = navigation;
    bridge.popupDenied = await win.webContents.executeJavaScript(`window.open('https://example.com/', '_blank') === null`);
    console.log(JSON.stringify(bridge));
    app.exit(Object.values(bridge).every(Boolean) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
