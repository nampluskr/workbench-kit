import { TreeController } from './tree';

export interface ViewAction {
  id: string;
  title: string;
  iconClass: string;
  action: () => void;
}

/** What the shell asks the app to create — 'leaf' or 'container', never "file"/"folder" (NFR-6). */
export interface NewItemRequest {
  type: 'leaf' | 'container';
}

export class ExplorerTitlebarController {
  private appActionsEl: HTMLElement;
  private newFileBtn: HTMLButtonElement;
  private newFolderBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;
  private collapseAllBtn: HTMLButtonElement;
  private treeController: TreeController;
  private appActions: ViewAction[] = [];
  /**
   * What "New File" / "New Folder" do once the user has typed a name. The
   * shell opens the inline input row and hands the name over — it never
   * creates anything itself (v0.2 FR-X4, D-6, v0.1 D-30's kept half).
   */
  private newItemHandler: ((req: NewItemRequest & { name: string; parentId?: string }) => void) | null = null;

  constructor(
    appActionsEl: HTMLElement,
    newFileBtn: HTMLButtonElement,
    newFolderBtn: HTMLButtonElement,
    refreshBtn: HTMLButtonElement,
    collapseAllBtn: HTMLButtonElement,
    treeController: TreeController
  ) {
    this.appActionsEl = appActionsEl;
    this.newFileBtn = newFileBtn;
    this.newFolderBtn = newFolderBtn;
    this.refreshBtn = refreshBtn;
    this.collapseAllBtn = collapseAllBtn;
    this.treeController = treeController;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.newFileBtn?.addEventListener('click', () => this.promptNew('leaf'));
    this.newFolderBtn?.addEventListener('click', () => this.promptNew('container'));
    this.refreshBtn?.addEventListener('click', () => this.treeController.refresh());
    this.collapseAllBtn?.addEventListener('click', () => this.treeController.collapseAll());
  }

  /** Registers what actually creates the item (the app's job, FR-X4). */
  public setNewItemHandler(fn: (req: NewItemRequest & { name: string; parentId?: string }) => void): void {
    this.newItemHandler = fn;
  }

  private promptNew(type: 'leaf' | 'container'): void {
    if (!this.treeController.getRoot()) return;
    const parentId = this.treeController.resolveNewItemParentId();
    this.treeController.promptNewItem({
      type,
      parentId,
      onCommit: (result) => {
        this.newItemHandler?.({ type, name: result.name, parentId: result.parentId });
      },
    });
  }

  /**
   * App can add actions to the left of the shell's four (FR-I10, FR-X2, D-6, D-31).
   */
  public addAppAction(action: ViewAction): void {
    this.appActions.push(action);
    this.renderAppActions();
  }

  public getAppActions(): readonly ViewAction[] {
    return this.appActions;
  }

  private renderAppActions(): void {
    if (!this.appActionsEl) return;
    this.appActionsEl.innerHTML = '';

    for (const act of this.appActions) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-action-btn app-action-btn';
      btn.setAttribute('data-id', act.id);
      btn.title = act.title;
      btn.setAttribute('aria-label', act.title);

      const icon = document.createElement('i');
      icon.className = `codicon ${act.iconClass}`;
      btn.appendChild(icon);

      btn.addEventListener('click', () => act.action());
      this.appActionsEl.appendChild(btn);
    }
    this.syncClippedAppActions();
  }

  /**
   * A13 R3 Major: at a narrow explorer the app-action box clips (it gives up
   * space before the shell four ever do). A button that is clipped out of view
   * must also leave the tab order and the a11y tree, so focus never lands on
   * an invisible command. Re-checked whenever the box resizes.
   */
  private clipObserver: ResizeObserver | null = null;

  private syncClippedAppActions(): void {
    if (!this.appActionsEl) return;
    if (!this.clipObserver && typeof ResizeObserver !== 'undefined') {
      this.clipObserver = new ResizeObserver(() => this.applyClipState());
      this.clipObserver.observe(this.appActionsEl);
    }
    this.applyClipState();
  }

  private applyClipState(): void {
    if (!this.appActionsEl) return;
    const boxRight = this.appActionsEl.getBoundingClientRect().right;
    for (const btn of Array.from(this.appActionsEl.children) as HTMLElement[]) {
      const clipped = btn.getBoundingClientRect().right > boxRight + 0.5;
      btn.tabIndex = clipped ? -1 : 0;
      if (clipped) btn.setAttribute('aria-hidden', 'true');
      else btn.removeAttribute('aria-hidden');
    }
  }
}
