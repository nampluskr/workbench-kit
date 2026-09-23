const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbenchHost', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  readDir: (dirPath) => ipcRenderer.invoke('fs:read-dir', dirPath),
  readTextFile: (filePath) => ipcRenderer.invoke('fs:read-text-file', filePath),
  writeTextFile: (filePath, contents) => ipcRenderer.invoke('fs:write-text-file', filePath, contents),
  terminalStart: (kind, cwd) => ipcRenderer.invoke('terminal:start', kind, cwd),
  terminalRead: (id) => ipcRenderer.invoke('terminal:read', id),
  terminalWrite: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
  terminalResize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  terminalClose: (id) => ipcRenderer.invoke('terminal:close', id),
  onTerminalData: (callback) => {
    const listener = (_e, id, data) => callback(id, data);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (callback) => {
    const listener = (_e, id) => callback(id);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
  listDrives: () => ipcRenderer.invoke('fs:list-drives'),
  getDriveTotalBytes: (targetPath) => ipcRenderer.invoke('fs:drive-total-bytes', targetPath),
  // Real window state, pushed from main.cjs's native 'maximize'/'unmaximize'
  // listeners — covers the button AND a titlebar double-click/OS Snap
  // (user request, 2026-09-15).
  onMaximizedChange: (callback) => ipcRenderer.on('window:maximized-changed', (_e, isMaximized) => callback(isMaximized)),
});
