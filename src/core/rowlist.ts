import { IconThemeManager } from './icontheme';
import { renderIconMarkup, escapeHtml } from './tree';

/**
 * A single, flat, non-recursive collection of selectable rows (folder
 * "file list" view, WK-113 — user request, 2026-09-21). Deliberately NOT
 * `TreeController`: that component's contract is a recursive, expandable
 * tree with a visible root row, which is exactly the shape this view must
 * NOT have (a folder tab shows only the immediate contents of one folder,
 * no nested expand/collapse, no root row). Re-purposing `TreeController`
 * for this would mean bolting a "hide root, disable expand" mode onto a
 * component the Explorer itself depends on and has been adversarially
 * hardened around (A4, A9, A14) — a real regression risk for no shared
 * benefit, since the two shapes only overlap in the single-row visuals.
 *
 * That row-level visual contract IS shared on purpose: same
 * `.tree-list`/`.tree-row`/`.tree-icon` classes as the Explorer (so hover,
 * selection colour, focus ring and scrollbar styling come for free with 0
 * new CSS), and the same `IconThemeManager.resolveIcon()` (D-4 — this
 * module still does not know file extensions, it only receives
 * `isContainer` per row).
 *
 * Interaction is deliberately its OWN, narrower contract (WK-116), not the
 * Explorer tree's open-elsewhere rules: a click only selects, and
 * dblclick/Enter both fire one `onActivate` — this view has no concept of
 * "open a file viewer/editor", only "select a row" and "activate a row"
 * (the caller, `folder-preset.ts`, decides what activating a row means).
 * No right-click menu — a folder's own actions live on the folder tab rail
 * now, a file's on the Explorer (WK-114/WK-115).
 *
 * Details-view columns (v0.3 WK-118, out-of-plan addition, 2026-09-23 —
 * user request): a clickable header row per column, Explorer-style
 * click-once/click-again sort direction toggling. This component only
 * renders whatever `columns` text each item already carries and reports
 * which column/direction the user asked for via `onSortRequest` — it does
 * not know what "Size" or "Date" mean, or how to compare them (natural
 * sort, numeric size, folders-vs-files grouping): sorting the actual
 * `items` array is `folder-preset.ts`'s job, using the raw
 * `HostDirectoryEntry` values it still has, not these pre-formatted
 * display strings (a formatted date string does not sort correctly as
 * text). This component only ever reorders what it is handed.
 */

export interface RowListColumn {
  id: string;
  label: string;
  /** Starting width in pixels — mutable after that, via the header's own drag handles (v0.3 WK-121). */
  width: number;
}

export type RowListSortDirection = 'asc' | 'desc';

export interface RowListItem {
  id: string;
  label: string;
  isContainer?: boolean;
  /** Pre-formatted display text for every column after the first (Name), keyed by column id. */
  columns?: Record<string, string>;
  /** `false` excludes this row from Space-bar marking (v0.3 WK-125) — the caller's synthetic `..` row, say. Defaults to `true`. */
  markable?: boolean;
}

export class RowListController {
  private container: HTMLElement;
  private iconThemeManager: IconThemeManager;
  private headerEl: HTMLElement;
  private listEl: HTMLElement;
  private columns: RowListColumn[];
  /** Live per-column pixel widths, mutable via drag (v0.3 WK-121) — starts as each column's own `width`. */
  private columnWidths: number[];

  private items: RowListItem[] = [];
  private selectedId: string | null = null;
  private focusedId: string | null = null;
  private sortColumn: string;
  private sortDirection: RowListSortDirection = 'asc';
  /**
   * Total Commander-style marks (v0.3 WK-125, user request) — deliberately
   * NOT the same thing as `selectedId`/`focusedId` above. Space toggles a
   * row's membership here WITHOUT moving focus; multiple rows can be
   * marked at once, shown via a distinct style (red text, not the
   * focus/selection background). The caller (`folder-preset.ts`) reads
   * this set to total up marked size/count for its own status footer.
   */
  private markedIds: Set<string> = new Set();

  /** Fires on dblclick and on Enter alike — the caller decides what "activating" a row means. */
  private onActivateCallbacks: ((item: RowListItem) => void)[] = [];
  /** Fires when a header is clicked — the caller re-sorts `items` and calls `setItems()`/`setSortState()` back. */
  private onSortRequestCallbacks: ((columnId: string, direction: RowListSortDirection) => void)[] = [];
  /** Fires whenever Space toggles a mark — the caller re-derives whatever depends on the marked set (v0.3 WK-125). */
  private onMarkChangeCallbacks: ((markedIds: ReadonlySet<string>) => void)[] = [];
  private unsubscribeIconTheme: () => void;
  private unsubscribeColorTheme: () => void;

