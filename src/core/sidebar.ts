import { TreeController } from './tree';

export interface ViewAction {
  id: string;
  title: string;
  iconClass: string;
  action: () => void;
}

export class ExplorerTitlebarController {
  private headerEl: HTMLElement;
  private appActionsEl: HTMLElement;
  private collapseAllBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;
  private treeController: TreeController;
  private appActions: ViewAction[] = [];

  constructor(
    headerEl: HTMLElement,
    appActionsEl: HTMLElement,
    collapseAllBtn: HTMLButtonElement,
    refreshBtn: HTMLButtonElement,
    treeController: TreeController
  ) {
    this.headerEl = headerEl;
    this.appActionsEl = appActionsEl;
    this.collapseAllBtn = collapseAllBtn;
    this.refreshBtn = refreshBtn;
    this.treeController = treeController;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Collapse All (FR-A20, FR-A21, D-30)
    if (this.collapseAllBtn) {
      this.collapseAllBtn.addEventListener('click', () => {
        this.treeController.collapseAll();
      });
    }

    // Refresh tree (FR-A20, FR-A22, D-30)
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => {
        this.treeController.refresh();
      });
    }
  }

  /**
   * App can add actions to the left of the two shell actions (FR-I10, D-30, D-31).
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
  }
}
