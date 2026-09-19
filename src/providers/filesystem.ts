import { ITreeDataProvider, TreeNode } from '../core/tree';

export interface HostDirectoryEntry {
  name: string;
  path: string;
  isContainer: boolean;
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
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    return window.prompt('Enter file path to open:', '/sample/file.txt');
  }
  return '/sample/file.txt';
}

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
