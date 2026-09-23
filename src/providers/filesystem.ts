import { ITreeDataProvider, TreeNode } from '../core/tree';

export interface HostDirectoryEntry {
  name: string;
  path: string;
  isContainer: boolean;
  /** Bytes, or `null` for a container (v0.3 WK-118) — folder size is not computed recursively, same as Explorer's own Details view default. */
  size: number | null;
  /** Last-modified time, epoch milliseconds (v0.3 WK-118) — both a file and a folder have one. */
  mtimeMs: number;
}

export interface HostDriveEntry {
  path: string;
  /** Volume label, or `''` when the drive has none (v0.3 WK-111 follow-up). */
  label: string;
}

export interface HostFileSystemBridge {
  openFolderDialog?: () => Promise<string | null>;
  openFileDialog?: () => Promise<string | null>;
  readDir?: (dirPath: string) => Promise<HostDirectoryEntry[]>;
  open_folder_dialog?: () => Promise<string | null>;
  open_file_dialog?: () => Promise<string | null>;
  read_dir?: (dirPath: string) => Promise<HostDirectoryEntry[]>;
  listDrives?: () => Promise<HostDriveEntry[]>;
  list_drives?: () => Promise<HostDriveEntry[]>;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, contents: string) => Promise<boolean>;
  read_text_file?: (path: string) => Promise<string>;
  write_text_file?: (path: string, contents: string) => Promise<boolean>;
  terminalStart?: (kind: string, cwd: string) => Promise<string>;
  terminalRead?: (id: string) => Promise<{ output: string; exited: boolean }>;
  terminalWrite?: (id: string, data: string) => Promise<void>;
  terminalResize?: (id: string, cols: number, rows: number) => Promise<void>;
  terminalClose?: (id: string) => Promise<void>;
  onTerminalData?: (callback: (id: string, data: string) => void) => void;
  onTerminalExit?: (callback: (id: string) => void) => void;
  terminal_start?: (kind: string, cwd: string) => Promise<string>;
  terminal_read?: (id: string) => Promise<{ output: string; exited: boolean }>;
  terminal_write?: (id: string, data: string) => Promise<void>;
  terminal_resize?: (id: string, cols: number, rows: number) => Promise<void>;
  terminal_close?: (id: string) => Promise<void>;
}

function getHostFsBridge(): HostFileSystemBridge | null {
  if (typeof window === 'undefined') return null;
  const electron = (window as unknown as { workbenchHost?: HostFileSystemBridge }).workbenchHost;
  if (electron?.openFolderDialog || electron?.openFileDialog || electron?.readDir) return electron;
  const py = (window as unknown as { pywebview?: { api?: HostFileSystemBridge } }).pywebview?.api;
  if (py?.open_folder_dialog || py?.open_file_dialog || py?.read_dir) return py;
  return null;
}

/**
 * Invokes native host folder selection dialog across Electron and pywebview.
 */
export async function promptOpenFolderDialog(): Promise<string | null> {
  const host = getHostFsBridge();
  if (host?.openFolderDialog) {
    return await host.openFolderDialog();
  }
  if (host?.open_folder_dialog) {
    return await host.open_folder_dialog();
  }
  return null;
}

/**
 * Invokes host file selection dialog or fallback prompt.
 */
export async function promptOpenFileDialog(): Promise<string | null> {
  const host = getHostFsBridge();
  if (host?.openFileDialog) {
    return await host.openFileDialog();
  }
  if (host?.open_file_dialog) {
    return await host.open_file_dialog();
  }
  return null;
}

export async function readTextFile(path: string): Promise<string> {
  const host = getHostFsBridge();
  if (host?.readTextFile) return host.readTextFile(path);
  if (host?.read_text_file) return host.read_text_file(path);
  throw new Error('File reading is unavailable in this host');
}

export async function writeTextFile(path: string, contents: string): Promise<boolean> {
  const host = getHostFsBridge();
  if (host?.writeTextFile) return host.writeTextFile(path, contents);
  if (host?.write_text_file) return host.write_text_file(path, contents);
  throw new Error('File saving is unavailable in this host');
}

export async function readDirectory(path: string): Promise<HostDirectoryEntry[]> {
  const host = getHostFsBridge();
  if (host?.readDir) return host.readDir(path);
  if (host?.read_dir) return host.read_dir(path);
  throw new Error('Directory reading is unavailable in this host');
}

type TerminalDataCallback = (id: string, data: string) => void;
type TerminalExitCallback = (id: string) => void;

const terminalDataListeners = new Set<TerminalDataCallback>();
const terminalExitListeners = new Set<TerminalExitCallback>();

if (typeof window !== 'undefined') {
  (window as any).__wbTerminalPush = (id: string, data: string) => {
    terminalDataListeners.forEach((fn) => fn(id, data));
  };
  (window as any).__wbTerminalExit = (id: string) => {
    terminalExitListeners.forEach((fn) => fn(id));
  };
}

let electronBridgeWired = false;
function ensureHostTerminalStream(): void {
  if (electronBridgeWired) return;
  const host = getHostFsBridge();
  if (host?.onTerminalData) {
    host.onTerminalData((id, data) => {
      terminalDataListeners.forEach((fn) => fn(id, data));
    });
  }
  if (host?.onTerminalExit) {
    host.onTerminalExit((id) => {
      terminalExitListeners.forEach((fn) => fn(id));
    });
  }
  electronBridgeWired = true;
}

