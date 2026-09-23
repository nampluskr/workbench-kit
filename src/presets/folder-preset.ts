import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';
import { readDirectory, getDriveTotalBytes, type HostDirectoryEntry } from '../providers/filesystem';
import { IconThemeManager } from '../core/icontheme';
import { RowListController, RowListItem, RowListColumn, RowListSortDirection } from '../core/rowlist';

export const FOLDER_KIND = 'folder';

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

type SortColumn = 'name' | 'ext' | 'size' | 'date';

// Starting pixel widths, each mutable afterward via the header's own drag
// handles (v0.3 WK-121) — dragging shifts width between the two columns on
// either side of a handle, so these four always sum to the same total.
const COLUMNS: RowListColumn[] = [
  { id: 'name', label: 'Name', width: 260 },
  { id: 'ext', label: 'Ext', width: 60 },
  { id: 'size', label: 'Size', width: 90 },
  { id: 'date', label: 'Date', width: 150 },
];

/** No extension for a dotfile like ".env" (the leading dot is not a separator) or a name with no dot at all. */
function extractExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx + 1);
}

/** Locale-aware, case-insensitive, and numeric ("file2" before "file10") — Explorer's own file-name ordering (v0.3 WK-118, user request). */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Deliberately NOT `toLocaleString()`/`Intl` — Electron (Chromium) and
 * pywebview (the OS's own WebView2/WebKit) are different browser engines
 * that can format the same instant differently depending on OS locale
 * data, which would break this app's byte-for-byte two-host parity
 * (D-25/NFR-2, `verify:dist`'s SHA-256 comparison is on OUTPUT strings a
 * test captures, not just the bundle). `Date`'s plain getters
 * (`getFullYear` etc.) are fixed ECMAScript behaviour, not locale data, so
 * a fixed English-format string built from them is deterministic across
 * both hosts (v0.3 WK-118).
 */
function formatDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function compareEntries(a: HostDirectoryEntry, b: HostDirectoryEntry, column: SortColumn, direction: RowListSortDirection): number {
  const dir = direction === 'asc' ? 1 : -1;
  let primary: number;
  switch (column) {
    case 'name':
      primary = naturalCompare(a.name, b.name);
      break;
    case 'ext':
      primary = naturalCompare(extractExt(a.name), extractExt(b.name));
      break;
    case 'size':
      primary = (a.size ?? 0) - (b.size ?? 0);
      break;
    case 'date':
      primary = a.mtimeMs - b.mtimeMs;
      break;
  }
  if (primary !== 0) return primary * dir;
  return naturalCompare(a.name, b.name) * dir;
}

/**
 * Folders always group before files regardless of sort column (user
 * request, 2026-09-23) — each group is sorted independently. A folder has
 * no meaningful Size, so sorting by Size falls back to Name for the
 * folder group only, matching Explorer's own behaviour (user decision,
 * 2026-09-23) — every other column (Name, Ext, Date) has a real value for
 * a folder and sorts normally.
 */
function sortEntries(entries: HostDirectoryEntry[], column: SortColumn, direction: RowListSortDirection): HostDirectoryEntry[] {
  const folders = entries.filter((e) => e.isContainer);
  const files = entries.filter((e) => !e.isContainer);
  const folderColumn: SortColumn = column === 'size' ? 'name' : column;
  folders.sort((a, b) => compareEntries(a, b, folderColumn, direction));
  files.sort((a, b) => compareEntries(a, b, column, direction));
  return [...folders, ...files];
}

/**
 * Recursive size of everything under `path` (v0.3 WK-125, user request) —
 * deliberately NOT computed for every folder row up front (WK-118 already
 * decided against that, same cost concern); this only runs when a folder
 * is actually marked (Space), same as Total Commander's own on-demand
 * calculation. A subfolder this can't read (permission error, race with a
 * delete) contributes 0 rather than failing the whole sum — matches this
 * file's existing "one bad entry doesn't sink the directory" stance.
 */
async function computeFolderSize(path: string): Promise<number> {
  let entries: HostDirectoryEntry[];
  try {
    entries = await readDirectory(path);
  } catch {
    return 0;
  }
  const childTotals = await Promise.all(
    entries.map((entry) => (entry.isContainer ? computeFolderSize(entry.path) : Promise.resolve(entry.size ?? 0)))
  );
  return childTotals.reduce((sum, n) => sum + n, 0);
}

/**
 * A folder tab's editor-area "file list" view (WK-113), rebuilt as a
 * self-contained one-level-at-a-time browser (WK-116): it no longer opens
 * files/folders anywhere else. A click only selects; double-click/Enter on
 * a folder row steps INTO it (re-reading that directory into the same
 * panel); a synthetic `..` row (hidden at a drive root) steps back UP the
 * same way. A file row has no activation behaviour at all.
 *
 * Details-view columns (v0.3 WK-118, out-of-plan addition, 2026-09-23 —
 * user request): Name/Ext/Size/Date, Explorer-style clickable/sortable
 * headers via `RowListController`'s `columns`/`onSortRequest`.
 *
 * Total Commander-style marking (v0.3 WK-125, user request): Space toggles
 * a row's mark (red text, `rowlist.ts`'s own concern) without moving
 * focus; a marked folder's Size is calculated on the spot
 * (`computeFolderSize`) since it's otherwise never known (WK-118). A
 * status footer below the list mirrors Total Commander's own bottom bar:
 * `<marked bytes> / <drive total bytes> in <marked>/<total> file(s),
 * <marked>/<total> dir(s)`.
 */
export function registerFolderPreset(registry: ResourceKindRegistry, deps: FolderPresetDeps): void {
  registry.register(FOLDER_KIND, (targetId) => {
    const element = document.createElement('div');
    element.className = 'preset-folder-view folder-file-list';
    const header = document.createElement('div');
    header.className = 'folder-file-list-header';
    // Windows Explorer-style address bar (v0.3 WK-117): an editable,
    // selectable text field rather than a plain label, so the full path is
    // both copyable (focus selects it all) and directly navigable (type a
    // path, Enter). Its own Refresh button is gone — the Explorer's
    // Refresh action now covers this panel too (see `refresh` below).
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'folder-file-list-path-input';
    title.spellcheck = false;
    title.value = targetId;
    header.append(title);

    const statusEl = document.createElement('div');
    statusEl.className = 'folder-file-list-status';
    statusEl.hidden = true;

    const listContainer = document.createElement('div');
    listContainer.className = 'folder-file-list-items';

    // Total Commander-style status footer (v0.3 WK-125) — same visual
    // language (border + text row) as the address bar's own separator,
    // read-only (nothing here is meant to be typed into, unlike the
    // address bar above).
    const footerEl = document.createElement('div');
    footerEl.className = 'folder-file-list-footer';

    element.append(header, statusEl, listContainer, footerEl);

    // Same row visuals as the Explorer tree (.tree-list/.tree-row/
    // .tree-icon), just flat — no expand/collapse, no root row (see
    // src/core/rowlist.ts's file-level comment for why this is a separate
    // component rather than a "no-expand" mode of TreeController).
    const rowList = new RowListController(listContainer, deps.iconTheme, COLUMNS);
    let disposed = false;
    let currentPath = targetId;
    let entriesByPath = new Map<string, HostDirectoryEntry>();
    let sortColumn: SortColumn = 'name';
    let sortDirection: RowListSortDirection = 'asc';
    /** Recursive folder sizes computed on mark (WK-125) — reset on every navigation, not carried between folders. */
    let folderSizeCache = new Map<string, number>();
    let foldersCalculating = new Set<string>();
    let driveTotalBytes = 0;

    const toRowItem = (entry: HostDirectoryEntry): RowListItem => ({
      id: entry.path,
      label: entry.name,
      isContainer: entry.isContainer,
      columns: {
        ext: entry.isContainer ? '' : extractExt(entry.name),
        size: entry.isContainer
          ? (foldersCalculating.has(entry.path)
            ? 'Calculating…'
            : (folderSizeCache.has(entry.path) ? formatSize(folderSizeCache.get(entry.path)!) : ''))
          : formatSize(entry.size),
        date: formatDate(entry.mtimeMs),
      },
    });

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

    /** Total Commander's own bottom-bar format (v0.3 WK-125, user request): `<marked>/<drive total> in <marked>/<total> file(s), <marked>/<total> dir(s)`. */
    const updateFooter = () => {
      const markedIds = rowList.getMarkedIds();
      let markedBytes = 0;
      let markedFileCount = 0;
      let markedDirCount = 0;
      let totalFileCount = 0;
      let totalDirCount = 0;
      for (const entry of entriesByPath.values()) {
        if (entry.isContainer) totalDirCount++;
        else totalFileCount++;
      }
      for (const id of markedIds) {
        const entry = entriesByPath.get(id);
        if (!entry) continue;
        if (entry.isContainer) {
          markedDirCount++;
          markedBytes += folderSizeCache.get(entry.path) ?? 0;
        } else {
          markedFileCount++;
          markedBytes += entry.size ?? 0;
        }
      }
      footerEl.textContent =
        `${formatSize(markedBytes)} / ${formatSize(driveTotalBytes)} in ` +
        `${markedFileCount} / ${totalFileCount} file(s), ${markedDirCount} / ${totalDirCount} dir(s)`;
    };

    /** Applies the current sort to already-fetched entries and re-renders — no directory re-read needed (a header click alone never touches disk). */
    const applyEntries = (entries: HostDirectoryEntry[]) => {
      const sorted = sortEntries(entries, sortColumn, sortDirection);
      entriesByPath = new Map(sorted.map((e) => [e.path, e]));
      const parent = parentOf(currentPath);
      const rows: RowListItem[] = parent !== null
        ? [{ id: PARENT_ENTRY_ID, label: '..', isContainer: true, markable: false, columns: { ext: '', size: '', date: '' } }, ...sorted.map(toRowItem)]
        : sorted.map(toRowItem);
      rowList.setItems(rows);
      rowList.setSortState(sortColumn, sortDirection);
      updateFooter();
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
      title.value = path;
      setStatus('Loading...');
      // A fresh folder starts with no known folder sizes — carrying stale
      // ones over from the PREVIOUS folder shown here would be wrong (a
      // same-named subfolder is not the same directory).
      folderSizeCache = new Map();
      foldersCalculating = new Set();
      try {
        const [entries, driveBytes] = await Promise.all([readDirectory(path), getDriveTotalBytes(path)]);
        if (disposed || generation !== loadGeneration) return;
        driveTotalBytes = driveBytes;
        applyEntries(entries);
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

    rowList.onSortRequest((columnId, direction) => {
      sortColumn = columnId as SortColumn;
      sortDirection = direction;
      applyEntries([...entriesByPath.values()]);
    });

    rowList.onMarkChange((markedIds) => {
      updateFooter();
      let needsRerender = false;
      for (const id of markedIds) {
        const entry = entriesByPath.get(id);
        if (!entry?.isContainer || folderSizeCache.has(entry.path) || foldersCalculating.has(entry.path)) continue;
        foldersCalculating.add(entry.path);
        needsRerender = true;
        const generation = loadGeneration;
        void computeFolderSize(entry.path).then((size) => {
          foldersCalculating.delete(entry.path);
          if (disposed || generation !== loadGeneration) return;
          folderSizeCache.set(entry.path, size);
          applyEntries([...entriesByPath.values()]);
        });
      }
      // Show "Calculating…" immediately for any newly marked folder —
      // the resolved value above re-renders again once known.
      if (needsRerender) applyEntries([...entriesByPath.values()]);
    });

    // Focus selects the whole path (copy with Ctrl+C, or start typing to
    // replace it) — same affordance as clicking Explorer's own address bar.
    title.addEventListener('focus', () => title.select());
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const typed = title.value.trim();
        if (typed && typed !== currentPath) void load(typed);
        title.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        title.value = currentPath;
        title.blur();
      }
    });
    // Losing focus without confirming (click elsewhere, Tab away) reverts
    // to the actual current path rather than leaving a half-typed edit on
    // screen — `load()` above already updated `currentPath`/`title.value`
    // together and synchronously before any `await`, so an Enter-triggered
    // navigation's own `.blur()` call lands here AFTER that update, not
    // before it.
    title.addEventListener('blur', () => { title.value = currentPath; });

    void load(currentPath);
    return {
      element,
      dispose: () => { disposed = true; rowList.dispose(); },
      refresh: () => void load(currentPath),
    };
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
