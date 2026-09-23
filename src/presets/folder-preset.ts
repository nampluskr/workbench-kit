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

export interface FolderPresetDeps {
  iconTheme: IconThemeManager;
}

/** Sentinel id for the synthetic "go up" row — never a real filesystem path (those are always absolute). */
const PARENT_ENTRY_ID = '..';

/** A bare drive letter ("C:") normalized the way `readDirectory()` expects it, mirroring `foldertabs.ts`'s own `normalizePath()`. */
function normalizeDriveRoot(path: string): string {
  return /^[a-zA-Z]:$/.test(path) ? `${path}\\` : path;
}

/**
 * Parent directory of `path`, or `null` when already at a root (a drive
 * letter or the POSIX `/`) — same separator-scan `pathExists()`
 * (`filesystem.ts`) already uses.
 */
function parentOf(path: string): string | null {
  const norm = path.replace(/[/\\]+$/, '');
  if (norm === '' || /^[a-zA-Z]:$/.test(norm)) return null;
  const lastSepIndex = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (lastSepIndex < 0) return null;
  if (lastSepIndex === 0) return norm[0] === '/' ? '/' : null;
  return normalizeDriveRoot(norm.slice(0, lastSepIndex));
}

/**
 * A folder tab's editor-area "file list" view (WK-113), rebuilt as a
 * self-contained one-level-at-a-time browser (WK-116, out-of-plan
 * addition, 2026-09-23 — user request): it no longer opens files/folders
 * anywhere else. A click only selects; double-click/Enter on a folder row
 * steps INTO it (re-reading that directory into the same panel); a
 * synthetic `..` row (hidden at a drive root) steps back UP the same way.
 * A file row has no activation behaviour at all — selection is all it
 * gets, matching "실행 기능 제거" (no more Open as Viewer/Editor from here).
 */
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

    // Same row visuals as the Explorer tree (.tree-list/.tree-row/
    // .tree-icon), just flat — no expand/collapse, no root row (see
    // src/core/rowlist.ts's file-level comment for why this is a separate
    // component rather than a "no-expand" mode of TreeController).
    const rowList = new RowListController(listContainer, deps.iconTheme);
    let disposed = false;
    let currentPath = targetId;
    let entriesByPath = new Map<string, HostDirectoryEntry>();

    const toRowItem = (entry: HostDirectoryEntry): RowListItem =>
      ({ id: entry.path, label: entry.name, isContainer: entry.isContainer });

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

    // Codex A22 R1 (Major, carried over from WK-113): a slow earlier
    // navigation landing AFTER a faster later one must not overwrite the
    // newer rows with stale ones — a plain `disposed` check does not catch
    // this, since neither request has been disposed, they are just out of
    // order (now also reachable by rapid `..`/subfolder navigation, not
    // just Refresh).
    let loadGeneration = 0;
    const load = async (path: string) => {
      const generation = ++loadGeneration;
      currentPath = path;
      title.textContent = path;
      setStatus('Loading...');
      try {
        const entries = await readDirectory(path);
        if (disposed || generation !== loadGeneration) return;
        entries.sort((a, b) => Number(b.isContainer) - Number(a.isContainer) || a.name.localeCompare(b.name));
        entriesByPath = new Map(entries.map((e) => [e.path, e]));
        const parent = parentOf(path);
        const rows: RowListItem[] = parent !== null
          ? [{ id: PARENT_ENTRY_ID, label: '..', isContainer: true }, ...entries.map(toRowItem)]
          : entries.map(toRowItem);
        rowList.setItems(rows);
        setStatus(null);
      } catch (error) {
        if (disposed || generation !== loadGeneration) return;
        entriesByPath = new Map();
        rowList.setItems([]);
        setStatus(`Unable to read folder: ${String(error)}`);
      }
    };

    rowList.onActivate((item) => {
      if (item.id === PARENT_ENTRY_ID) {
        const parent = parentOf(currentPath);
        if (parent !== null) void load(parent);
        return;
      }
      const entry = entriesByPath.get(item.id);
      if (entry?.isContainer) void load(entry.path);
      // A file row activating does nothing — no execute/open left (WK-116).
    });

    refresh.addEventListener('click', () => void load(currentPath));
    void load(currentPath);
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
