import { WorkbenchLayoutElements } from './layout';

export interface ViewState {
  sidebarVisible: boolean;
  titlebarVisible: boolean;
  statusbarVisible: boolean;
  isZenMode: boolean;
}

export class ViewStateManager {
  private sidebarVisible = true;
  private titlebarVisible = true;
  private statusbarVisible = true;
  private _isZenMode = false;

  constructor(private layout: WorkbenchLayoutElements) {
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    // Capture phase (A12 Critical): a reserved key is the shell's regardless of
    // focus (reserved-keys.md §1). A bubbling listener could be blocked by a
    // tab view that calls stopPropagation() on its own keydown; a capture
    // listener on window runs before the event ever reaches that view.
    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        // Only bare F11 is reserved — Ctrl/Alt/Shift+F11 belong to the app
        // (A12 Major, reserved-keys.md §1).
        const bare = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
        if (e.key === 'F11' && bare) {
          e.preventDefault();
          this.toggleZenMode();
        } else if (e.key === 'Escape' && this._isZenMode && bare) {
          e.preventDefault();
          this.exitZenMode();
        }
      },
      true
    );
  }

  public getState(): ViewState {
    return {
      sidebarVisible: this.sidebarVisible,
      titlebarVisible: this.titlebarVisible,
      statusbarVisible: this.statusbarVisible,
      isZenMode: this._isZenMode,
    };
  }

  public get isZenMode(): boolean {
    return this._isZenMode;
  }

  public toggleSidebar(): boolean {
    if (this._isZenMode) return this.sidebarVisible;
    this.sidebarVisible = !this.sidebarVisible;
    this.layout.sidebar.classList.toggle('hidden', !this.sidebarVisible);
    return this.sidebarVisible;
  }

  public setSidebarVisible(visible: boolean): void {
    this.sidebarVisible = visible;
    if (!this._isZenMode) {
      this.layout.sidebar.classList.toggle('hidden', !visible);
    }
  }

  public toggleTitlebar(): boolean {
    if (this._isZenMode) return this.titlebarVisible;
    this.titlebarVisible = !this.titlebarVisible;
    this.layout.titlebar.classList.toggle('hidden', !this.titlebarVisible);
    return this.titlebarVisible;
  }

  public setTitlebarVisible(visible: boolean): void {
    this.titlebarVisible = visible;
    if (!this._isZenMode) {
      this.layout.titlebar.classList.toggle('hidden', !visible);
    }
  }

  public toggleStatusbar(): boolean {
    if (this._isZenMode) return this.statusbarVisible;
    this.statusbarVisible = !this.statusbarVisible;
    this.layout.statusbar.classList.toggle('hidden', !this.statusbarVisible);
    return this.statusbarVisible;
  }

  public setStatusbarVisible(visible: boolean): void {
    this.statusbarVisible = visible;
    if (!this._isZenMode) {
      this.layout.statusbar.classList.toggle('hidden', !visible);
    }
  }

  public toggleZenMode(): boolean {
    if (this._isZenMode) {
      this.exitZenMode();
    } else {
      this.enterZenMode();
    }
    return this._isZenMode;
  }

  private onZenEnterCallbacks: (() => void)[] = [];
  private onZenChangeCallbacks: ((isZen: boolean) => void)[] = [];

  /**
   * Fires on every Zen transition, in both directions and whichever way it was
   * triggered (F11, Escape, a menu row, a button), so anything showing Zen
   * state can stay in step with it (v0.2 FR-C2, FR-C11).
   */
  public onZenChange(cb: (isZen: boolean) => void): () => void {
    this.onZenChangeCallbacks.push(cb);
    return () => {
      this.onZenChangeCallbacks = this.onZenChangeCallbacks.filter((c) => c !== cb);
    };
  }

  public onZenEnter(cb: () => void): () => void {
    this.onZenEnterCallbacks.push(cb);
    return () => {
      this.onZenEnterCallbacks = this.onZenEnterCallbacks.filter((c) => c !== cb);
    };
  }

  public enterZenMode(): void {
    if (this._isZenMode) return;
    this._isZenMode = true;
    this.layout.root.classList.add('zen-mode');
    this.layout.root.dispatchEvent(new CustomEvent('workbench:zen-enter'));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('workbench:zen-enter'));
    }
    this.onZenEnterCallbacks.forEach((cb) => cb());
    this.onZenChangeCallbacks.forEach((cb) => cb(true));
    const openMenus = document.querySelectorAll('.workbench-menu-dropdown');
    openMenus.forEach((menu) => menu.remove());
  }

  public exitZenMode(): void {
    if (!this._isZenMode) return;
    this._isZenMode = false;
    this.layout.root.classList.remove('zen-mode');
    this.onZenChangeCallbacks.forEach((cb) => cb(false));
  }
}
