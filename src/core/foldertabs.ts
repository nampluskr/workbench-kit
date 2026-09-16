import { IconThemeManager } from './icontheme';
import { renderIconMarkup, escapeHtml } from './tree';

/**
 * One registered working folder (v0.3 D-1, D-3). The shell never replaces the
 * active folder in place — every `addTab` call creates a new entry, even for
 * a path that is already registered (D-3).
 */
export interface FolderTab {
  id: string;
  /** Normalized filesystem path (no trailing separator). */
  path: string;
  /**
   * Slot used to build the default display name: 1 = bare folder name,
   * N >= 2 = "folder name (N)". Assigned once at creation from the smallest
   * unused slot among tabs sharing this path (D-3); freed when the tab
   * closes so a later tab can reuse it.
   */
  numberSlot: number;
  /** User-set display alias. Overrides the default name; does not touch the path (D-4). */
  alias: string | null;
}

function normalizePath(p: string): string {
  let cleanPath = p.replace(/[/\\]+$/, '');
  if (cleanPath === '') {
    cleanPath = p.startsWith('/') ? '/' : '\\';
  } else if (/^[a-zA-Z]:$/.test(cleanPath)) {
    cleanPath = p.includes('/') ? `${cleanPath}/` : `${cleanPath}\\`;
  }
  return cleanPath;
}

