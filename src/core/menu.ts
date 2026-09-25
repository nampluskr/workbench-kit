import { closeWindow } from './window';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  /** `submenu` rows open a list supplied by `setSubmenuProvider` when shown. */
  type?: 'normal' | 'separator' | 'submenu';
  action?: () => void;
}

/**
 * One row of a submenu. Rows are asked for each time the submenu is drawn, so
 * a list that changes while the menu is closed — recent folders, the current
 * theme — is never shown stale (v0.2 FR-M7 ~ FR-M9).
 */
export interface MenuSubItem {
  id: string;
  label: string;
  shortcut?: string;
  /** Nested rows and separators use the same provider mechanism as top-level items. */
  type?: 'normal' | 'separator' | 'submenu';
  checked?: boolean;
  disabled?: boolean;
  action?: () => void;
  /** A button at the row's right end that acts on the row without choosing it (FR-M7). */
  secondaryAction?: { title: string; iconClass: string; action: () => void };
}

export interface MenuGroup {
  id: 'file' | 'edit' | 'view' | 'help';
  label: string;
  items: MenuItem[];
}

const separator = (id: string): MenuItem => Object.freeze({ id, label: '', type: 'separator' as const });

// v0.2 FR-M1 · FR-M6 (UT-MNU-002): list, order and separator positions.
export const DEFAULT_FILE_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'file:new-tab', label: 'New Tab', shortcut: 'Ctrl+N' }),
  Object.freeze({ id: 'file:open-file', label: 'Open File...', shortcut: 'Ctrl+O' }),
  Object.freeze({ id: 'file:open-folder', label: 'Open Folder...', shortcut: 'Ctrl+K Ctrl+O' }),
  Object.freeze({ id: 'file:open-recent', label: 'Recent Folders', type: 'submenu' as const }),
  separator('file:separator-recent'),
  // Save acts on the active tab through the app's save handler (D-13): the
  // shell only offers the row, as it already does in the close dialog.
  Object.freeze({ id: 'file:save', label: 'Save', shortcut: 'Ctrl+S' }),
  separator('file:separator-save'),
  Object.freeze({ id: 'file:close-tab', label: 'Close Active Tab', shortcut: 'Ctrl+W' }),
  Object.freeze({ id: 'file:close-editor-group', label: 'Close All Tabs in Group', shortcut: 'Ctrl+K W' }),
  Object.freeze({ id: 'file:close-all-tabs', label: 'Close All Tabs' }),
  separator('file:separator-close'),
  Object.freeze({ id: 'file:exit', label: 'Exit', shortcut: 'Alt+F4', action: () => closeWindow() }),
]);

// D-13 (user request, 2026-09-24): VS Code's Edit menu order, plus the
// multi-cursor rows from its Selection menu. The keys stay the text view's
// (reserved-keys.md §4) — a row only shows them.
export const DEFAULT_EDIT_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'edit:undo', label: 'Undo', shortcut: 'Ctrl+Z' }),
  Object.freeze({ id: 'edit:redo', label: 'Redo', shortcut: 'Ctrl+Y' }),
  separator('edit:separator-history'),
  Object.freeze({ id: 'edit:cut', label: 'Cut', shortcut: 'Ctrl+X' }),
  Object.freeze({ id: 'edit:copy', label: 'Copy', shortcut: 'Ctrl+C' }),
  Object.freeze({ id: 'edit:paste', label: 'Paste', shortcut: 'Ctrl+V' }),
  separator('edit:separator-clipboard'),
  Object.freeze({ id: 'edit:find', label: 'Find', shortcut: 'Ctrl+F' }),
  Object.freeze({ id: 'edit:replace', label: 'Replace', shortcut: 'Ctrl+H' }),
  separator('edit:separator-find'),
  Object.freeze({ id: 'edit:comment-line', label: 'Toggle Line Comment', shortcut: 'Ctrl+/' }),
  Object.freeze({ id: 'edit:block-comment', label: 'Toggle Block Comment', shortcut: 'Shift+Alt+A' }),
  separator('edit:separator-comment'),
  Object.freeze({ id: 'edit:select-all', label: 'Select All', shortcut: 'Ctrl+A' }),
  Object.freeze({ id: 'edit:add-next-occurrence', label: 'Add Next Occurrence', shortcut: 'Ctrl+D' }),
  Object.freeze({ id: 'edit:cursor-above', label: 'Add Cursor Above', shortcut: 'Ctrl+Alt+Up' }),
  Object.freeze({ id: 'edit:cursor-below', label: 'Add Cursor Below', shortcut: 'Ctrl+Alt+Down' }),
]);

