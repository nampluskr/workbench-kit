/**
 * The app-wide file-extension filter (user request, 2026-09-23 — D-12):
 * one global setting, like the colour/icon theme, that both the Explorer
 * tree and every folder file-list tab read. Lives outside src/core/ because
 * it knows what a file extension is — the shell must not (D-4, NFR-1).
 *
 * - `include`: `null` means every extension (`*.*`); otherwise only files
 *   whose extension is listed are shown.
 * - `exclude`: extensions to hide; wins over `include`.
 * - Extensions are stored lower-case without a dot. `''` stands for "no
 *   extension" (`README`, `.env`).
 * - Folders are never filtered — callers only ask about files.
 */

export interface ExtensionFilter {
  include: string[] | null;
  exclude: string[];
}

const STORAGE_KEY = 'workbench:file-filter';

/** No extension for a dotfile like ".env" (the leading dot is not a separator) or a name with no dot at all. */
export function extractExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx + 1);
}

/** `md, *.ts; .py  json` -> `['md', 'ts', 'py', 'json']` — any separator, optional `*.` / `.` prefix, lower-cased, de-duplicated. */
export function parseExtensionList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const ext = raw.trim().replace(/^\*?\./, '').replace(/^\*$/, '').toLowerCase();
    if (ext && !out.includes(ext)) out.push(ext);
  }
  return out;
}

function normalizeList(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const ext = raw.trim().replace(/^\*?\./, '').toLowerCase();
    if (!out.includes(ext)) out.push(ext);
  }
  return out;
}

let state: ExtensionFilter = { include: null, exclude: [] };
const listeners = new Set<(filter: ExtensionFilter) => void>();
/** Extensions seen while listing folders this session — the filter panel's checklist candidates. */
const seen = new Set<string>();

function load(): void {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ExtensionFilter>;
    state = {
      include: Array.isArray(parsed.include) ? normalizeList(parsed.include.map(String)) : null,
      exclude: Array.isArray(parsed.exclude) ? normalizeList(parsed.exclude.map(String)) : [],
    };
  } catch {
    // Ignore unreadable storage — fall back to "no filter".
  }
}

function save(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage errors (quota, disabled storage, ...).
  }
}

function commit(next: ExtensionFilter): void {
  state = next;
  save();
  const snapshot = getFilter();
  listeners.forEach((cb) => cb(snapshot));
}

load();

export function getFilter(): ExtensionFilter {
  return { include: state.include ? [...state.include] : null, exclude: [...state.exclude] };
}

/** `null` shows every extension again. */
export function setInclude(list: readonly string[] | null): void {
  commit({ include: list === null ? null : normalizeList(list), exclude: state.exclude });
}

export function setExclude(list: readonly string[]): void {
  commit({ include: state.include, exclude: normalizeList(list) });
}

/** Include and Exclude in one change — the File Filter popup's Apply (D-12). */
export function setFilter(next: ExtensionFilter): void {
  commit({ include: next.include === null ? null : normalizeList(next.include), exclude: normalizeList(next.exclude) });
}

export function clearFilter(): void {
  commit({ include: null, exclude: [] });
}

export function isFilterActive(): boolean {
  return state.include !== null || state.exclude.length > 0;
}

/** Whether a FILE with this name is shown. Folders never go through this. */
export function matchesFile(name: string): boolean {
  const ext = extractExt(name).toLowerCase();
  if (state.exclude.includes(ext)) return false;
  return state.include === null || state.include.includes(ext);
}

export function onFilterChange(cb: (filter: ExtensionFilter) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Called with every FILE name a listing read, before filtering. */
export function reportSeenExtensions(fileNames: Iterable<string>): void {
  for (const name of fileNames) seen.add(extractExt(name).toLowerCase());
}

/** Seen extensions plus whatever the filter currently names, sorted with "no extension" last. */
export function getKnownExtensions(): string[] {
  const all = new Set<string>([...seen, ...(state.include ?? []), ...state.exclude]);
  return [...all].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
}

/** `*.*` / `md, ts` / `none` — for menu rows and the Activity Bar tooltip. */
export function describeExtensions(list: readonly string[] | null, emptyText: string): string {
  if (list === null) return '*.*';
  if (list.length === 0) return emptyText;
  return list.map((ext) => (ext === '' ? '(no extension)' : ext)).join(', ');
}

/** Test-support only: forget extensions seen so far. */
export function resetSeenExtensionsForTest(): void {
  seen.clear();
}