  constructor(container: HTMLElement, iconThemeManager: IconThemeManager, columns: RowListColumn[]) {
    this.container = container;
    this.iconThemeManager = iconThemeManager;
    this.columns = columns;
    this.columnWidths = columns.map((c) => c.width);
    this.sortColumn = columns[0]?.id ?? 'name';

    this.container.classList.add('rowlist-container');
    this.updateGridTemplate();

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'rowlist-header';
    this.container.appendChild(this.headerEl);

    this.listEl = document.createElement('div');
    // Same class the Explorer's scroll area uses — its CSS (scrollbar
    // theming, font-size, and the `:focus .tree-row.focused` ring rule) is
    // written generically against this class, not against the Explorer
    // instance, so this container gets it unmodified.
    this.listEl.className = 'tree-list';
    this.listEl.tabIndex = 0;
    this.container.appendChild(this.listEl);

    this.listEl.addEventListener('keydown', (e) => this.handleKeyDown(e));

    this.unsubscribeIconTheme = this.iconThemeManager.onThemeChange(() => this.render());
    // Codex A22 R1 (Major): the icon THEME event alone missed Color Theme
    // switches (White/Gray/Dark) — those go through `setColorTheme()`,
    // which never fired `onThemeChange`. See `onColorThemeChange`'s own
    // comment (icontheme.ts) for why this is a separate event rather than
    // folded into the same one.
    this.unsubscribeColorTheme = this.iconThemeManager.onColorThemeChange(() => this.render());
    this.renderHeader();
    this.render();
  }

  public setItems(items: RowListItem[]): void {
    this.items = items;
    if (this.focusedId && !items.some((it) => it.id === this.focusedId)) {
      this.focusedId = null;
    }
    if (this.selectedId && !items.some((it) => it.id === this.selectedId)) {
      this.selectedId = null;
    }
    // Marks survive a re-sort (same ids, just reordered — every id is
    // still present) but not an actual navigation to a different folder
    // (entirely different ids) — filtering, not clearing, handles both
    // correctly without `folder-preset.ts` having to tell this apart.
    const stillPresent = new Set(items.map((it) => it.id));
    for (const id of this.markedIds) {
      if (!stillPresent.has(id)) this.markedIds.delete(id);
    }
    // Parity with `TreeController.setRoot()`, which always leaves a node
    // focused: without this, Tab-ing into a freshly loaded list and
    // pressing an arrow key/Enter does nothing until the user clicks a row
    // first (Codex A22 R1, Major — folded into this fix rather than the
    // full ARIA-listbox rework the finding also raised, since the
    // Explorer tree itself has neither `role="listbox"` nor
    // `aria-activedescendant` — matching its accepted pattern is this
    // view's actual goal here, not exceeding it).
    if (!this.focusedId && items.length > 0) {
      this.focusedId = items[0].id;
    }
    this.render();
  }

  public getItems(): RowListItem[] {
    return this.items;
  }

  /** The caller tells this view which column/direction the just-applied `setItems()` order reflects, so the header arrow matches (v0.3 WK-118). */
  public setSortState(columnId: string, direction: RowListSortDirection): void {
    this.sortColumn = columnId;
    this.sortDirection = direction;
    this.renderHeader();
  }

  public dispose(): void {
    this.unsubscribeIconTheme();
    this.unsubscribeColorTheme();
    this.container.classList.remove('rowlist-container');
    this.container.removeChild(this.headerEl);
    this.container.removeChild(this.listEl);
  }

  public onActivate(cb: (item: RowListItem) => void): () => void {
    this.onActivateCallbacks.push(cb);
    return () => { this.onActivateCallbacks = this.onActivateCallbacks.filter((c) => c !== cb); };
  }

  public onSortRequest(cb: (columnId: string, direction: RowListSortDirection) => void): () => void {
    this.onSortRequestCallbacks.push(cb);
    return () => { this.onSortRequestCallbacks = this.onSortRequestCallbacks.filter((c) => c !== cb); };
  }

  public onMarkChange(cb: (markedIds: ReadonlySet<string>) => void): () => void {
    this.onMarkChangeCallbacks.push(cb);
    return () => { this.onMarkChangeCallbacks = this.onMarkChangeCallbacks.filter((c) => c !== cb); };
  }