function folderNameOf(path: string): string {
  const parts = normalizePath(path).split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

/**
 * Same-path grouping key for slot numbering (D-3). Windows paths that only
 * differ by separator style or drive-letter case (`C:\Work\Repo` vs.
 * `c:/Work/Repo`) name the same directory and must share one slot pool — the
 * stored `path` itself keeps its original form for display and for the
 * filesystem provider, which is untouched.
 */
function comparableKey(path: string): string {
  const slashed = normalizePath(path).split(/[/\\]/).join('/');
  // A drive letter (or a UNC \\host\share root) means this is a Windows
  // path, which is case-insensitive end to end — not just the drive letter
  // (A1 R2 Major finding: `C:\Work\Repo` vs `c:\work\repo` still got 2 slots
  // when only the drive letter was folded). A POSIX path stays case-sensitive.
  const isWindowsPath = /^[a-zA-Z]:/.test(slashed) || slashed.startsWith('//');
  return isWindowsPath ? slashed.toLowerCase() : slashed;
}

/**
 * Renders the `FOLDERS` rail and owns the folder-tab list itself (v0.3 D-1,
 * D-3, D-4). It knows nothing about the filesystem or the tree — activation
 * is reported through `onActivate` and the host (main.ts) is the one that
 * turns a path into an actual Explorer root.
 */
export class FolderTabsController {
  private tabs: FolderTab[] = [];
  private activeId: string | null = null;
  private nextSeq = 1;

  private listEl: HTMLElement;
  private addBtn: HTMLButtonElement;
  private renameBtn: HTMLButtonElement;
  private iconTheme: IconThemeManager;

  private activateCallbacks: Array<(tab: FolderTab) => void> = [];
  /** Fired when the rail has no active tab left (e.g. all tabs removed). */
  private emptyCallbacks: Array<() => void> = [];

  public onAddRequested: (() => void) | null = null;

  constructor(
    listEl: HTMLElement,
    addBtn: HTMLButtonElement,
    renameBtn: HTMLButtonElement,
    iconTheme: IconThemeManager
  ) {
    this.listEl = listEl;
    this.addBtn = addBtn;
    this.renameBtn = renameBtn;
    this.iconTheme = iconTheme;

    this.addBtn?.addEventListener('click', () => this.onAddRequested?.());
    this.render();
  }

  public onActivate(cb: (tab: FolderTab) => void): () => void {
    this.activateCallbacks.push(cb);
    return () => {
      this.activateCallbacks = this.activateCallbacks.filter((c) => c !== cb);
    };
  }

  public onEmpty(cb: () => void): () => void {
    this.emptyCallbacks.push(cb);
    return () => {
      this.emptyCallbacks = this.emptyCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Always creates a new tab, even for an already-registered path (D-3). The
   * new tab is activated immediately.
   */
  public addTab(path: string): FolderTab {
    const norm = normalizePath(path);
    const key = comparableKey(norm);
    const usedSlots = new Set(
      this.tabs.filter((t) => comparableKey(t.path) === key).map((t) => t.numberSlot)
    );
    let slot = 1;
    while (usedSlots.has(slot)) slot++;

    const tab: FolderTab = {
      id: `ft-${this.nextSeq++}`,
      path: norm,
      numberSlot: slot,
      alias: null,
    };
    this.tabs.push(tab);
    this.activateTab(tab.id);
    return tab;
  }

  /**
   * Drops one tab's registration — never touches the filesystem (D-4). The
   * hover-`×` affordance itself is Phase 2 (WK-089); this method is the data
   * operation it will call, exposed now so the freed number slot is provably
   * available to the next `addTab` for the same path (PLAN Phase 1: "탭 하나를
   * 닫으면 그 번호가 다음 탭에 다시 쓰인다").
   */
  public removeTab(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const wasActive = this.activeId === id;
    this.tabs.splice(idx, 1);

    if (wasActive) {
      const next = this.tabs[idx] ?? this.tabs[idx - 1] ?? null;
      this.activeId = next ? next.id : null;
    }
    this.render();

    if (wasActive) {
      const tab = this.getActiveTab();
      if (tab) {
        for (const cb of this.activateCallbacks) cb(tab);
      } else {
        for (const cb of this.emptyCallbacks) cb();
      }
    }
  }

  public activateTab(id: string): void {
    if (!this.tabs.some((t) => t.id === id) || this.activeId === id) {
      if (this.activeId === id) this.render();
      return;
    }
    this.activeId = id;
    this.render();
    const tab = this.getActiveTab();
    if (tab) {
      for (const cb of this.activateCallbacks) cb(tab);
    }
  }

  public getActiveTab(): FolderTab | null {
    return this.tabs.find((t) => t.id === this.activeId) || null;
  }

  public getTabs(): readonly FolderTab[] {
    return this.tabs;
  }

  /**
   * Drops the active mark without touching the tab list — for a shell action
   * (`closeFolder()`) that empties the Explorer outside the folder-tab model.
   * Without this, the tab that had been active stayed visually active while
   * pointing at an empty Explorer, and clicking it again did nothing because
   * `activateTab` treats "already active" as a no-op.
   */
  public clearActive(): void {
    if (this.activeId === null) return;
    this.activeId = null;
    this.render();
  }

  /** Re-renders after something outside the tab list changed (e.g. colour/icon theme). */
  public refresh(): void {
    this.render();
  }

  public getTabById(id: string): FolderTab | null {
    return this.tabs.find((t) => t.id === id) || null;
  }

  /** The name shown on the tab: the user alias if set, else the default `name`/`name (N)` (D-3, D-4). */
  public displayName(tab: FolderTab): string {
    if (tab.alias) return tab.alias;
    const base = folderNameOf(tab.path);
    return tab.numberSlot <= 1 ? base : `${base} (${tab.numberSlot})`;
  }

  private render(): void {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    for (const tab of this.tabs) {
      const row = document.createElement('div');
      row.className = 'foldertabs-tab' + (tab.id === this.activeId ? ' active' : '');
      row.setAttribute('role', 'tab');
      row.setAttribute('data-id', tab.id);
      row.title = tab.path;
      row.setAttribute('aria-selected', tab.id === this.activeId ? 'true' : 'false');
      row.tabIndex = 0;

      const icon = this.iconTheme.resolveIcon(folderNameOf(tab.path), true);
      row.innerHTML =
        renderIconMarkup(icon) +
        `<span class="foldertabs-tab-label">${escapeHtml(this.displayName(tab))}</span>`;

      row.addEventListener('click', () => this.activateTab(tab.id));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.activateTab(tab.id);
        }
      });

      this.listEl.appendChild(row);
    }

    if (this.renameBtn) {
      this.renameBtn.disabled = !this.getActiveTab();
    }

    this.applyIconColors();
  }

  private applyIconColors(): void {
    const icons = this.listEl.querySelectorAll<HTMLElement>('.tree-icon [data-fg], .tree-icon[data-fg]');
    icons.forEach((el) => {
      const fg = el.getAttribute('data-fg');
      if (fg) el.style.color = fg;
    });
  }
}
