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
 * That row-level visual/interaction contract IS shared on purpose: same
 * `.tree-list`/`.tree-row`/`.tree-icon` classes as the Explorer (so hover,
 * selection colour, focus ring and scrollbar styling come for free with 0
 * new CSS — .claude/rules/dockview-css.md's "hand-copy every vendor rule"
 * concern doesn't apply here, nothing new is introduced), the same
 * `IconThemeManager.resolveIcon()` (D-4 — this module still does not know
 * file extensions, it only receives `isContainer` per row), and the same
 * click/dblclick/Enter semantics (`onOpen` = preview, `onConfirm` =
 * pinned, `onEnterOpen` = preview-or-confirm, decided by the caller the
 * same way `main.ts`'s tree wiring already does for the Explorer).
 */

export interface RowListItem {
  id: string;
  label: string;
  isContainer?: boolean;
}

export class RowListController {
  private container: HTMLElement;
  private iconThemeManager: IconThemeManager;
  private listEl: HTMLElement;

  private items: RowListItem[] = [];
  private selectedId: string | null = null;
  private focusedId: string | null = null;

  private onOpenCallbacks: ((item: RowListItem) => void)[] = [];
  private onConfirmCallbacks: ((item: RowListItem) => void)[] = [];
  private onEnterOpenCallbacks: ((item: RowListItem) => void)[] = [];
  private onContextMenuCallbacks: ((item: RowListItem, x: number, y: number) => void)[] = [];
  private unsubscribeIconTheme: () => void;
  private unsubscribeColorTheme: () => void;

  constructor(container: HTMLElement, iconThemeManager: IconThemeManager) {
    this.container = container;
    this.iconThemeManager = iconThemeManager;

    this.listEl = document.createElement('div');
    // Same class the Explorer's scroll area uses — its CSS (scrollbar
    // theming, font-size, and the `:focus .tree-row.focused` ring rule) is
    // written generically against this class, not against the Explorer
    // instance, so this container gets it unmodified.
    this.listEl.className = 'tree-list';
    this.listEl.tabIndex = 0;
    this.container.appendChild(this.listEl);

    this.listEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.listEl.addEventListener('contextmenu', (e) => this.handleContextMenu(e as MouseEvent));

    this.unsubscribeIconTheme = this.iconThemeManager.onThemeChange(() => this.render());
    // Codex A22 R1 (Major): the icon THEME event alone missed Color Theme
    // switches (White/Gray/Dark) — those go through `setColorTheme()`,
    // which never fired `onThemeChange`. See `onColorThemeChange`'s own
    // comment (icontheme.ts) for why this is a separate event rather than
    // folded into the same one.
    this.unsubscribeColorTheme = this.iconThemeManager.onColorThemeChange(() => this.render());
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

  public dispose(): void {
    this.unsubscribeIconTheme();
    this.unsubscribeColorTheme();
    this.container.removeChild(this.listEl);
  }

  public onOpen(cb: (item: RowListItem) => void): () => void {
    this.onOpenCallbacks.push(cb);
    return () => { this.onOpenCallbacks = this.onOpenCallbacks.filter((c) => c !== cb); };
  }

  public onConfirm(cb: (item: RowListItem) => void): () => void {
    this.onConfirmCallbacks.push(cb);
    return () => { this.onConfirmCallbacks = this.onConfirmCallbacks.filter((c) => c !== cb); };
  }

  public onEnterOpen(cb: (item: RowListItem) => void): () => void {
    this.onEnterOpenCallbacks.push(cb);
    return () => { this.onEnterOpenCallbacks = this.onEnterOpenCallbacks.filter((c) => c !== cb); };
  }

  public onContextMenu(cb: (item: RowListItem, x: number, y: number) => void): () => void {
    this.onContextMenuCallbacks.push(cb);
    return () => { this.onContextMenuCallbacks = this.onContextMenuCallbacks.filter((c) => c !== cb); };
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

  private handleContextMenu(e: MouseEvent): void {
    const row = (e.target as HTMLElement).closest('.tree-row') as HTMLElement | null;
    const id = row?.getAttribute('data-id');
    const item = id ? this.items.find((it) => it.id === id) : undefined;
    if (!item) return;
    e.preventDefault();
    this.selectAndFocus(item.id);
    this.onContextMenuCallbacks.forEach((cb) => cb(item, e.clientX, e.clientY));
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
      if (item) this.onEnterOpenCallbacks.forEach((cb) => cb(item));
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
      const iconDesc = this.iconThemeManager.resolveIcon(item.label, Boolean(item.isContainer));
      html += `
        <div class="tree-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}"
             data-id="${escapeHtml(item.id)}"
             role="option"
             aria-selected="${isSelected}">
          ${renderIconMarkup(iconDesc)}
          <span class="tree-label">${escapeHtml(item.label)}</span>
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
        this.onOpenCallbacks.forEach((cb) => cb(item));
      });
      row.addEventListener('dblclick', () => {
        this.selectAndFocus(item.id);
        this.onConfirmCallbacks.forEach((cb) => cb(item));
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