  public getMarkedIds(): ReadonlySet<string> {
    return this.markedIds;
  }

  /**
   * A9-equivalent finding (Codex A22 R1, Major): the Explorer tree's own
   * row click focuses the tree itself before doing anything else
   * (`tree.ts`'s `focusTree()`), so the arrow keys/Enter that follow a
   * click land on this row. Without the same call here, a click would
   * select a row but leave keyboard focus wherever it happened to be.
   */
  private selectAndFocus(id: string): void {
    this.selectedId = id;
    this.focusedId = id;
    this.render();
    this.listEl.focus();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.items.length === 0) return;
    const curIdx = this.focusedId ? this.items.findIndex((it) => it.id === this.focusedId) : -1;

    if (e.key === 'ArrowDown' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const nextIdx = curIdx < 0 ? 0 : Math.min(curIdx + 1, this.items.length - 1);
      this.focusIndex(nextIdx);
      return;
    }
    if (e.key === 'ArrowUp' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const prevIdx = curIdx < 0 ? this.items.length - 1 : Math.max(curIdx - 1, 0);
      this.focusIndex(prevIdx);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      this.focusIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      this.focusIndex(this.items.length - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const item = curIdx >= 0 ? this.items[curIdx] : undefined;
      if (item) this.onActivateCallbacks.forEach((cb) => cb(item));
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      const item = curIdx >= 0 ? this.items[curIdx] : undefined;
      // Toggles the mark WITHOUT moving focus (Total Commander's own Space
      // behaviour, confirmed 2026-09-23 — Insert is the "toggle and move
      // on" key; this view doesn't bind Insert, only Space, since that's
      // all the user asked for).
      if (item && item.markable !== false) {
        if (this.markedIds.has(item.id)) this.markedIds.delete(item.id);
        else this.markedIds.add(item.id);
        this.render();
        this.onMarkChangeCallbacks.forEach((cb) => cb(this.markedIds));
      }
    }
  }

  private focusIndex(index: number): void {
    const item = this.items[index];
    if (!item) return;
    this.selectAndFocus(item.id);
    this.scrollItemIntoView(item.id);
  }

  private scrollItemIntoView(id: string): void {
    const rowEl = this.listEl.querySelector(`.tree-row[data-id="${cssEscape(id)}"]`) as HTMLElement | null;
    rowEl?.scrollIntoView({ block: 'nearest' });
  }

  /** Sets `--rowlist-grid` once via the DOM API (not baked into an HTML template string — .claude/rules/dockview-css.md's "no literal `style=` in rendered HTML" applies to this file too) as a CSS custom property every column cell inherits, the same pattern `foldertabs.ts` already uses for its tab accent colour. */
  private updateGridTemplate(): void {
    this.container.style.setProperty('--rowlist-grid', this.columnWidths.map((w) => `${w}px`).join(' '));
  }

  private renderHeader(): void {
    this.headerEl.innerHTML = '';
    this.columns.forEach((col, index) => {
      const cell = document.createElement('div');
      cell.className = 'rowlist-header-cell';
      cell.setAttribute('role', 'columnheader');
      cell.tabIndex = 0;

      const label = document.createElement('span');
      label.textContent = col.label;
      cell.appendChild(label);

      if (col.id === this.sortColumn) {
        const arrow = document.createElement('i');
        arrow.className = `codicon ${this.sortDirection === 'asc' ? 'codicon-chevron-up' : 'codicon-chevron-down'} rowlist-sort-arrow`;
        cell.appendChild(arrow);
      }

      const activate = () => {
        // Same column clicked again toggles direction (Explorer's own
        // click-once/click-again rule); a different column starts fresh
        // at ascending.
        const direction: RowListSortDirection =
          col.id === this.sortColumn && this.sortDirection === 'asc' ? 'desc' : 'asc';
        this.onSortRequestCallbacks.forEach((cb) => cb(col.id, direction));
      };
      cell.addEventListener('click', activate);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      // A drag handle on the right edge of every column but the last
      // (v0.3 WK-121, user request) — dragging resizes THIS column only,
      // same as Explorer's own Details-view header.
      if (index < this.columns.length - 1) {
        const handle = document.createElement('div');
        handle.className = 'rowlist-resize-handle';
        // A click landing on the handle (drag or not) must never reach the
        // cell's own `activate` (sort) click listener above.
        handle.addEventListener('click', (e) => e.stopPropagation());
        handle.addEventListener('pointerdown', (e) => this.beginColumnResize(index, e));
        cell.appendChild(handle);
      }

      this.headerEl.appendChild(cell);
    });
  }

