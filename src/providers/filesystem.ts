import { ITreeDataProvider, TreeNode } from '../core/tree';

export interface HostDirectoryEntry {
  name: string;
  path: string;
  isContainer: boolean;
}

export interface HostFileSystemBridge {
  openFolderDialog?: () => Promise<string | null>;
  readDir?: (dirPath: string) => Promise<HostDirectoryEntry[]>;
  open_folder_dialog?: () => Promise<string | null>;
  read_dir?: (dirPath: string) => Promise<HostDirectoryEntry[]>;
}

function getHostFsBridge(): HostFileSystemBridge | null {
  if (typeof window === 'undefined') return null;
  const electron = (window as unknown as { workbenchHost?: HostFileSystemBridge }).workbenchHost;
  if (electron?.openFolderDialog || electron?.readDir) return electron;
  const py = (window as unknown as { pywebview?: { api?: HostFileSystemBridge } }).pywebview?.api;
  if (py?.open_folder_dialog || py?.read_dir) return py;
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
