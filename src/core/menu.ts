import { closeWindow } from './window';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  type?: 'normal' | 'checkbox' | 'separator';
  checked?: boolean;
  action?: () => void;
}

export interface MenuGroup {
  id: 'file' | 'view' | 'help';
  label: string;
  items: MenuItem[];
}

export const DEFAULT_FILE_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'file:open-folder', label: '폴더 열기', shortcut: 'Ctrl+O' }),
  Object.freeze({ id: 'file:open-recent', label: '최근 폴더' }),
  Object.freeze({ id: 'file:close-tab', label: '탭 닫기', shortcut: 'Ctrl+W' }),
  Object.freeze({ id: 'file:close-folder', label: '폴더 닫기' }),
  Object.freeze({ id: 'file:exit', label: '끝내기', action: () => closeWindow() }),
]);

export const DEFAULT_VIEW_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'view:toggle-sidebar', label: '탐색기 접기/펴기' }),
  Object.freeze({ id: 'view:toggle-titlebar', label: '상단 바 감추기/보이기' }),
  Object.freeze({ id: 'view:toggle-statusbar', label: '하단 바 감추기/보이기' }),
  Object.freeze({ id: 'view:zen-mode', label: 'Zen 모드', shortcut: 'F11' }),
  Object.freeze({ id: 'view:cycle-color-theme', label: '테마 바꾸기' }),
  Object.freeze({ id: 'view:cycle-icon-theme', label: '아이콘 테마 바꾸기' }),
  Object.freeze({ id: 'view:split-horizontal', label: '좌우 스플릿' }),
  Object.freeze({ id: 'view:split-vertical', label: '상하 스플릿' }),
  Object.freeze({ id: 'view:close-active-tabs', label: '활성 칸 탭 모두 닫기' }),
  Object.freeze({ id: 'view:toggle-context-menu', label: '우클릭 메뉴 사용', type: 'checkbox', checked: false }),
]);

export const DEFAULT_HELP_ITEMS: readonly MenuItem[] = Object.freeze([
  Object.freeze({ id: 'help:about', label: '정보' }),
]);

export class MenuController {
  private menuDropdownEl: HTMLElement | null = null;
  private _isOpen = false;
  private activeCategoryId: string = 'file';
  private focusedItemIndex = 0;

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
  private checkboxStates: Map<string, boolean> = new Map([['view:toggle-context-menu', false]]);

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

    document.addEventListener('keydown', (e) => {
      // F10 opens/closes the menu with zero mouse involvement (NFR-7, D-7).
      if (e.key === 'F10' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        this.toggleMenu();
        return;
      }

      if (!this._isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeMenu();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveItemFocus(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveItemFocus(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.moveCategoryFocus(1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.moveCategoryFocus(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this.triggerFocusedItem();
      }
    });

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
    this.renderMenu();
  }

  private triggerFocusedItem(): void {
    const items = this.getSelectableItems(this.activeCategoryId);
    const item = items[this.focusedItemIndex];
    if (!item) return;
    if (item.type === 'checkbox') {
      this.setItemChecked(item.id, !this.isItemChecked(item.id));
    }
    const act = this.itemActions.get(item.id) || item.action;
    if (act) {
      act();
    }
    this.closeMenu();
  }

  public closeMenu(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
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

  public setItemChecked(id: string, checked: boolean): void {
    this.checkboxStates.set(id, checked);
    if (this.menuDropdownEl) {
      const el = this.menuDropdownEl.querySelector(`[data-item-id="${id}"] .menu-item-check`);
      if (el) {
        el.textContent = checked ? '✓' : '';
      }
    }
  }

  public isItemChecked(id: string): boolean {
    return this.checkboxStates.get(id) ?? false;
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

      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'menu-category-arrow';
      arrowSpan.textContent = '▶';

      groupRow.appendChild(labelSpan);
      groupRow.appendChild(arrowSpan);

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
        const isKeyboardFocused =
          group.id === this.activeCategoryId && selectableIndex === this.focusedItemIndex;

        const itemRow = document.createElement('div');
        itemRow.className = 'menu-item-row' + (isKeyboardFocused ? ' kbd-focused' : '');
        itemRow.dataset.itemId = item.id;

        const checkMark = document.createElement('span');
        checkMark.className = 'menu-item-check';
        if (item.type === 'checkbox') {
          checkMark.textContent = this.isItemChecked(item.id) ? '✓' : '';
        }

        const itemLabel = document.createElement('span');
        itemLabel.className = 'menu-item-label';
        itemLabel.textContent = item.label;

        const shortcut = document.createElement('span');
        shortcut.className = 'menu-item-shortcut';
        if (item.shortcut) {
          shortcut.textContent = item.shortcut;
        }

        itemRow.appendChild(checkMark);
        itemRow.appendChild(itemLabel);
        itemRow.appendChild(shortcut);

        itemRow.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.type === 'checkbox') {
            const next = !this.isItemChecked(item.id);
            this.setItemChecked(item.id, next);
          }
          const act = this.itemActions.get(item.id) || item.action;
          if (act) {
            act();
          }
          this.closeMenu();
        });

        submenuEl.appendChild(itemRow);
      });

      groupRow.appendChild(submenuEl);

      groupRow.addEventListener('mouseenter', () => {
        this.activeCategoryId = group.id;
        this.focusedItemIndex = 0;
        menuEl.querySelectorAll('.menu-category-row').forEach((r) => r.classList.remove('active'));
        groupRow.classList.add('active');
      });

      groupRow.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeCategoryId = group.id;
        this.focusedItemIndex = 0;
        menuEl.querySelectorAll('.menu-category-row').forEach((r) => r.classList.remove('active'));
        groupRow.classList.add('active');
      });

      menuEl.appendChild(groupRow);
    });

    this.rootContainer.appendChild(menuEl);
    this.menuDropdownEl = menuEl;
  }
}