  private static readonly MIN_COLUMN_WIDTH = 40;

  /**
   * Dragging the handle between column `colIndex` and the next one shifts
   * width between exactly that pair, holding their COMBINED width fixed —
   * deliberately not "grow the whole grid past the container", which would
   * need the header and the scrollable row list below to scroll in sync
   * (a data-grid feature this simple panel does not have). Widening one
   * column narrows its neighbour by the same amount, clamped so neither
   * goes below `MIN_COLUMN_WIDTH` (v0.3 WK-121, user request).
   */
  private beginColumnResize(colIndex: number, e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startWidth = this.columnWidths[colIndex];
    const pairTotal = startWidth + this.columnWidths[colIndex + 1];
    const pointerId = e.pointerId;
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // capture unavailable — the pointerId guard below still filters events
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const min = RowListController.MIN_COLUMN_WIDTH;
      const next = Math.max(min, Math.min(startWidth + (ev.clientX - startX), pairTotal - min));
      this.columnWidths[colIndex] = next;
      this.columnWidths[colIndex + 1] = pairTotal - next;
      this.updateGridTemplate();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // already released
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  public render(): void {
    if (this.items.length === 0) {
      this.listEl.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'folder-file-list-empty';
      empty.textContent = 'This folder is empty.';
      this.listEl.appendChild(empty);
      return;
    }

    let html = '';
    for (const item of this.items) {
      const isSelected = item.id === this.selectedId;
      const isFocused = item.id === this.focusedId;
      const isMarked = this.markedIds.has(item.id);
      // Icon resolution always uses the raw name (e.g. a special-named
      // folder like "node_modules" or ".git" keys an icon theme's own
      // lookup) — the `[brackets]` below are a display-only convention for
      // a container row (v0.3 WK-119, user request, 2026-09-23), including
      // the synthetic `..` row, which is a container too.
      const iconDesc = this.iconThemeManager.resolveIcon(item.label, Boolean(item.isContainer));
      const displayLabel = item.isContainer ? `[${item.label}]` : item.label;
      let cellsHtml = `
          <span class="rowlist-cell rowlist-cell-name">
            ${renderIconMarkup(iconDesc)}
            <span class="tree-label">${escapeHtml(displayLabel)}</span>
          </span>
      `;
      for (const col of this.columns.slice(1)) {
        cellsHtml += `<span class="rowlist-cell">${escapeHtml(item.columns?.[col.id] ?? '')}</span>`;
      }
      html += `
        <div class="tree-row rowlist-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${isMarked ? 'marked' : ''}"
             data-id="${escapeHtml(item.id)}"
             role="option"
             aria-selected="${isSelected}">
          ${cellsHtml}
        </div>
      `;
    }
    this.listEl.innerHTML = html;
    this.applyIconColors();

    const rows = this.listEl.querySelectorAll<HTMLElement>('.tree-row[data-id]');
    rows.forEach((row) => {
      const id = row.getAttribute('data-id');
      const item = id ? this.items.find((it) => it.id === id) : undefined;
      if (!item) return;
      row.addEventListener('click', () => {
        this.selectAndFocus(item.id);
      });
      row.addEventListener('dblclick', () => {
        this.selectAndFocus(item.id);
        this.onActivateCallbacks.forEach((cb) => cb(item));
      });
    });
  }

  /**
   * Same CSP-driven pattern as `TreeController`'s private method of the
   * same name (.claude/rules/monaco-colors.md's sibling concern for
   * per-icon colour, v0.2 FR-X10): the colour rides in on a `data-fg`
   * attribute and is painted through the CSSOM after render rather than
   * via an inline `style="color:"` string, because that attribute path is
   * the one this app's CSP allows (D-20). Kept as its own small copy
   * rather than exporting `TreeController`'s private method, so this file
   * has no coupling to the Explorer beyond the two free functions it
   * already imports.
   */
  private applyIconColors(): void {
    const icons = this.listEl.querySelectorAll<HTMLElement>('.tree-icon [data-fg], .tree-icon[data-fg]');
    icons.forEach((el) => {
      const fg = el.getAttribute('data-fg');
      if (fg) el.style.color = fg;
    });
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
