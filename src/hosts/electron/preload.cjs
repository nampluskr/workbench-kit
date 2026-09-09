const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbenchHost', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  readDir: (dirPath) => ipcRenderer.invoke('fs:read-dir', dirPath),
});
