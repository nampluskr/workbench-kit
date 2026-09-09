export interface ContextMenuItem {
  id: string;
  label: string;
  action: () => void;
}

/**
 * Generic right-click menu device (D-22). The shell only draws, positions,
 * and navigates the popup; it never decides what items appear. Default is
 * disabled, and showing zero items renders zero DOM elements (FR-G5).
 */
export class ContextMenuController {
  private enabled = false;
  private menuEl: HTMLElement | null = null;
  private currentItems: ContextMenuItem[] = [];
  private focusedIndex = -1;

  constructor(private rootContainer: HTMLElement) {
    document.addEventListener('mousedown', (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target as Node)) {
        this.hide();
      }
    });
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => this.hide());
    }

    // Exactly one shell menu device is open at a time (NFR-7): opening the
    // hamburger menu closes the right-click menu.
    const handleMenuOpen = () => this.hide();
    this.rootContainer.addEventListener('workbench:menu-open', handleMenuOpen);
    if (typeof window !== 'undefined') {
      window.addEventListener('workbench:menu-open', handleMenuOpen);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.hide();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isOpen(): boolean {
    return this.menuEl !== null;
  }

  /**
   * Shows the menu at (x, y). No-op when disabled (D-22) or when the caller
   * supplies zero items, so a shell with no app-defined items draws nothing.
   */
  public show(x: number, y: number, items: ContextMenuItem[]): void {
    this.hide();
    if (!this.enabled || items.length === 0) {
      return;
    }

    this.currentItems = items;
    this.focusedIndex = 0;

    const menuEl = document.createElement('div');
    menuEl.className = 'workbench-context-menu';
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;

    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'context-menu-item-row' + (index === 0 ? ' focused' : '');
      row.dataset.itemId = item.id;
      row.textContent = item.label;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        this.hide();
      });
      menuEl.appendChild(row);
    });

    this.rootContainer.appendChild(menuEl);
    this.menuEl = menuEl;

    this.rootContainer.dispatchEvent(new CustomEvent('workbench:contextmenu-open'));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('workbench:contextmenu-open'));
    }
  }

  public hide(): void {
    if (this.menuEl && this.menuEl.parentNode) {
      this.menuEl.parentNode.removeChild(this.menuEl);
    }
    this.menuEl = null;
    this.currentItems = [];
    this.focusedIndex = -1;
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.menuEl) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveFocus(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveFocus(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = this.currentItems[this.focusedIndex];
      if (item) {
        item.action();
        this.hide();
      }
    }
  }

  private moveFocus(delta: number): void {
    if (!this.menuEl || this.currentItems.length === 0) return;
    const rows = Array.from(this.menuEl.querySelectorAll('.context-menu-item-row'));
    rows[this.focusedIndex]?.classList.remove('focused');
    this.focusedIndex = (this.focusedIndex + delta + this.currentItems.length) % this.currentItems.length;
    rows[this.focusedIndex]?.classList.add('focused');
  }
}
