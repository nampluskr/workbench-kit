export interface ContextMenuItem {
  id: string;
  label: string;
  /** `separator` rows draw a divider and are skipped by focus/keyboard nav and click (v0.3 WK-115). */
  type?: 'normal' | 'separator';
  action?: () => void;
  /** Greyed out and unreachable by click, Enter, or arrow-key focus — same idea as the hamburger menu's own row `disabled` (user request, 2026-09-25). */
  disabled?: boolean;
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
    // Capture phase (A12 Critical): while this menu is open its keys are the
    // shell's regardless of focus (reserved-keys.md §2b). A tab view cannot
    // block them by stopping its own keydown.
    document.addEventListener('keydown', (e) => this.handleKeydown(e), true);
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
    const firstSelectable = items.findIndex((it) => it.type !== 'separator' && !it.disabled);
    if (!this.enabled || firstSelectable === -1) {
      return;
    }

    this.currentItems = items;
    this.focusedIndex = firstSelectable;

    const menuEl = document.createElement('div');
    menuEl.className = 'workbench-context-menu';
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;

    items.forEach((item, index) => {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'menu-separator';
        menuEl.appendChild(sep);
        return;
      }
      const row = document.createElement('div');
      row.className = 'context-menu-item-row' +
        (index === this.focusedIndex ? ' focused' : '') +
        (item.disabled ? ' disabled' : '');
      row.dataset.itemId = item.id;
      row.textContent = item.label;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.disabled) return;
        item.action?.();
        this.hide();
      });
      // The pointer moves the one focus marker with it, as in the hamburger
      // menu — otherwise the first row's opening highlight stayed put while
      // another row was hovered, two rows looking selected at once (user
      // report, 2026-09-24). A disabled row never takes focus (user request,
      // 2026-09-25), same as it never takes the initial/keyboard focus below.
      row.addEventListener('mouseenter', () => { if (!item.disabled) this.setFocus(index); });
      menuEl.appendChild(row);
    });

    this.rootContainer.appendChild(menuEl);
    this.menuEl = menuEl;

    // Folder Tabs rail and Explorer tree rows sit near the window edges, so a
    // right click there can place the menu past the bottom (or right) of the
    // window (user report, 2026-09-25). Flip up/left from the click point
    // once actual size is known, clamped so the top/left edge never goes
    // negative on a menu taller/wider than the viewport itself.
    const rect = menuEl.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    if (rect.bottom > viewportHeight) {
      menuEl.style.top = `${Math.max(0, viewportHeight - rect.height)}px`;
    }
    if (rect.right > viewportWidth) {
      menuEl.style.left = `${Math.max(0, viewportWidth - rect.width)}px`;
    }

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
    // Only the bare keys below are this menu's while it is open; a modified
    // combo (Ctrl+Enter, Ctrl+ArrowDown, ...) belongs to the focused app
    // (A12 R2 Major, reserved-keys.md §2b).
    if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.moveFocus(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.moveFocus(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Right-click selecting (and focusing) its row before the menu opens
      // (v0.3 WK-120) means the tree/rail sitting underneath can now
      // legitimately have DOM focus while this menu is open — without
      // stopping propagation, the SAME ArrowDown/Enter this handler just
      // consumed would keep bubbling into that focused row's own keyboard
      // handling too (e.g. Enter opening a file), which used to be
      // unreachable only because nothing under the menu was ever focused.
      e.stopPropagation();
      const item = this.currentItems[this.focusedIndex];
      if (item && !item.disabled) {
        item.action?.();
        this.hide();
      }
    }
  }

  private getRowEl(index: number): Element | null {
    const item = this.currentItems[index];
    if (!item || !this.menuEl) return null;
    return this.menuEl.querySelector(`.context-menu-item-row[data-item-id="${item.id}"]`);
  }

  /** Separator and disabled rows have no landable focus of their own (v0.3 WK-115; disabled, 2026-09-25). */
  private moveFocus(delta: number): void {
    if (!this.menuEl || this.currentItems.length === 0) return;
    const selectableIndices = this.currentItems
      .map((it, i) => (it.type === 'separator' || it.disabled ? -1 : i))
      .filter((i) => i !== -1);
    if (selectableIndices.length === 0) return;
    const currentPos = selectableIndices.indexOf(this.focusedIndex);
    const nextPos = (currentPos + delta + selectableIndices.length) % selectableIndices.length;
    this.setFocus(selectableIndices[nextPos]);
  }

  /** Moves the single focus marker to `index` — shared by the arrow keys and the pointer. */
  private setFocus(index: number): void {
    if (index === this.focusedIndex) return;
    this.getRowEl(this.focusedIndex)?.classList.remove('focused');
    this.focusedIndex = index;
    this.getRowEl(this.focusedIndex)?.classList.add('focused');
  }
}
