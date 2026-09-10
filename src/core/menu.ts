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
  checked?: boolean;
  disabled?: boolean;
  action?: () => void;
  /** A button at the row's right end that acts on the row without choosing it (FR-M7). */
  secondaryAction?: { title: string; iconClass: string; action: () => void };
}

export interface MenuGroup {
  id: 'file' | 'view' | 'help';
  label: string;
  items: MenuItem[];
}

const separator = (id: string): MenuItem => Object.freeze({ id, label: '', type: 'separator' as const });

// v0.2 FR-M1 · FR-M6 (UT-MNU-002): list, order and separator positions.
export const DEFAULT_FILE_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'file:open-folder', label: 'Open Folder...', shortcut: 'Ctrl+O' }),
  separator('file:separator-open'),
  Object.freeze({ id: 'file:open-recent', label: 'Recent Folders', type: 'submenu' as const }),
  separator('file:separator-recent'),
  Object.freeze({ id: 'file:split-right', label: 'Split Right' }),
  Object.freeze({ id: 'file:split-down', label: 'Split Down' }),
  Object.freeze({ id: 'file:close-tab', label: 'Close Active Tab', shortcut: 'Ctrl+W' }),
  Object.freeze({ id: 'file:close-editor-group', label: 'Close Editor Group' }),
  Object.freeze({ id: 'file:close-all-tabs', label: 'Close All Tabs' }),
  separator('file:separator-close'),
  Object.freeze({ id: 'file:exit', label: 'Exit', shortcut: 'Alt+F4', action: () => closeWindow() }),
]);

