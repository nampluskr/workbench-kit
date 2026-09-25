const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbenchHost', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  getWindowBounds: () => ipcRenderer.invoke('window:get-bounds'),
  setWindowBounds: (x, y, width, height) => ipcRenderer.send('window:set-bounds', x, y, width, height),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  readDir: (dirPath) => ipcRenderer.invoke('fs:read-dir', dirPath),
  readTextFile: (filePath) => ipcRenderer.invoke('fs:read-text-file', filePath),
  writeTextFile: (filePath, contents) => ipcRenderer.invoke('fs:write-text-file', filePath, contents),
  createFile: (filePath) => ipcRenderer.invoke('fs:create-file', filePath),
  createFolder: (dirPath) => ipcRenderer.invoke('fs:create-folder', dirPath),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs:rename-path', oldPath, newPath),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:delete-path', targetPath),
  probeTextFile: (filePath) => ipcRenderer.invoke('fs:probe-text-file', filePath),
  readLegacyTextFile: (filePath) => ipcRenderer.invoke('fs:read-legacy-text-file', filePath),
  readLocalImage: (sourcePath, relativePath) => ipcRenderer.invoke('fs:read-local-image', sourcePath, relativePath),
  openExternalUrl: (url) => ipcRenderer.invoke('app:open-external-url', url),
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
