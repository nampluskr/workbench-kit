const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbenchHost', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  readDir: (dirPath) => ipcRenderer.invoke('fs:read-dir', dirPath),
  // Real window state, pushed from main.cjs's native 'maximize'/'unmaximize'
  // listeners — covers the button AND a titlebar double-click/OS Snap
  // (user request, 2026-09-15).
  onMaximizedChange: (callback) => ipcRenderer.on('window:maximized-changed', (_e, isMaximized) => callback(isMaximized)),
});