// v0.2 FR-M2 · FR-M6.
export const DEFAULT_VIEW_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'view:color-theme', label: 'Color Theme', type: 'submenu' as const }),
  separator('view:separator-color'),
  Object.freeze({ id: 'view:icon-theme', label: 'Icon Theme', type: 'submenu' as const }),
  separator('view:separator-icon'),
  Object.freeze({ id: 'view:zen-mode', label: 'Zen Mode', shortcut: 'F11' }),
  Object.freeze({ id: 'view:toggle-sidebar', label: 'Show Sidebar', shortcut: 'Ctrl+B' }),
  Object.freeze({ id: 'view:toggle-titlebar', label: 'Show Title Bar' }),
  Object.freeze({ id: 'view:toggle-statusbar', label: 'Show Status Bar' }),
  separator('view:separator-layout'),
  Object.freeze({ id: 'view:preset-info', label: 'Preset Info' }),
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
  /** The submenu row whose list is open, and the keyboard position inside it. */
  private openSubmenuId: string | null = null;
  private focusedSubIndex = 0;

  private readonly coreFileItems: readonly MenuItem[] = Object.freeze(
    DEFAULT_FILE_ITEMS.map((it) => Object.freeze({ ...it }))
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
        if (this.openSubmenuId) this.moveSubFocus(delta);
        else this.moveItemFocus(delta);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const focused = this.getFocusedItem();
        if (!this.openSubmenuId && focused?.type === 'submenu') this.openSubmenu(focused.id);
        else this.moveCategoryFocus(1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.openSubmenuId) {
          this.openSubmenuId = null;
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
      if (e.key === 'Delete' && this.openSubmenuId) {
        const row = this.getSubmenuItems(this.openSubmenuId)[this.focusedSubIndex];
        if (row?.secondaryAction) {
          e.preventDefault();
          row.secondaryAction.action();
          this.clampSubFocus();
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
    this.openSubmenuId = null;
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

  private getFocusedItem(): MenuItem | undefined {
    return this.getSelectableItems(this.activeCategoryId)[this.focusedItemIndex];
  }

  private moveItemFocus(delta: number): void {
    const items = this.getSelectableItems(this.activeCategoryId);
    if (items.length === 0) return;
    this.focusedItemIndex = (this.focusedItemIndex + delta + items.length) % items.length;
    this.renderMenu();
  }

  private moveCategoryFocus(delta: number): void {
    const groups = this.getGroups();
    const currentIndex = groups.findIndex((g) => g.id === this.activeCategoryId);
    const nextIndex = (currentIndex + delta + groups.length) % groups.length;
    this.activeCategoryId = groups[nextIndex].id;
    this.focusedItemIndex = 0;
    this.openSubmenuId = null;
    this.renderMenu();
  }

  private openSubmenu(id: string): void {
    this.openSubmenuId = id;
    const rows = this.getSubmenuItems(id);
    const firstEnabled = rows.findIndex((r) => !r.disabled);
    this.focusedSubIndex = firstEnabled >= 0 ? firstEnabled : 0;
    this.renderMenu();
  }

  private moveSubFocus(delta: number): void {
    if (!this.openSubmenuId) return;
    const rows = this.getSubmenuItems(this.openSubmenuId);
    if (!rows.some((r) => !r.disabled)) return;
    let next = this.focusedSubIndex;
    do {
      next = (next + delta + rows.length) % rows.length;
    } while (rows[next].disabled);
    this.focusedSubIndex = next;
    this.renderMenu();
  }

  /** Keeps the keyboard position on a real row after the list got shorter. */
  private clampSubFocus(): void {
    if (!this.openSubmenuId) return;
    const rows = this.getSubmenuItems(this.openSubmenuId);
    if (this.focusedSubIndex >= rows.length) this.focusedSubIndex = Math.max(0, rows.length - 1);
  }

  private triggerFocusedItem(): void {
    if (this.openSubmenuId) {
      const row = this.getSubmenuItems(this.openSubmenuId)[this.focusedSubIndex];
      if (!row || row.disabled) return;
      this.closeMenu();
      row.action?.();
      return;
    }
    const item = this.getFocusedItem();
    if (!item) return;
    if (item.type === 'submenu') {
      this.openSubmenu(item.id);
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
    this.openSubmenuId = null;
    if (this.menuDropdownEl && this.menuDropdownEl.parentNode) {
      this.menuDropdownEl.parentNode.removeChild(this.menuDropdownEl);
    }
    this.menuDropdownEl = null;
  }

  public getFileItems(): readonly MenuItem[] {
    return this.coreFileItems;
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
    const act = this.itemActions.get(id) || this.findItem(id)?.action;
    if (act) {
      act();
    }
  }

  /** A check mark beside the row, read from live state each time the menu is drawn. */
  public setCheckedProvider(id: string, isChecked: () => boolean): void {
    this.checkedProviders.set(id, isChecked);
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

        const itemRow = document.createElement('div');
        itemRow.className =
          'menu-item-row' +
          (isKeyboardFocused ? ' kbd-focused' : '') +
          (isSubmenu ? ' has-submenu' : '') +
          (isSubmenu && isActiveGroup && this.openSubmenuId === item.id ? ' submenu-open' : '');
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
          itemRow.appendChild(this.createChildSubmenu(item.id, isActiveGroup));
        }

        itemRow.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isSubmenu) {
            this.activeCategoryId = group.id;
            this.focusedItemIndex = indexInGroup;
            if (this.openSubmenuId === item.id) {
              this.openSubmenuId = null;
              this.renderMenu();
            } else {
              this.openSubmenu(item.id);
            }
            return;
          }
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
          this.openSubmenuId = isSubmenu ? item.id : null;
          if (isSubmenu) this.focusedSubIndex = 0;
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
          this.openSubmenuId = null;
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
        this.openSubmenuId = null;
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

  private createChildSubmenu(parentId: string, isActiveGroup: boolean): HTMLElement {
    const childEl = document.createElement('div');
    childEl.className = 'menu-submenu menu-child-submenu';
    childEl.dataset.parentItem = parentId;

    this.getSubmenuItems(parentId).forEach((row, index) => {
      const rowEl = document.createElement('div');
      const isFocused = isActiveGroup && this.openSubmenuId === parentId && index === this.focusedSubIndex;
      rowEl.className =
        'menu-item-row menu-child-row' + (row.disabled ? ' disabled' : '') + (isFocused ? ' kbd-focused' : '');
      rowEl.dataset.itemId = row.id;

      rowEl.appendChild(this.createCheckCell(Boolean(row.checked)));

      const label = document.createElement('span');
      label.className = 'menu-item-label';
      label.textContent = row.label;
      label.title = row.label;
      rowEl.appendChild(label);

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
          this.openSubmenuId = parentId;
          this.focusedSubIndex = index;
          this.clampSubFocus();
          this.renderMenu();
        });
        rowEl.appendChild(btn);
      }

      rowEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (row.disabled) return;
        this.closeMenu();
        row.action?.();
      });

      childEl.appendChild(rowEl);
    });

    return childEl;
  }
}
