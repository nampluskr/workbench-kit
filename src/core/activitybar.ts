export interface ActivityBarItem {
  id: string;
  label: string;
  iconClass: string;
  action?: () => void;
}

export const DEFAULT_ACTIVITY_BAR_TOP_ITEMS: ActivityBarItem[] = [
  { id: 'activity:toggle-sidebar', label: '탐색기 접기/펴기', iconClass: 'codicon-files' },
  { id: 'activity:toggle-titlebar', label: '상단 바 감추기/보이기', iconClass: 'codicon-chevron-up' },
  { id: 'activity:toggle-statusbar', label: '하단 바 감추기/보이기', iconClass: 'codicon-chevron-down' },
  { id: 'activity:split-horizontal', label: '좌우 스플릿', iconClass: 'codicon-split-horizontal' },
  { id: 'activity:split-vertical', label: '상하 스플릿', iconClass: 'codicon-split-vertical' },
  { id: 'activity:zen-mode', label: 'Zen 모드', iconClass: 'codicon-screen-full' },
];

export const DEFAULT_ACTIVITY_BAR_BOTTOM_ITEMS: ActivityBarItem[] = [
  { id: 'activity:cycle-color-theme', label: '테마 바꾸기', iconClass: 'codicon-color-mode' },
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
