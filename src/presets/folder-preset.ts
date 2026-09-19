import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';
import { readDirectory, type HostDirectoryEntry } from '../providers/filesystem';

export const FOLDER_KIND = 'folder';

export function getFolderModeLabel(mode?: string): string {
  if (mode === 'cmd') return 'Command Prompt';
  if (mode === 'powershell' || mode === 'terminal') return 'PowerShell';
  return 'File List';
}

export function registerFolderPreset(registry: ResourceKindRegistry, openEntry?: (entry: HostDirectoryEntry) => void): void {
  registry.register(FOLDER_KIND, (targetId) => {
    const element = document.createElement('div');
    element.className = 'preset-folder-view folder-file-list';
    const header = document.createElement('div');
    header.className = 'folder-file-list-header';
    const title = document.createElement('span');
    title.textContent = targetId;
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = 'Refresh';
    header.append(title, refresh);
    const list = document.createElement('div');
    list.className = 'folder-file-list-items';
    element.append(header, list);
    let disposed = false;
    const load = async () => {
      list.textContent = 'Loading...';
      try {
        const entries = await readDirectory(targetId);
        if (disposed) return;
        list.replaceChildren();
        entries.sort((a, b) => Number(b.isContainer) - Number(a.isContainer) || a.name.localeCompare(b.name));
        for (const entry of entries) {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'folder-file-list-row';
          row.textContent = `${entry.isContainer ? '[Folder]' : '[File]'}  ${entry.name}`;
          row.title = entry.path;
          row.addEventListener('click', () => openEntry?.(entry));
          list.appendChild(row);
        }
        if (entries.length === 0) list.textContent = 'This folder is empty.';
      } catch (error) {
        if (!disposed) list.textContent = `Unable to read folder: ${String(error)}`;
      }
    };
    refresh.addEventListener('click', () => void load());
    void load();
    return { element, dispose: () => { disposed = true; } };
  });
}

export async function openFolder(
  editor: AppEditorSurface,
  path: string,
  title?: string,
  options?: EditorOpenOptions
): Promise<void> {
  await editor.openItem(path, title, { ...options, meta: { ...(options?.meta || {}), kind: FOLDER_KIND } });
}
