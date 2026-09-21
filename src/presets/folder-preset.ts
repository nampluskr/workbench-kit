import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';
import { readDirectory, type HostDirectoryEntry } from '../providers/filesystem';
import { IconThemeManager } from '../core/icontheme';
import { RowListController, RowListItem } from '../core/rowlist';

export const FOLDER_KIND = 'folder';

export function getFolderModeLabel(mode?: string): string {
  if (mode === 'cmd') return 'Command Prompt';
  if (mode === 'powershell' || mode === 'terminal') return 'PowerShell';
  return 'File List';
}

/**
 * Everything the folder-list view needs from `main.ts` to match the
 * Explorer tree's row behaviour exactly (WK-113, user request, 2026-09-21):
 * same icon theme, same click(preview)/dblclick(pinned)/Enter open rules
 * (`openFromEntry`/`openEntryOnEnter`), same right-click menu. The view
 * itself only knows `id`/`label`/`isContainer` (`RowListItem`) — it stays
 * oblivious to what "file" or "folder" means (D-4, INTENT 3).
 */
export interface FolderPresetDeps {
  iconTheme: IconThemeManager;
  onOpenEntry: (entry: RowListItem) => void;
  onConfirmEntry: (entry: RowListItem) => void;
  onEnterOpenEntry: (entry: RowListItem) => void;
  onContextMenuEntry: (entry: RowListItem, x: number, y: number) => void;
}

export function registerFolderPreset(registry: ResourceKindRegistry, deps: FolderPresetDeps): void {
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

    const statusEl = document.createElement('div');
    statusEl.className = 'folder-file-list-status';
    statusEl.hidden = true;

    const listContainer = document.createElement('div');
    listContainer.className = 'folder-file-list-items';
    element.append(header, statusEl, listContainer);

    // Same row visuals/interactions as the Explorer tree (.tree-list/
    // .tree-row/.tree-icon), just flat — no expand/collapse, no root row
    // (see src/core/rowlist.ts's file-level comment for why this is a
    // separate component rather than a "no-expand" mode of TreeController).
    const rowList = new RowListController(listContainer, deps.iconTheme);
    let disposed = false;
    let entriesByPath = new Map<string, HostDirectoryEntry>();

    const toRowItem = (entry: HostDirectoryEntry): RowListItem =>
      ({ id: entry.path, label: entry.name, isContainer: entry.isContainer });

    rowList.onOpen((item) => { const e = entriesByPath.get(item.id); if (e) deps.onOpenEntry(toRowItem(e)); });
    rowList.onConfirm((item) => { const e = entriesByPath.get(item.id); if (e) deps.onConfirmEntry(toRowItem(e)); });
    rowList.onEnterOpen((item) => { const e = entriesByPath.get(item.id); if (e) deps.onEnterOpenEntry(toRowItem(e)); });
    rowList.onContextMenu((item, x, y) => { const e = entriesByPath.get(item.id); if (e) deps.onContextMenuEntry(toRowItem(e), x, y); });

    const setStatus = (text: string | null) => {
      if (text === null) {
        statusEl.hidden = true;
        statusEl.textContent = '';
        listContainer.hidden = false;
      } else {
        statusEl.hidden = false;
        statusEl.textContent = text;
        listContainer.hidden = true;
      }
    };

    // Codex A22 R1 (Major): Refresh can be clicked again (or targetId can
    // otherwise trigger a second `load()`) while an earlier read is still
    // in flight. Without a generation guard, a slow first response landing
    // AFTER a fast second one would overwrite the newer rows with stale
    // ones — a plain `disposed` check does not catch this, since neither
    // request has been disposed, they are just out of order.
    let loadGeneration = 0;
    const load = async () => {
      const generation = ++loadGeneration;
      setStatus('Loading...');
      try {
        const entries = await readDirectory(targetId);
        if (disposed || generation !== loadGeneration) return;
        entries.sort((a, b) => Number(b.isContainer) - Number(a.isContainer) || a.name.localeCompare(b.name));
        entriesByPath = new Map(entries.map((e) => [e.path, e]));
        rowList.setItems(entries.map(toRowItem));
        setStatus(null);
      } catch (error) {
        if (disposed || generation !== loadGeneration) return;
        entriesByPath = new Map();
        rowList.setItems([]);
        setStatus(`Unable to read folder: ${String(error)}`);
      }
    };
    refresh.addEventListener('click', () => void load());
    void load();
    return { element, dispose: () => { disposed = true; rowList.dispose(); } };
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
