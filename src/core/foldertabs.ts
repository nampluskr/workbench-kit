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
  /**
   * Set when the host could not open this tab's path (deleted/moved) —
   * v0.3 D-6. The tab stays registered; it is never auto-removed. Purely a
   * flag + message the host sets/clears — this controller never checks the
   * filesystem itself (D-9's "껍데기는 리소스 종류를 모른다").
   */
  error: string | null;
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
  /** The tab whose row currently shows the inline rename input (D-4), or none. */
  private renamingId: string | null = null;
  /** What the input showed when rename opened — used to detect "confirmed unchanged" (A2 R1 Major finding). */
  private renamingInitialValue: string | null = null;
  /**
   * The live typed value, kept outside the DOM so an incidental re-render
   * (theme change, another tab closing, a drag elsewhere) does not silently
   * erase what the user is mid-typing — only Enter/Escape are defined
   * outcomes for a rename (D-4); a render() triggered by something else is
   * not one of them (A2 R1 Minor finding).
   */
  private renamingDraftValue: string | null = null;

  private listEl: HTMLElement;
  private addBtn: HTMLButtonElement;
  private renameBtn: HTMLButtonElement;
  private iconTheme: IconThemeManager;

  private activateCallbacks: Array<(tab: FolderTab) => void> = [];
  private selectCallbacks: Array<(tab: FolderTab) => void> = [];
  /** Fired when the rail has no active tab left (e.g. all tabs removed). */
  private emptyCallbacks: Array<() => void> = [];
  private changeCallbacks: Array<() => void> = [];
  private removeCallbacks: Array<(id: string) => void> = [];

  public onAddRequested: (() => void) | null = null;
  /** Fired when the user clicks an error tab's "Locate Folder…" control (v0.3 D-6, WK-103). */
  public onRelocateRequested: ((id: string) => void) | null = null;

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
    // F2 is deliberately NOT bound here (D-4) — it stays reserved for the
    // app view, so Rename only ever starts from this header icon.
    this.renameBtn?.addEventListener('click', () => this.beginRename());
    this.render();
  }

  /** Fires only when the active tab actually CHANGES — the Explorer root only needs loading then. */
  public onActivate(cb: (tab: FolderTab) => void): () => void {
    this.activateCallbacks.push(cb);
    return () => {
      this.activateCallbacks = this.activateCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Fires on every successful `activateTab()` call, INCLUDING clicking a tab
   * that was already active — unlike `onActivate` above (v0.3 D-2, WK-095).
   * Clicking the currently-active tab while the Explorer is hidden must still
   * show it again; `onActivate` alone would miss that because nothing about
   * the active tab actually changed (A3 R1 Major finding).
   */
  public onSelect(cb: (tab: FolderTab) => void): () => void {
    this.selectCallbacks.push(cb);
    return () => {
      this.selectCallbacks = this.selectCallbacks.filter((c) => c !== cb);
    };
  }

  public onEmpty(cb: () => void): () => void {
    this.emptyCallbacks.push(cb);
    return () => {
      this.emptyCallbacks = this.emptyCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Fires after every render — i.e. after any mutation (add/remove/reorder/
   * alias/activate) — so a caller can persist the tab list without wiring a
   * separate hook per mutation kind (v0.3 D-5, WK-100/101).
   */
  public onChange(cb: () => void): () => void {
    this.changeCallbacks.push(cb);
    return () => {
      this.changeCallbacks = this.changeCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Always creates a new tab, even for an already-registered path (D-3). The
   * new tab is activated immediately.
   */
  public addTab(path: string): FolderTab {
    const norm = normalizePath(path);
    const key = comparableKey(norm);
    // Aliased tabs have already given up their slot (D-4/D-3) — they must
    // not count as "used" here, or a freed slot would never be handed out.
    const usedSlots = new Set(
      this.tabs.filter((t) => !t.alias && comparableKey(t.path) === key).map((t) => t.numberSlot)
    );
    let slot = 1;
    while (usedSlots.has(slot)) slot++;

    const tab: FolderTab = {
      id: `ft-${this.nextSeq++}`,
      path: norm,
      numberSlot: slot,
      alias: null,
      error: null,
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
    // Fire BEFORE render() — render() fires onChange, which a caller
    // (main.ts) uses to persist to localStorage. onRemove has to run first
    // so a caller can drop its own per-tab data (explorerStateByTab) before
    // that persist call, or the stale entry gets written to disk once more
    // before cleanup ever catches up (A4 R2 Critical finding: the previous
    // "fire onRemove after render()" order persisted the leak once before
    // deleting it in memory).
    for (const cb of this.removeCallbacks) cb(id);
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

  /**
   * Fires with the removed tab's id, once per `removeTab()` call. Lets a
   * caller drop any per-tab data it keyed by tab id (main.ts's
   * `explorerStateByTab`) — without this, a closed tab's saved Explorer
   * state stayed in the map forever and could leak onto an unrelated later
   * tab that reused the same freed id (A4 R1 Critical finding).
   */
  public onRemove(cb: (id: string) => void): () => void {
    this.removeCallbacks.push(cb);
    return () => {
      this.removeCallbacks = this.removeCallbacks.filter((c) => c !== cb);
    };
  }

  public activateTab(id: string): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const changed = this.activeId !== id;
    this.activeId = id;
    this.render();
    // onSelect fires every time, changed or not (e.g. clicking the already-
    // active tab still needs to re-show a hidden Explorer — A3 R1 Major
    // finding). onActivate only fires on an actual change, since it drives
    // (re)loading the Explorer root, which an unchanged active tab needs
    // done exactly zero times.
    for (const cb of this.selectCallbacks) cb(tab);
    if (changed) {
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
   * Replaces the whole tab list at once — restart restoration (v0.3 D-5,
   * WK-100/101), never a user action. Unlike `addTab`, this does NOT fire
   * `onSelect`/`onActivate`/`onChange` — the caller (main.ts) still has to
   * separately trigger the Explorer load for whichever tab was active,
   * since restoring the registration and restoring the filesystem root are
   * different things with different failure modes (a dead path is Phase 5's
   * concern, not this method's).
   */
  public restoreTabs(tabs: readonly FolderTab[], activeTabId: string | null): void {
    // `error` always starts cleared on restore, UNCONDITIONALLY (v0.3 D-6) —
    // whether each tab's path still resolves is re-checked when it is
    // actually activated, not assumed from whatever it was last session.
    // `t.error ?? null` used to run here instead, which only replaced
    // undefined/null — a genuinely broken path from a PRIOR session stayed
    // marked broken even after the path came back, and conversely a tab
    // that broke while the app was closed showed no error until clicked
    // (A5 R1 Major finding: comment claimed "starts cleared", code did not).
    this.tabs = tabs.map((t) => ({ ...t, error: null }));
    const usedSeqs = this.tabs
      .map((t) => /^ft-(\d+)$/.exec(t.id))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => parseInt(m[1], 10));
    this.nextSeq = usedSeqs.length > 0 ? Math.max(...usedSeqs) + 1 : 1;
    this.activeId = activeTabId && this.tabs.some((t) => t.id === activeTabId) ? activeTabId : null;
    this.render();
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

  /**
   * Sets or clears a tab's display alias (D-4). A non-empty alias makes the
   * tab give up its `(N)` slot immediately, freeing it for the next same-path
   * tab; clearing the alias re-acquires the smallest slot free at that
   * moment, which may differ from the one it had before (D-3's explicitly
   * rejected alternative was "keep the old slot reserved").
   */
  public setAlias(id: string, alias: string | null): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const trimmed = alias?.trim() || null;
    if (trimmed) {
      tab.alias = trimmed;
    } else {
      tab.alias = null;
      const key = comparableKey(tab.path);
      const usedSlots = new Set(
        this.tabs
          .filter((t) => t.id !== tab.id && !t.alias && comparableKey(t.path) === key)
          .map((t) => t.numberSlot)
      );
      let slot = 1;
      while (usedSlots.has(slot)) slot++;
      tab.numberSlot = slot;
    }
    this.render();
  }

  /**
   * Marks or clears a tab's error state (v0.3 D-6). The host (main.ts) calls
   * this after trying to open the tab's path — a null message clears it.
   * Never removes the tab; an error tab stays registered until the user
   * closes it or re-points it (`setTabPath`).
   */
  public setTabError(id: string, message: string | null): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || tab.error === message) return;
    tab.error = message;
    this.render();
  }

  /**
   * Re-points an existing (typically error-state) tab at a different path
   * without closing and re-adding it (v0.3 D-6, WK-103) — the tab id,
   * alias, and position in the rail are all preserved; only the path and
   * its number-slot pool membership change. Clears any error state, since
   * the host is expected to immediately retry activation after this.
   */
  public setTabPath(id: string, newPath: string): FolderTab | null {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return null;
    const norm = normalizePath(newPath);
    const key = comparableKey(norm);
    const usedSlots = new Set(
      this.tabs
        .filter((t) => t.id !== tab.id && !t.alias && comparableKey(t.path) === key)
        .map((t) => t.numberSlot)
    );
    let slot = 1;
    while (usedSlots.has(slot)) slot++;
    tab.path = norm;
    tab.numberSlot = slot;
    tab.error = null;
    this.render();
    return tab;
  }

  /** Opens the inline rename row for a tab (default: the active one). Disabled with 0 active tab (D-4). */
  public beginRename(id?: string): void {
    const targetId = id ?? this.getActiveTab()?.id ?? null;
    if (!targetId || !this.tabs.some((t) => t.id === targetId)) return;
    this.renamingId = targetId;
    this.renamingInitialValue = this.displayName(this.tabs.find((t) => t.id === targetId)!);
    this.renamingDraftValue = null;
    this.render();
  }

  private commitRename(id: string, value: string): void {
    this.renamingId = null;
    const initial = this.renamingInitialValue;
    this.renamingInitialValue = null;
    this.renamingDraftValue = null;
    // Confirming the prefilled value unchanged (e.g. pressing Enter without
    // typing anything) must not turn an auto "(N)" name into a sticky alias
    // — that alias would release its slot, and the next same-path tab could
    // then take the freed number and show the SAME text (A2 R1 Major
    // finding). Treat "unchanged" as a plain close, not a new alias.
    if (value.trim() === initial) {
      this.render();
      return;
    }
    this.setAlias(id, value);
  }

  private cancelRename(): void {
    this.renamingId = null;
    this.renamingInitialValue = null;
    this.renamingDraftValue = null;
    this.render();
  }

  /**
   * Reorders by vertical drag (D-4). `targetIndex` is "insert before this
   * index", in the PRE-removal array — the same index space
   * `updateDropIndicator` computes while dragging. Removing the dragged tab
   * first shifts every later index down by 1, so that shift is corrected
   * here before inserting, not left for the caller to get right.
   */
  private reorderTab(draggedId: string, targetIndex: number): void {
    const fromIndex = this.tabs.findIndex((t) => t.id === draggedId);
    if (fromIndex === -1) return;
    let insertAt = targetIndex;
    if (fromIndex < insertAt) insertAt -= 1;
    const [tab] = this.tabs.splice(fromIndex, 1);
    insertAt = Math.max(0, Math.min(insertAt, this.tabs.length));
    this.tabs.splice(insertAt, 0, tab);
    this.render();
  }

  private dropTargetIndex: number | null = null;

  /**
   * Vertical drag reorder (D-4). Only begins an actual drag once the pointer
   * has moved a few pixels, so a plain click still activates the tab as
   * normal — the browser's own `click` event only fires when pointerdown and
   * pointerup land on the same element, so a real drag never also triggers
   * an unwanted activation on drop.
   */
  private beginDrag(tab: FolderTab, e: PointerEvent, row: HTMLElement): void {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    let dragging = false;
    let captured = false;

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      this.listEl.classList.remove('dragging');
      this.clearDropIndicators();
      this.dropTargetIndex = null;
      if (captured) {
        try {
          row.releasePointerCapture(pointerId);
        } catch {
          // already released (e.g. the row was removed) — nothing to undo
        }
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) {
        dragging = true;
        this.listEl.classList.add('dragging');
        // Pointer capture keeps every subsequent move/up routed to this
        // drag even if the cursor leaves the row or the window — without it
        // a pointerup over an unrelated element (or outside the window
        // entirely) could still land here from a stale prior drag (A2 R1
        // Major finding: "drops anywhere in the window").
        try {
          row.setPointerCapture(pointerId);
          captured = true;
        } catch {
          // capture unavailable — the pointerId guard above still filters events
        }
      }
      if (!dragging) return;
      this.updateDropIndicator(ev.clientX, ev.clientY, tab.id);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const shouldCommit = dragging && this.dropTargetIndex !== null;
      const targetIndex = this.dropTargetIndex;
      cleanup();
      if (shouldCommit && targetIndex !== null) {
        this.reorderTab(tab.id, targetIndex);
      }
    };
    // A cancelled pointer (touch scroll took over, capture was lost, …)
    // must discard the drag WITHOUT reordering — only pointerup commits
    // (A2 R1 Major finding: an uncleared pointercancel left the rail armed
    // for a later, unrelated pointerup to commit a stale drop target).
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  private clearDropIndicators(): void {
    Array.from(this.listEl.children).forEach((el) => {
      el.classList.remove('drop-before', 'drop-after');
    });
  }

  /**
   * Shows where the dragged tab would land and records that index for drop.
   * A pointer outside the rail's own box clears the indicator and the drop
   * target — dropping over the Explorer or the editor must not reorder
   * anything (A2 R1 Major finding).
   */
  private updateDropIndicator(clientX: number, clientY: number, draggedId: string): void {
    this.clearDropIndicators();
    const railRect = this.listEl.getBoundingClientRect();
    if (clientX < railRect.left || clientX > railRect.right || clientY < railRect.top || clientY > railRect.bottom) {
      this.dropTargetIndex = null;
      return;
    }

    const rows = Array.from(this.listEl.children) as HTMLElement[];
    for (const row of rows) {
      if (row.getAttribute('data-id') === draggedId) continue;
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        row.classList.add('drop-before');
        this.dropTargetIndex = this.tabs.findIndex((t) => t.id === row.getAttribute('data-id'));
        return;
      }
    }
    // Below every other row — insert at the end ("before" the one-past-last
    // position, same pre-removal index space `reorderTab` expects).
    this.dropTargetIndex = this.tabs.length;
    const lastRow = rows[rows.length - 1];
    if (lastRow && lastRow.getAttribute('data-id') !== draggedId) {
      lastRow.classList.add('drop-after');
    }
  }

  private render(): void {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    for (const tab of this.tabs) {
      const row = document.createElement('div');
      row.className =
        'foldertabs-tab' + (tab.id === this.activeId ? ' active' : '') + (tab.error ? ' error' : '');
      row.setAttribute('role', 'tab');
      row.setAttribute('data-id', tab.id);
      // The error message replaces the path in the tooltip — it already
      // names the path and says what's wrong with it (v0.3 D-6).
      row.title = tab.error ? tab.error : tab.path;
      if (tab.error) row.setAttribute('aria-invalid', 'true');
      row.setAttribute('aria-selected', tab.id === this.activeId ? 'true' : 'false');
      row.tabIndex = 0;

      // An error tab shows a warning glyph instead of the (possibly
      // misleading) resolved folder icon — the path may no longer exist,
      // so nothing about "what kind of folder is this" is knowable (v0.3 D-6).
      const iconMarkup = tab.error
        ? '<span class="tree-icon"><i class="codicon codicon-warning"></i></span>'
        : renderIconMarkup(this.iconTheme.resolveIcon(folderNameOf(tab.path), true));

      if (tab.id === this.renamingId) {
        row.classList.add('renaming');
        row.innerHTML = iconMarkup;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'foldertabs-tab-rename-input';
        // A re-render an incidental cause triggered (theme change, another
        // tab closing, …) restores the DRAFT the user was typing, not the
        // original prefill — see renamingDraftValue's doc comment.
        input.value = this.renamingDraftValue ?? this.displayName(tab);
        input.setAttribute('aria-label', `Rename ${this.displayName(tab)}`);
        input.addEventListener('input', () => {
          this.renamingDraftValue = input.value;
        });
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.commitRename(tab.id, input.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelRename();
          }
        });
        row.appendChild(input);

        // The close (×) control stays reachable even while renaming (D-4's
        // "hover 시 ×를 보이고" has no exception for this state — A2 R1
        // Minor finding). Drag stays off: starting a row-level drag from
        // inside a focused text input almost always means the user meant to
        // select/move the caret, not reorder tabs.
        const closeBtnRenaming = document.createElement('button');
        closeBtnRenaming.type = 'button';
        closeBtnRenaming.className = 'foldertabs-tab-close';
        closeBtnRenaming.title = 'Close';
        closeBtnRenaming.setAttribute('aria-label', `Close ${this.displayName(tab)}`);
        closeBtnRenaming.innerHTML = '<i class="codicon codicon-close"></i>';
        closeBtnRenaming.addEventListener('pointerdown', (e) => e.stopPropagation());
        // Without this, Enter/Space on the focused × bubbles to the row's own
        // keydown handler and ACTIVATES the tab instead of closing it — the
        // button's native click still fires (stopPropagation only blocks
        // bubbling, not the target's own default action) (A2 R2 Major finding).
        closeBtnRenaming.addEventListener('keydown', (e) => e.stopPropagation());
        closeBtnRenaming.addEventListener('click', (e) => {
          e.stopPropagation();
          this.renamingId = null;
          this.renamingInitialValue = null;
          this.renamingDraftValue = null;
          this.removeTab(tab.id);
        });
        row.appendChild(closeBtnRenaming);

        this.listEl.appendChild(row);
        // Focus after it is actually in the document (v0.2 FR-X-style
        // pattern already used elsewhere for inline input rows). Restoring a
        // draft does not fight the user for the caret since it only happens
        // on a re-render they didn't type into just now.
        requestAnimationFrame(() => {
          input.focus();
          if (this.renamingDraftValue === null) input.select();
        });
        continue;
      }

      // An error tab gets a "locate…" control to re-point it at a new path
      // (v0.3 D-6, WK-103) — always visible on that row, not just on hover
      // like ×, since it is the tab's whole reason for needing attention.
      const relocateButtonHtml = tab.error
        ? `<button type="button" class="foldertabs-tab-relocate" title="Locate Folder…" aria-label="Locate Folder for ${escapeHtml(this.displayName(tab))}"><i class="codicon codicon-search"></i></button>`
        : '';
      row.innerHTML =
        iconMarkup +
        `<span class="foldertabs-tab-label">${escapeHtml(this.displayName(tab))}</span>` +
        relocateButtonHtml +
        `<button type="button" class="foldertabs-tab-close" title="Close" aria-label="Close ${escapeHtml(this.displayName(tab))}"><i class="codicon codicon-close"></i></button>`;

      row.addEventListener('click', () => {
        // A click on a different tab while another is mid-rename cancels
        // that rename first (D-4 only defines Enter/Escape as outcomes —
        // this is the 3rd way a rename ends, by moving away from it).
        if (this.renamingId && this.renamingId !== tab.id) this.cancelRename();
        this.activateTab(tab.id);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.activateTab(tab.id);
        }
      });

      const relocateBtn = row.querySelector<HTMLButtonElement>('.foldertabs-tab-relocate');
      relocateBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onRelocateRequested?.(tab.id);
      });
      relocateBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
      relocateBtn?.addEventListener('keydown', (e) => e.stopPropagation());

      const closeBtn = row.querySelector<HTMLButtonElement>('.foldertabs-tab-close');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeTab(tab.id);
      });
      closeBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
      // Same fix as the renaming-row close button above (A2 R2 Major finding).
      closeBtn?.addEventListener('keydown', (e) => e.stopPropagation());

      row.addEventListener('pointerdown', (e) => this.beginDrag(tab, e, row));

      this.listEl.appendChild(row);
    }

    if (this.renameBtn) {
      this.renameBtn.disabled = !this.getActiveTab();
    }

    this.applyIconColors();
    for (const cb of this.changeCallbacks) cb();
  }

  private applyIconColors(): void {
    const icons = this.listEl.querySelectorAll<HTMLElement>('.tree-icon [data-fg], .tree-icon[data-fg]');
    icons.forEach((el) => {
      const fg = el.getAttribute('data-fg');
      if (fg) el.style.color = fg;
    });
  }
}