// v0.2 FR-M2 · FR-M6.
export const DEFAULT_VIEW_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'view:layout', label: 'Layout', type: 'submenu' as const }),
  Object.freeze({ id: 'view:appearance', label: 'Appearance', type: 'submenu' as const }),
  Object.freeze({ id: 'view:tab-mode', label: 'Tab Mode', type: 'submenu' as const }),
  Object.freeze({ id: 'view:file-filter', label: 'File Filter', type: 'submenu' as const }),
  separator('view:separator-delete'),
  // Plain checkbox row, not a submenu (v0.3, user request 2026-09-25) — a
  // single safety gate for Explorer delete, kept at top level rather than
  // buried in Appearance, since it isn't about how things look.
  Object.freeze({ id: 'view:delete-enabled', label: 'Allow Delete in Explorer' }),
]);

// v0.2 FR-M3.
export const DEFAULT_HELP_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'help:about', label: 'About' }),
]);

export class MenuController {
  private menuDropdownEl: HTMLElement | null = null;
  private _isOpen = false;
  private activeCategoryId: string = 'file';
  private focusedItemIndex = 0;
  /** Open submenu ids from the category's child to the deepest nested list. */
  private openSubmenuPath: string[] = [];
  /** Keyboard position for each corresponding submenu depth. */
  private focusedSubIndices: number[] = [];

  private readonly coreFileItems: readonly MenuItem[] = Object.freeze(
    DEFAULT_FILE_ITEMS.map((it) => Object.freeze({ ...it }))
  );
  private readonly coreEditItems: readonly MenuItem[] = Object.freeze(
    DEFAULT_EDIT_ITEMS.map((it) => Object.freeze({ ...it }))
  );
  private readonly coreViewItems: readonly MenuItem[] = Object.freeze(
    DEFAULT_VIEW_ITEMS.map((it) => Object.freeze({ ...it }))
  );
  private readonly coreHelpItems: readonly MenuItem[] = Object.freeze(
    DEFAULT_HELP_ITEMS.map((it) => Object.freeze({ ...it }))
  );
  private appFileItems: MenuItem[] = [];
  private itemActions: Map<string, () => void> = new Map();
  private checkedProviders: Map<string, () => boolean> = new Map();
  private disabledProviders: Map<string, () => boolean> = new Map();
  private submenuProviders: Map<string, () => MenuSubItem[]> = new Map();

  constructor(private hamburgerBtn: HTMLButtonElement, private rootContainer: HTMLElement) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    document.addEventListener('click', (e) => {
      if (this._isOpen && this.menuDropdownEl && !this.menuDropdownEl.contains(e.target as Node)) {
        this.closeMenu();
      }
    });