export const terminalHost = {
  async start(kind: 'cmd' | 'powershell', cwd: string): Promise<string> {
    const host = getHostFsBridge();
    if (host?.terminalStart) return host.terminalStart(kind, cwd);
    if (host?.terminal_start) return host.terminal_start(kind, cwd);
    throw new Error('Terminal is unavailable in this host');
  },
  async read(id: string): Promise<{ output: string; exited: boolean }> {
    const host = getHostFsBridge();
    if (host?.terminalRead) return host.terminalRead(id);
    if (host?.terminal_read) return host.terminal_read(id);
    return { output: '', exited: true };
  },
  async write(id: string, data: string): Promise<void> {
    const host = getHostFsBridge();
    if (host?.terminalWrite) await host.terminalWrite(id, data);
    else if (host?.terminal_write) await host.terminal_write(id, data);
  },
  async resize(id: string, cols: number, rows: number): Promise<void> {
    const host = getHostFsBridge();
    if (host?.terminalResize) await host.terminalResize(id, cols, rows);
    else if (host?.terminal_resize) await host.terminal_resize(id, cols, rows);
  },
  async close(id: string): Promise<void> {
    const host = getHostFsBridge();
    if (host?.terminalClose) await host.terminalClose(id);
    else if (host?.terminal_close) await host.terminal_close(id);
  },
  onData(callback: TerminalDataCallback): () => void {
    ensureHostTerminalStream();
    terminalDataListeners.add(callback);
    return () => terminalDataListeners.delete(callback);
  },
  onExit(callback: TerminalExitCallback): () => void {
    ensureHostTerminalStream();
    terminalExitListeners.add(callback);
    return () => terminalExitListeners.delete(callback);
  },
};

/**
 * Every accessible drive root on the host, with its volume label (v0.3
 * WK-111, D-1 extension) — e.g. `[{path:"C:\\",label:"System"}]` on
 * Windows, `[]` on any host/OS that doesn't expose this bridge method
 * (both hosts' implementations already filter out a drive letter that
 * exists but isn't actually reachable, like an empty CD-ROM drive).
 */
export async function listDrives(): Promise<HostDriveEntry[]> {
  const host = getHostFsBridge();
  if (host?.listDrives) {
    return await host.listDrives();
  }
  if (host?.list_drives) {
    return await host.list_drives();
  }
  return [];
}

/**
 * File system TreeDataProvider backed by host bridges.
 * Lives outside src/core/ to preserve core purity (NFR-1, INTENT 3).
 */
export class FileSystemTreeProvider implements ITreeDataProvider {
  public async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!node) {
      return [];
    }

    const dataObj = node.data as { path?: string } | undefined;
    const dirPath = String(dataObj?.path || node.id);
    if (!dirPath) {
      return [];
    }

    let entries: HostDirectoryEntry[] = [];
    const host = getHostFsBridge();
    if (host?.readDir) {
      entries = (await host.readDir(dirPath)) as HostDirectoryEntry[];
    } else if (host?.read_dir) {
      entries = (await host.read_dir(dirPath)) as HostDirectoryEntry[];
    }

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isContainer && !b.isContainer) return -1;
      if (!a.isContainer && b.isContainer) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return entries.map((entry) => ({
      id: entry.path,
      label: entry.name,
      isContainer: entry.isContainer,
      children: entry.isContainer ? [] : undefined,
      data: { path: entry.path },
    }));
  }

  /**
   * Whether a path still exists, by listing its parent directory (FR-G3).
   * Reuses the existing readDir bridge — no new host-native code needed.
   */
  public async pathExists(targetPath: string): Promise<boolean> {
    const normalized = targetPath.replace(/[/\\]+$/, '');
    const lastSepIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    if (lastSepIndex <= 0) return true;
    const parentPath = normalized.slice(0, lastSepIndex);

    const host = getHostFsBridge();
    if (!host?.readDir && !host?.read_dir) return true;

    try {
      const entries = host.readDir
        ? ((await host.readDir(parentPath)) as HostDirectoryEntry[])
        : ((await host.read_dir!(parentPath)) as HostDirectoryEntry[]);
      return entries.some((e) => e.path === normalized || e.path === targetPath);
    } catch {
      return false;
    }
  }

  public async createRootNode(folderPath: string): Promise<TreeNode> {
    let cleanPath = folderPath.replace(/[/\\]+$/, '');
    if (cleanPath === '') {
      cleanPath = folderPath.startsWith('/') ? '/' : '\\';
    } else if (/^[a-zA-Z]:$/.test(cleanPath)) {
      cleanPath = folderPath.includes('/') ? `${cleanPath}/` : `${cleanPath}\\`;
    }
    const parts = cleanPath.split(/[/\\]/).filter(Boolean);
    const folderName = parts[parts.length - 1] || cleanPath;

    const rootNode: TreeNode = {
      id: cleanPath,
      label: folderName,
      isContainer: true,
      children: [],
      data: { path: cleanPath },
    };

    rootNode.children = await this.getChildren(rootNode);
    return rootNode;
  }
}
