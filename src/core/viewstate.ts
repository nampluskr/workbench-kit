import { WorkbenchLayoutElements } from './layout';

export interface ViewState {
  sidebarVisible: boolean;
  titlebarVisible: boolean;
  statusbarVisible: boolean;
  /** Folder Tabs rail (v0.3 D-2). Independent of `sidebarVisible` — each area hides on its own. */
  folderTabsVisible: boolean;
  isZenMode: boolean;
}

export class ViewStateManager {
  private sidebarVisible = true;
  private titlebarVisible = true;
  private statusbarVisible = true;
  /**
   * Starts visible every run and is never persisted (v0.3 D-2 — "표시 상태만은
   * 저장되지 않는다", same lifetime as the other Activity Bar area toggles).
   */
  private folderTabsVisible = true;
  /**
   * The exact pair that Ctrl+B last hid. The Activity Bar controls remain
   * independent; a direct change there clears this so Ctrl+B never restores a
   * stale, unrelated layout.
   */
  private navigationRestoreState: Pick<ViewState, 'sidebarVisible' | 'folderTabsVisible'> | null = null;
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
      folderTabsVisible: this.folderTabsVisible,
      isZenMode: this._isZenMode,
    };
  }

  public get isZenMode(): boolean {
    return this._isZenMode;
  }

  public toggleSidebar(): boolean {
    if (this._isZenMode) return this.sidebarVisible;
    this.navigationRestoreState = null;
    this.applySidebarVisible(!this.sidebarVisible);
    return this.sidebarVisible;
  }

  public setSidebarVisible(visible: boolean): void {
    this.navigationRestoreState = null;
    this.applySidebarVisible(visible);
  }

  /**
   * Independent of `toggleSidebar()` (v0.3 D-2) — hiding one leaves the
   * other exactly as it was.
   */
  public toggleFolderTabs(): boolean {
    if (this._isZenMode) return this.folderTabsVisible;
    this.navigationRestoreState = null;
    this.applyFolderTabsVisible(!this.folderTabsVisible);
    return this.folderTabsVisible;
  }

  public setFolderTabsVisible(visible: boolean): void {
    this.navigationRestoreState = null;
    this.applyFolderTabsVisible(visible);
  }

  /**
   * Ctrl+B treats the Folder Tabs rail and Explorer as one navigation region:
   * hide whichever of the two areas are currently visible, then restore that
   * exact combination on the next press. If both were independently hidden,
   * there is no previous shortcut snapshot, so restore the complete
   * navigation region.
   */
  public toggleNavigationAreas(): ViewState {
    if (this._isZenMode) return this.getState();

    if (this.sidebarVisible || this.folderTabsVisible) {
      this.navigationRestoreState = {
        sidebarVisible: this.sidebarVisible,
        folderTabsVisible: this.folderTabsVisible,
      };
      this.applySidebarVisible(false);
      this.applyFolderTabsVisible(false);
    } else {
      const restore = this.navigationRestoreState ?? {
        sidebarVisible: true,
        folderTabsVisible: true,
      };
      this.applySidebarVisible(restore.sidebarVisible);
      this.applyFolderTabsVisible(restore.folderTabsVisible);
      this.navigationRestoreState = null;
    }
    return this.getState();
  }

  private applySidebarVisible(visible: boolean): void {
    this.sidebarVisible = visible;
    if (!this._isZenMode) {
      this.layout.sidebar.classList.toggle('hidden', !visible);
    }
  }

  private applyFolderTabsVisible(visible: boolean): void {
    this.folderTabsVisible = visible;
    if (!this._isZenMode) {
      this.layout.folderTabsRail.classList.toggle('hidden', !visible);
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