    // Capture phase (A12 Critical): F10, and every key the open menu consumes,
    // is the shell's regardless of focus (reserved-keys.md §1 · §2). A tab view
    // that stops its own keydown from propagating must not be able to block
    // them.
    document.addEventListener('keydown', (e) => {
      // F10 opens/closes the menu with zero mouse involvement (NFR-7, D-7).
      if (e.key === 'F10' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        this.toggleMenu();
        return;
      }

      if (!this._isOpen) return;
      // While the menu is open only the bare keys below are the menu's; a
      // modified combo (Ctrl+ArrowDown, Shift+Delete, ...) belongs to the app
      // (A12 Major, reserved-keys.md §2).
      if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeMenu();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        if (this.openSubmenuPath.length > 0) this.moveSubFocus(delta);
        else this.moveItemFocus(delta);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.openSubmenuPath.length === 0) {
          const focused = this.getFocusedItem();
          if (focused?.type === 'submenu') this.openSubmenu(focused.id, 0);
          else this.moveCategoryFocus(1);
        } else {
          const depth = this.openSubmenuPath.length - 1;
          const row = this.getFocusedSubItem(depth);
          if (row?.type === 'submenu') this.openSubmenu(row.id, depth + 1);
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.openSubmenuPath.length > 0) {
          this.openSubmenuPath.pop();
          this.focusedSubIndices.length = this.openSubmenuPath.length;
          this.renderMenu();
        } else {
          this.moveCategoryFocus(-1);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this.triggerFocusedItem();
        return;
      }
      // The keyboard path to a row's remove button — only where a row actually
      // has one (Recent Folders). In a submenu with no removal (Color Theme,
      // Icon Theme) Delete is the app's (A12 R3 Major, reserved-keys.md §2).
      if (e.key === 'Delete' && this.openSubmenuPath.length > 0) {
        const depth = this.openSubmenuPath.length - 1;
        const row = this.getFocusedSubItem(depth);
        if (row?.secondaryAction) {
          e.preventDefault();
          row.secondaryAction.action();
          this.clampSubFocus(depth);
          this.renderMenu();
        }
      }
    }, true);

    const handleZenEnter = () => {
      if (this._isOpen) {
        this.closeMenu();
      }
    };
    this.rootContainer.addEventListener('workbench:zen-enter', handleZenEnter);
    if (typeof window !== 'undefined') {
      window.addEventListener('workbench:zen-enter', handleZenEnter);
    }

    // Exactly one shell menu device is open at a time (NFR-7): opening the
    // right-click menu closes the hamburger menu.
    const handleContextMenuOpen = () => {
      if (this._isOpen) {
        this.closeMenu();
      }
    };
    this.rootContainer.addEventListener('workbench:contextmenu-open', handleContextMenuOpen);
    if (typeof window !== 'undefined') {
      window.addEventListener('workbench:contextmenu-open', handleContextMenuOpen);
    }
  }

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public toggleMenu(): void {
    if (this._isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  public openMenu(): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this.activeCategoryId = 'file';
    this.focusedItemIndex = 0;
    this.openSubmenuPath = [];
    this.focusedSubIndices = [];
    this.renderMenu();
    this.rootContainer.dispatchEvent(new CustomEvent('workbench:menu-open'));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('workbench:menu-open'));
    }
  }

  private getSelectableItems(categoryId: string): MenuItem[] {
    const group = this.getGroups().find((g) => g.id === categoryId);
    return (group?.items || []).filter((it) => it.type !== 'separator');
  }

  private firstEnabledIndex(categoryId: string): number {
    const index = this.getSelectableItems(categoryId).findIndex((it) => !this.isItemDisabled(it.id));
    return index >= 0 ? index : 0;
  }

  private getFocusedItem(): MenuItem | undefined {
    return this.getSelectableItems(this.activeCategoryId)[this.focusedItemIndex];
  }

  private moveItemFocus(delta: number): void {
    const items = this.getSelectableItems(this.activeCategoryId);
    if (!items.some((it) => !this.isItemDisabled(it.id))) return;
    let next = this.focusedItemIndex;
    do {
      next = (next + delta + items.length) % items.length;
    } while (this.isItemDisabled(items[next].id));
    this.focusedItemIndex = next;
    this.renderMenu();
  }

  private moveCategoryFocus(delta: number): void {
    const groups = this.getGroups();
    const currentIndex = groups.findIndex((g) => g.id === this.activeCategoryId);
    const nextIndex = (currentIndex + delta + groups.length) % groups.length;
    this.activeCategoryId = groups[nextIndex].id;
    this.focusedItemIndex = this.firstEnabledIndex(this.activeCategoryId);
    this.openSubmenuPath = [];
    this.focusedSubIndices = [];
    this.renderMenu();
  }

  private getSelectableSubItems(parentId: string): MenuSubItem[] {
    return this.getSubmenuItems(parentId).filter((row) => row.type !== 'separator');
  }

  private getFocusedSubItem(depth: number): MenuSubItem | undefined {
    const parentId = this.openSubmenuPath[depth];
    if (!parentId) return undefined;
    return this.getSelectableSubItems(parentId)[this.focusedSubIndices[depth] ?? 0];
  }

  private openSubmenu(id: string, depth: number): void {
    this.openSubmenuPath = [...this.openSubmenuPath.slice(0, depth), id];
    this.focusedSubIndices.length = depth;
    const rows = this.getSelectableSubItems(id);
    const firstEnabled = rows.findIndex((r) => !r.disabled);
    this.focusedSubIndices[depth] = firstEnabled >= 0 ? firstEnabled : 0;
    this.renderMenu();
  }

  private moveSubFocus(delta: number): void {
    const depth = this.openSubmenuPath.length - 1;
    const parentId = this.openSubmenuPath[depth];
    if (!parentId) return;
    const rows = this.getSelectableSubItems(parentId);
    if (!rows.some((r) => !r.disabled)) return;
    let next = this.focusedSubIndices[depth] ?? 0;
    do {
      next = (next + delta + rows.length) % rows.length;
    } while (rows[next].disabled);
    this.focusedSubIndices[depth] = next;
    this.openSubmenuPath.length = depth + 1;
    this.focusedSubIndices.length = depth + 1;
    this.renderMenu();
  }

  /** Keeps the keyboard position on a real row after the list got shorter. */
  private clampSubFocus(depth: number): void {
    const parentId = this.openSubmenuPath[depth];
    if (!parentId) return;
    const rows = this.getSelectableSubItems(parentId);
    if ((this.focusedSubIndices[depth] ?? 0) >= rows.length) {
      this.focusedSubIndices[depth] = Math.max(0, rows.length - 1);
    }
  }

  private triggerFocusedItem(): void {
    if (this.openSubmenuPath.length > 0) {
      const depth = this.openSubmenuPath.length - 1;
      const row = this.getFocusedSubItem(depth);
      if (!row || row.disabled) return;
      if (row.type === 'submenu') {
        this.openSubmenu(row.id, depth + 1);
        return;
      }
      this.closeMenu();
      (row.action || this.itemActions.get(row.id))?.();
      return;
    }
    const item = this.getFocusedItem();
    if (!item || this.isItemDisabled(item.id)) return;
    if (item.type === 'submenu') {
      this.openSubmenu(item.id, 0);
      return;
    }
    this.closeMenu();
    const act = this.itemActions.get(item.id) || item.action;
    if (act) {
      act();
    }
  }

  public closeMenu(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.openSubmenuPath = [];
    this.focusedSubIndices = [];
    if (this.menuDropdownEl && this.menuDropdownEl.parentNode) {
      this.menuDropdownEl.parentNode.removeChild(this.menuDropdownEl);
    }
    this.menuDropdownEl = null;
  }

  public getFileItems(): readonly MenuItem[] {
    return this.coreFileItems;
  }

  public getEditItems(): readonly MenuItem[] {
    return this.coreEditItems;
  }

  public getViewItems(): readonly MenuItem[] {
    return this.coreViewItems;
  }

  public getHelpItems(): readonly MenuItem[] {
    return this.coreHelpItems;
  }

  /**
   * Apps may only append custom items to File menu below a separator (D-31, FR-N6, FR-N7).
   * Core File items cannot be removed/reordered, and View/Help cannot be modified.
   */
  public addAppFileItem(item: MenuItem): void {
    this.appFileItems.push({ ...item });
  }

  public getGroups(): MenuGroup[] {
    const combinedFileItems: MenuItem[] = [...this.coreFileItems];
    if (this.appFileItems.length > 0) {
      combinedFileItems.push({ id: 'file:separator-app', label: '', type: 'separator' });
      combinedFileItems.push(...this.appFileItems);
    }

    return [
      { id: 'file', label: 'File', items: combinedFileItems },
      { id: 'edit', label: 'Edit', items: [...this.coreEditItems] },
      { id: 'view', label: 'View', items: [...this.coreViewItems] },
      { id: 'help', label: 'Help', items: [...this.coreHelpItems] },
    ];
  }

  public findItem(id: string): MenuItem | undefined {
    for (const group of this.getGroups()) {
      const found = group.items.find((it) => it.id === id);
      if (found) return found;
    }
    return undefined;
  }

  public setAction(id: string, action: () => void): void {
    this.itemActions.set(id, action);
  }

  public triggerItem(id: string): void {
    if (this.isItemDisabled(id)) return;
    const act = this.itemActions.get(id) || this.findItem(id)?.action;
    if (act) {
      act();
    }
  }

  /** A check mark beside the row, read from live state each time the menu is drawn. */
  public setCheckedProvider(id: string, isChecked: () => boolean): void {
    this.checkedProviders.set(id, isChecked);
  }

  /** Greys a top-level row out, read from live state each time the menu is drawn. */
  public setDisabledProvider(id: string, isDisabled: () => boolean): void {
    this.disabledProviders.set(id, isDisabled);
  }

  public isItemDisabled(id: string): boolean {
    return this.disabledProviders.get(id)?.() ?? false;
  }

  public setSubmenuProvider(id: string, rows: () => MenuSubItem[]): void {
    this.submenuProviders.set(id, rows);
  }

  public getSubmenuItems(id: string): MenuSubItem[] {
    return this.submenuProviders.get(id)?.() ?? [];
  }

  private renderMenu(): void {
    if (this.menuDropdownEl) {
      this.menuDropdownEl.remove();
    }

    const menuEl = document.createElement('div');
    menuEl.id = 'workbench-menu-dropdown';
    menuEl.className = 'workbench-menu-dropdown';

    const groups = this.getGroups();

    groups.forEach((group) => {
      const groupRow = document.createElement('div');
      groupRow.className = `menu-category-row ${group.id === this.activeCategoryId ? 'active' : ''}`;
      groupRow.dataset.categoryId = group.id;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'menu-category-label';
      labelSpan.textContent = group.label;

      // The same chevron glyph VS Code uses for a submenu, not a text
      // character (FR-M11, UT-MNU-001).
      const arrow = document.createElement('i');
      arrow.className = 'codicon codicon-chevron-right menu-category-arrow';
      arrow.setAttribute('aria-hidden', 'true');

      groupRow.appendChild(labelSpan);
      groupRow.appendChild(arrow);

      const submenuEl = document.createElement('div');
      submenuEl.className = 'menu-submenu';
      submenuEl.dataset.parentGroup = group.id;

      let selectableIndex = -1;
      group.items.forEach((item) => {
        if (item.type === 'separator') {
          const sep = document.createElement('div');
          sep.className = 'menu-separator';
          submenuEl.appendChild(sep);
          return;
        }
        selectableIndex++;
        const indexInGroup = selectableIndex;
        const isActiveGroup = group.id === this.activeCategoryId;
        const isKeyboardFocused = isActiveGroup && indexInGroup === this.focusedItemIndex;
        const isSubmenu = item.type === 'submenu';
        const isDisabled = this.isItemDisabled(item.id);

        const itemRow = document.createElement('div');
        itemRow.className =
          'menu-item-row' +
          (isDisabled ? ' disabled' : '') +
          (isKeyboardFocused ? ' kbd-focused' : '') +
          (isSubmenu ? ' has-submenu' : '') +
          (isSubmenu && isActiveGroup && this.openSubmenuPath[0] === item.id ? ' submenu-open' : '');
        itemRow.dataset.itemId = item.id;

        itemRow.appendChild(this.createCheckCell(this.checkedProviders.get(item.id)?.() ?? false));

        const itemLabel = document.createElement('span');
        itemLabel.className = 'menu-item-label';
        itemLabel.textContent = item.label;
        itemRow.appendChild(itemLabel);

        // Only a row that has a shortcut gets the cell at all, so no row shows
        // an empty shortcut text (FR-M4).
        if (item.shortcut) {
          const shortcut = document.createElement('span');
          shortcut.className = 'menu-item-shortcut';
          shortcut.textContent = item.shortcut;
          itemRow.appendChild(shortcut);
        }

        if (isSubmenu) {
          const chevron = document.createElement('i');
          chevron.className = 'codicon codicon-chevron-right menu-item-chevron';
          chevron.setAttribute('aria-hidden', 'true');
          itemRow.appendChild(chevron);
          itemRow.appendChild(this.createChildSubmenu(item.id, isActiveGroup, 0));
        }

        itemRow.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isSubmenu) {
            this.activeCategoryId = group.id;
            this.focusedItemIndex = indexInGroup;
            if (this.openSubmenuPath[0] === item.id) {
              this.openSubmenuPath = [];
              this.focusedSubIndices = [];
              this.renderMenu();
            } else {
              this.openSubmenu(item.id, 0);
            }
            return;
          }
          if (isDisabled) return;
          this.closeMenu();
          const act = this.itemActions.get(item.id) || item.action;
          if (act) {
            act();
          }
        });

        // Pointing at a row opens its submenu, and pointing at any other row
        // closes it — without redrawing, which would drop the hover state.
        itemRow.addEventListener('mouseenter', () => {
          if (group.id !== this.activeCategoryId) return;
          this.focusedItemIndex = indexInGroup;
          this.openSubmenuPath = isSubmenu ? [item.id] : [];
          this.focusedSubIndices = isSubmenu ? [0] : [];
          menuEl.querySelectorAll('.menu-item-row').forEach((r) => {
            r.classList.remove('kbd-focused');
            if (r.classList.contains('has-submenu')) r.classList.remove('submenu-open');
          });
          itemRow.classList.add('kbd-focused');
          if (isSubmenu) itemRow.classList.add('submenu-open');
          this.flipClippedSubmenusSoon();
        });

        submenuEl.appendChild(itemRow);
      });

      groupRow.appendChild(submenuEl);

      groupRow.addEventListener('mouseenter', () => {
        if (this.activeCategoryId !== group.id) {
          this.activeCategoryId = group.id;
          this.focusedItemIndex = 0;
          this.openSubmenuPath = [];
          this.focusedSubIndices = [];
          menuEl.querySelectorAll('.menu-category-row').forEach((r) => r.classList.remove('active'));
          menuEl.querySelectorAll('.menu-item-row').forEach((r) => r.classList.remove('submenu-open', 'kbd-focused'));
          groupRow.classList.add('active');
        }
        this.flipClippedSubmenusSoon();
      });

      groupRow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeCategoryId === group.id) return;
        this.activeCategoryId = group.id;
        this.focusedItemIndex = 0;
        this.openSubmenuPath = [];
        this.focusedSubIndices = [];
        menuEl.querySelectorAll('.menu-category-row').forEach((r) => r.classList.remove('active'));
        menuEl.querySelectorAll('.menu-item-row').forEach((r) => r.classList.remove('submenu-open', 'kbd-focused'));
        groupRow.classList.add('active');
      });

      menuEl.appendChild(groupRow);
    });

    this.rootContainer.appendChild(menuEl);
    this.menuDropdownEl = menuEl;
    this.flipClippedSubmenusSoon();
  }

  /**
   * A12 Major: a row's child submenu opens to the right (`left: 100%`) and can
   * run past the window edge in a narrow window. After layout, each visible
   * child submenu is placed to keep it on screen: right by default, flipped
   * left when it fits there, and otherwise clamped into the viewport with an
   * explicit left (A12 R3 Major — a flip that does not fit must not just move
   * the overflow to the other edge). The first-level File/View/Help lists are
   * anchored at the viewport's left edge, so flipping them never helps and
   * they are left alone.
   */
  private flipClippedSubmenusSoon(): void {
    if (typeof requestAnimationFrame !== 'function') {
      this.positionChildSubmenus();
      return;
    }
    requestAnimationFrame(() => this.positionChildSubmenus());
  }

  private positionChildSubmenus(): void {
    if (!this.menuDropdownEl) return;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : Infinity;
    const margin = 4;
    this.menuDropdownEl.querySelectorAll<HTMLElement>('.menu-child-submenu').forEach((el) => {
      // Reset to the CSS default (open right) before measuring.
      el.classList.remove('submenu-flip');
      el.style.left = '';
      if (getComputedStyle(el).display === 'none') return;

      const rect = el.getBoundingClientRect();
      if (rect.right <= viewportWidth - margin) return; // fits as-is

      const rowRect = el.parentElement?.getBoundingClientRect();
      if (!rowRect) return;

      if (rowRect.left - rect.width >= margin) {
        el.classList.add('submenu-flip'); // room on the left
        return;
      }
      // Neither side fits: pin the submenu inside the viewport.
      const clampedViewportLeft = Math.max(margin, viewportWidth - margin - rect.width);
      el.style.left = `${clampedViewportLeft - rowRect.left}px`;
    });
  }

  private createCheckCell(checked: boolean): HTMLElement {
    const cell = document.createElement('span');
    cell.className = 'menu-item-check';
    if (checked) {
      const icon = document.createElement('i');
      icon.className = 'codicon codicon-check';
      icon.setAttribute('aria-hidden', 'true');
      cell.appendChild(icon);
    }
    return cell;
  }

  private createChildSubmenu(parentId: string, isActiveGroup: boolean, depth: number): HTMLElement {
    const childEl = document.createElement('div');
    childEl.className = 'menu-submenu menu-child-submenu';
    childEl.dataset.parentItem = parentId;

    let selectableIndex = -1;
    this.getSubmenuItems(parentId).forEach((row) => {
      if (row.type === 'separator') {
        const separatorEl = document.createElement('div');
        separatorEl.className = 'menu-separator';
        childEl.appendChild(separatorEl);
        return;
      }
      selectableIndex++;
      const index = selectableIndex;
      const isSubmenu = row.type === 'submenu';
      const rowEl = document.createElement('div');
      const isFocused =
        isActiveGroup && this.openSubmenuPath[depth] === parentId && index === (this.focusedSubIndices[depth] ?? 0);
      rowEl.className =
        'menu-item-row menu-child-row' +
        (row.disabled ? ' disabled' : '') +
        (isFocused ? ' kbd-focused' : '') +
        (isSubmenu ? ' has-submenu' : '') +
        (isSubmenu && this.openSubmenuPath[depth + 1] === row.id ? ' submenu-open' : '');
      rowEl.dataset.itemId = row.id;

      const checked = row.checked ?? this.checkedProviders.get(row.id)?.() ?? false;
      rowEl.appendChild(this.createCheckCell(checked));

      const label = document.createElement('span');
      label.className = 'menu-item-label';
      label.textContent = row.label;
      label.title = row.label;
      rowEl.appendChild(label);

      if (row.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'menu-item-shortcut';
        shortcut.textContent = row.shortcut;
        rowEl.appendChild(shortcut);
      }

      if (isSubmenu) {
        const chevron = document.createElement('i');
        chevron.className = 'codicon codicon-chevron-right menu-item-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        rowEl.appendChild(chevron);
        rowEl.appendChild(this.createChildSubmenu(row.id, isActiveGroup, depth + 1));
      }

      if (row.secondaryAction) {
        const secondary = row.secondaryAction;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'menu-item-secondary';
        btn.title = secondary.title;
        btn.setAttribute('aria-label', secondary.title);
        const icon = document.createElement('i');
        icon.className = `codicon ${secondary.iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          secondary.action();
          // The list stays open on the row the user was working in.
          this.openSubmenuPath = [...this.openSubmenuPath.slice(0, depth), parentId];
          this.focusedSubIndices[depth] = index;
          this.clampSubFocus(depth);
          this.renderMenu();
        });
        rowEl.appendChild(btn);
      }

      rowEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (row.disabled) return;
        if (isSubmenu) {
          this.focusedSubIndices[depth] = index;
          if (this.openSubmenuPath[depth + 1] === row.id) {
            this.openSubmenuPath.length = depth + 1;
            this.focusedSubIndices.length = depth + 1;
            this.renderMenu();
          } else {
            this.openSubmenu(row.id, depth + 1);
          }
          return;
        }
        this.closeMenu();
        (row.action || this.itemActions.get(row.id))?.();
      });

      rowEl.addEventListener('mouseenter', () => {
        if (!isActiveGroup) return;
        this.focusedSubIndices[depth] = index;
        this.openSubmenuPath.length = depth + 1;
        this.focusedSubIndices.length = depth + 1;
        if (isSubmenu) {
          this.openSubmenuPath[depth + 1] = row.id;
          this.focusedSubIndices[depth + 1] = 0;
        }
        childEl.querySelectorAll(':scope > .menu-item-row').forEach((el) => {
          el.classList.remove('kbd-focused', 'submenu-open');
        });
        rowEl.classList.add('kbd-focused');
        if (isSubmenu) rowEl.classList.add('submenu-open');
        this.flipClippedSubmenusSoon();
      });

      childEl.appendChild(rowEl);
    });

    return childEl;
  }
}
