export interface ActivityBarItem {
  id: string;
  label: string;
  iconClass: string;
  action?: () => void;
}

/*
 * v0.2 D-3: the Activity Bar holds only the toggles that show and hide areas,
 * placed to match the screen — the title bar toggle first, the status bar
 * toggle last. Zen and the colour theme moved beside the window controls;
 * splitting stays in each group's header and in the menu.
 */
export const DEFAULT_ACTIVITY_BAR_TOP_ITEMS: ActivityBarItem[] = [
  { id: 'activity:toggle-titlebar', label: 'Toggle Title Bar', iconClass: 'codicon-chevron-up' },
  { id: 'activity:toggle-sidebar', label: 'Toggle Explorer', iconClass: 'codicon-files' },
];

export const DEFAULT_ACTIVITY_BAR_BOTTOM_ITEMS: ActivityBarItem[] = [
  { id: 'activity:toggle-statusbar', label: 'Toggle Status Bar', iconClass: 'codicon-chevron-down' },
];

export class ActivityBarController {
  private topItems: ActivityBarItem[] = [...DEFAULT_ACTIVITY_BAR_TOP_ITEMS];
  private bottomItems: ActivityBarItem[] = [...DEFAULT_ACTIVITY_BAR_BOTTOM_ITEMS];

  constructor(
    private topContainer: HTMLElement,
    private bottomContainer: HTMLElement
  ) {
    this.render();
  }

  public getTopItems(): ActivityBarItem[] {
    return [...this.topItems];
  }

  public getBottomItems(): ActivityBarItem[] {
    return [...this.bottomItems];
  }

  public setTopItems(items: ActivityBarItem[]): void {
    this.topItems = [...items];
    this.render();
  }

  public setBottomItems(items: ActivityBarItem[]): void {
    this.bottomItems = [...items];
    this.render();
  }

  public getItems(): ActivityBarItem[] {
    return [...this.topItems, ...this.bottomItems];
  }

  public findItem(id: string): ActivityBarItem | undefined {
    return (
      this.topItems.find((it) => it.id === id) ||
      this.bottomItems.find((it) => it.id === id)
    );
  }

  public triggerItem(id: string): void {
    const item = this.findItem(id);
    if (item && item.action) {
      item.action();
    }
  }

  public setAction(id: string, action: () => void): void {
    const item = this.findItem(id);
    if (item) {
      item.action = action;
    }
  }

  public render(): void {
    this.renderGroup(this.topContainer, this.topItems);
    this.renderGroup(this.bottomContainer, this.bottomItems);
  }

  private renderGroup(container: HTMLElement, items: ActivityBarItem[]): void {
    container.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'activity-bar-item';
      btn.dataset.itemId = item.id;
      btn.title = item.label;
      btn.setAttribute('aria-label', item.label);

      const iconEl = document.createElement('i');
      iconEl.className = `codicon ${item.iconClass}`;
      btn.appendChild(iconEl);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.action) {
          item.action();
        }
      });

      container.appendChild(btn);
    });
  }
}
