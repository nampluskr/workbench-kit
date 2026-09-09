import {
  createDockview,
  DockviewApi,
  DockviewGroupPanel,
  IDockviewPanel,
  IContentRenderer,
  IHeaderActionsRenderer,
  IGroupHeaderProps,
  GroupPanelPartInitParameters,
  Direction,
  DockviewPanelRenderer,
} from 'dockview-core';

export interface EditorOpenOptions {
  renderer?: DockviewPanelRenderer;
  isUserCreatedEmptyTab?: boolean;
}

export interface PanelContentState {
  targetId: string | null;
  isUserCreatedEmptyTab: boolean;
  creationCount: number;
  disposalCount: number;
  instanceStamp: string;
  isDirty: boolean;
}

/**
 * Custom content renderer for editor panels.
 * Tracks lifecycle creation and disposal counts (FR-E1 ~ FR-E5).
 */
export class EditorContentRenderer implements IContentRenderer {
  public readonly element: HTMLElement;
  public creationCount = 0;
  public disposalCount = 0;
  public instanceStamp: string;
  public params: any = {};
  public isShown = false;
  private timer: any = null;
  private timerTicks = 0;
  public domStateValue = '';

  constructor() {
    this.creationCount++;
    this.instanceStamp = 'stamp-' + Math.random().toString(36).slice(2, 10);
    this.element = document.createElement('div');
    this.element.className = 'editor-panel-content';

    // Live continuous state tracking (FR-E1 ~ FR-E5, D-24)
    this.timer = setInterval(() => {
      this.timerTicks++;
    }, 50);
  }

  public getTimerTicks(): number {
    return this.timerTicks;
  }

  public init(parameters: GroupPanelPartInitParameters): void {
    this.params = parameters.params || {};
    this.updateContent();
  }

  public onShow(): void {
    this.isShown = true;
  }

  public onHide(): void {
    this.isShown = false;
  }

  public updateContent(): void {
    this.element.setAttribute('data-instance-stamp', this.instanceStamp);
    if (this.params.targetId) {
      this.element.setAttribute('data-target-id', this.params.targetId);
      this.element.textContent = `Content of ${this.params.targetId}`;
      if (this.domStateValue) {
        const stateEl = document.createElement('span');
        stateEl.className = 'dom-state-tag';
        stateEl.textContent = this.domStateValue;
        this.element.appendChild(stateEl);
      }
    } else {
      // Empty tab: strictly 0 child elements and 0 text (FR-C2)
      this.element.innerHTML = '';
      this.element.removeAttribute('data-target-id');
    }
  }

  public setDomState(val: string): void {
    this.domStateValue = val;
    this.updateContent();
  }

  public update(event: any): void {
    if (event.params) {
      this.params = { ...this.params, ...event.params };
      this.updateContent();
    }
  }

  public dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.disposalCount++;
    this.element.remove();
  }
}

export type EditorComponentFactory = (options: { id: string; name: string }) => IContentRenderer;

/**
 * Group header action buttons for each tab bar (FR-C1, FR-D1, FR-D2).
 * Renders in exact required order (D-13, D-15, FR-C1):
 * 1. 'Split Right' button (Split Horizontal)
 * 2. 'Split Down' button (Split Vertical)
 * 3. '+' button (New Tab) - located at the RIGHT END!
 */
export class EditorHeaderActionsRenderer implements IHeaderActionsRenderer {
  public readonly element: HTMLElement;
  private group: DockviewGroupPanel | null = null;

  constructor(private editorController: EditorController) {
    this.element = document.createElement('div');
    this.element.className = 'editor-group-header-actions';
  }

  public init(params: IGroupHeaderProps): void {
    this.group = params.group as DockviewGroupPanel;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <button class="editor-action-btn tab-action-split-right" title="Split Right (Ctrl+\\)" aria-label="Split Right">
        <i class="codicon codicon-split-horizontal"></i>
      </button>
      <button class="editor-action-btn tab-action-split-down" title="Split Down" aria-label="Split Down">
        <i class="codicon codicon-split-vertical"></i>
      </button>
      <button class="editor-action-btn tab-action-new" title="New Tab" aria-label="New Tab">
        <i class="codicon codicon-plus"></i>
      </button>
    `;

    const splitRightBtn = this.element.querySelector('.tab-action-split-right') as HTMLButtonElement | null;
    const splitDownBtn = this.element.querySelector('.tab-action-split-down') as HTMLButtonElement | null;
    const newBtn = this.element.querySelector('.tab-action-new') as HTMLButtonElement | null;

    splitRightBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.group) {
        this.editorController.splitGroup(this.group, 'right');
      }
    });

    splitDownBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.group) {
        this.editorController.splitGroup(this.group, 'below');
      }
    });

    newBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.group) {
        this.editorController.addNewTab(this.group);
      }
    });
  }

  public dispose(): void {
    this.element.remove();
  }
}

/**
 * Controller for editor area, managing dockview-core layout, tabs, panes, and lifespan.
 */
export class EditorController {
  private api: DockviewApi;
  private panelCounter = 0;
  private contentRenderers = new Map<string, IContentRenderer>();
  private activePanelChangeListeners: ((panel: IDockviewPanel | undefined) => void)[] = [];
  private layoutChangeListeners: (() => void)[] = [];
  private customComponentFactory: EditorComponentFactory | null = null;
  public readonly panelLifecycleStats = new Map<string, {
    creationCount: number;
    disposalCount: number;
    instanceStamps: string[];
  }>();

  constructor(private container: HTMLElement) {
    this.api = createDockview(this.container, {
      theme: {
        name: 'custom',
        className: 'workbench-dockview-theme',
      },
      disableFloatingGroups: true,
      noPanelsOverlay: 'emptyGroup',
      createComponent: (options) => {
        let stats = this.panelLifecycleStats.get(options.id);
        if (!stats) {
          stats = { creationCount: 0, disposalCount: 0, instanceStamps: [] };
          if (this.panelLifecycleStats.size >= 100) {
            const oldestKey = this.panelLifecycleStats.keys().next().value;
            if (oldestKey) {
              this.panelLifecycleStats.delete(oldestKey);
            }
          }
          this.panelLifecycleStats.set(options.id, stats);
        }
        stats.creationCount++;

        let renderer: IContentRenderer;
        if (this.customComponentFactory) {
          renderer = this.customComponentFactory(options);
          if (typeof (renderer as any).init !== 'function') {
            (renderer as any).init = () => {};
          }
          if (typeof (renderer as any).update !== 'function') {
            (renderer as any).update = () => {};
          }
        } else {
          renderer = new EditorContentRenderer();
        }

        const stamp = (renderer as any).instanceStamp || ('stamp-' + Math.random().toString(36).slice(2, 10));
        stats.instanceStamps.push(stamp);
        this.contentRenderers.set(options.id, renderer);

        const originalDispose = renderer.dispose ? renderer.dispose.bind(renderer) : null;
        renderer.dispose = () => {
          stats!.disposalCount++;
          try {
            if (originalDispose) {
              originalDispose();
            }
          } finally {
            this.contentRenderers.delete(options.id);
          }
        };

        return renderer;
      },
      createRightHeaderActionComponent: () => {
        return new EditorHeaderActionsRenderer(this);
      },
    });

    // Ensure initial state has strictly 1 group and 0 panels (FR-K2, D-20, D-26)
    if (this.api.size === 0) {
      this.api.addGroup();
    }

    this.api.onDidActivePanelChange((event) => {
      this.activePanelChangeListeners.forEach((cb) => cb(event.panel));
    });

    this.api.onDidLayoutChange(() => {
      this.layoutChangeListeners.forEach((cb) => cb());
    });
  }

  public setComponentFactory(factory: EditorComponentFactory | null): void {
    this.customComponentFactory = factory;
  }

  public getLifecycleStats(panelId: string) {
    return this.panelLifecycleStats.get(panelId) || {
      creationCount: 0,
      disposalCount: 0,
      instanceStamps: [],
    };
  }

  public clearLifecycleStats(): void {
    this.panelLifecycleStats.clear();
  }

  public getApi(): DockviewApi {
    return this.api;
  }

  /**
   * Clears all panels and groups, ensuring exactly 1 empty group remains (FR-K2, D-20, D-26).
   */
  public clear(): void {
    this.api.clear();
    this.contentRenderers.clear();
    this.panelLifecycleStats.clear();
    if (this.api.groups.length === 0) {
      this.api.addGroup();
    }
    const rect = this.container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.api.layout(rect.width, rect.height);
    }
  }

  public getGroups(): DockviewGroupPanel[] {
    return this.api.groups;
  }

  public getGroupCount(): number {
    return this.api.size;
  }

  public getPanels(): IDockviewPanel[] {
    return this.api.panels;
  }

  public getPanelCount(): number {
    return this.api.totalPanels;
  }

  public getActiveGroup(): DockviewGroupPanel | undefined {
    return this.api.activeGroup || this.api.groups[0];
  }

  public getActivePanel(): IDockviewPanel | undefined {
    return this.api.activePanel;
  }

  public getContentRenderer(panelId: string): IContentRenderer | undefined {
    return this.contentRenderers.get(panelId);
  }

  /**
   * Adds a new blank tab to the specified group (or active group) (FR-C1).
   * Tab is appended at the right end and activated.
   */
  public addNewTab(targetGroup?: DockviewGroupPanel): IDockviewPanel {
    const group = targetGroup || this.getActiveGroup() || this.api.groups[0];
    const id = `tab-${++this.panelCounter}`;

    const panel = this.api.addPanel({
      id,
      component: 'editor-panel',
      title: 'Untitled',
      position: {
        referenceGroup: group,
        direction: 'within',
      },
      params: {
        isUserCreatedEmptyTab: true,
        targetId: null,
      },
    });

    panel.api.setActive();
    return panel;
  }

  public setActiveGroup(group: DockviewGroupPanel): void {
    if ((this.api as any).component?.doSetGroupAndPanelActive) {
      (this.api as any).component.doSetGroupAndPanelActive(group);
    }
  }

  /**
   * Opens an item in accordance with D-5 and FR-B1 ~ FR-B4.
   * - If active tab is user-created empty tab: opens in that tab (FR-B3).
   * - If item already open elsewhere: relocates to existing tab without creating new tab (FR-B2).
   * - Otherwise: replaces content of active tab without increasing tab count (FR-B1).
   * - If active group is empty pane: opens as first tab in that pane (FR-J8).
   */
  public openItem(
    targetId: string,
    title?: string,
    options?: EditorOpenOptions,
    targetGroup?: DockviewGroupPanel
  ): IDockviewPanel {
    const displayTitle = title || targetId.split(/[\/\\]/).pop() || targetId;
    const requestedRenderer = options?.renderer || 'onlyWhenVisible';
    const group = targetGroup || this.getActiveGroup() || this.api.groups[0];
    const activePanel = group?.activePanel;

    // Rule FR-B3: If active tab in target group is a user-created empty tab, open in it even if duplicate
    if (activePanel && activePanel.params?.isUserCreatedEmptyTab && !activePanel.params?.targetId) {
      activePanel.setTitle(displayTitle);
      activePanel.api.setRenderer(requestedRenderer);
      activePanel.update({
        params: {
          targetId,
          isUserCreatedEmptyTab: false,
        },
      });
      activePanel.api.setActive();
      return activePanel;
    }

    // Rule FR-B2: Target is already open in any panel across workbench -> jump to it (D-5)
    const existingPanel = this.api.panels.find((p) => p.params?.targetId === targetId);
    if (existingPanel) {
      existingPanel.api.setActive();
      return existingPanel;
    }

    // Rule FR-B1: Target not open anywhere; update active tab in place without increasing tab count
    if (activePanel) {
      activePanel.setTitle(displayTitle);
      activePanel.api.setRenderer(requestedRenderer);
      activePanel.update({
        params: {
          targetId,
          isUserCreatedEmptyTab: false,
        },
      });
      activePanel.api.setActive();
      return activePanel;
    }

    // Rule FR-J8: If group has 0 panels (empty pane), open first tab in it
    const id = `tab-${++this.panelCounter}`;
    const panel = this.api.addPanel({
      id,
      component: 'editor-panel',
      title: displayTitle,
      renderer: requestedRenderer,
      position: {
        referenceGroup: group,
        direction: 'within',
      },
      params: {
        targetId,
        isUserCreatedEmptyTab: false,
      },
    });

    panel.api.setActive();
    return panel;
  }

  /**
   * Spatially locates the most appropriate beside group (to the right, or left if right is absent).
   * In 2D layouts, prioritizes groups that share vertical coordinate alignment (FR-A14, D-19).
   */
  public findBesideGroup(group: DockviewGroupPanel): DockviewGroupPanel | undefined {
    const from = group.element.getBoundingClientRect();
    const candidates = this.api.groups.filter(
      (g) => g !== group && g.api.location.type === 'grid'
    );

    // 1. Look for candidate groups strictly to the right
    const rightCandidates = candidates.filter((g) => {
      const rect = g.element.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - (from.left + from.width / 2);
      const dy = rect.top + rect.height / 2 - (from.top + from.height / 2);
      return dx > 0 && Math.abs(dx) >= Math.abs(dy) - 10;
    });

    if (rightCandidates.length > 0) {
      rightCandidates.sort((a, b) => {
        const ra = a.element.getBoundingClientRect();
        const rb = b.element.getBoundingClientRect();
        const dxa = ra.left - from.left;
        const dxb = rb.left - from.left;
        if (Math.abs(dxa - dxb) > 20) {
          return dxa - dxb;
        }
        return Math.abs(ra.top - from.top) - Math.abs(rb.top - from.top);
      });
      return rightCandidates[0];
    }

    const dvRight = this.api.adjacentGroupInDirection(group, 'right');
    if (dvRight) {
      return dvRight as DockviewGroupPanel;
    }

    // 2. Fallback to left neighbor
    const leftCandidates = candidates.filter((g) => {
      const rect = g.element.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - (from.left + from.width / 2);
      const dy = rect.top + rect.height / 2 - (from.top + from.height / 2);
      return dx < 0 && Math.abs(dx) >= Math.abs(dy) - 10;
    });

    if (leftCandidates.length > 0) {
      leftCandidates.sort((a, b) => {
        const ra = a.element.getBoundingClientRect();
        const rb = b.element.getBoundingClientRect();
        const dxa = Math.abs(ra.left - from.left);
        const dxb = Math.abs(rb.left - from.left);
        if (Math.abs(dxa - dxb) > 20) {
          return dxa - dxb;
        }
        return Math.abs(ra.top - from.top) - Math.abs(rb.top - from.top);
      });
      return leftCandidates[0];
    }

    const dvLeft = this.api.adjacentGroupInDirection(group, 'left');
    if (dvLeft) {
      return dvLeft as DockviewGroupPanel;
    }

    return undefined;
  }

  /**
   * Opens an item in the beside pane (FR-A14, Ctrl+Enter, FR-I4).
   * - First checks workbench-wide duplicate rule (FR-B2, D-5).
   * - Spatially locates adjacent group (FR-A14, D-19, FR-D6).
   * - If no horizontal neighbor exists: splits right and opens in the new pane.
   * - If adjacent group exists: opens in that beside group.
   */
  public openBeside(
    targetId: string,
    title?: string,
    options?: EditorOpenOptions
  ): IDockviewPanel {
    // Rule FR-B2: If target is already open anywhere across workbench, jump to it (FR-B2, D-5)
    const existingPanel = this.api.panels.find((p) => p.params?.targetId === targetId);
    if (existingPanel) {
      existingPanel.api.setActive();
      return existingPanel;
    }

    const activeGroup = this.getActiveGroup() || this.api.groups[0];

    // Spatially locate adjacent beside group (FR-A14, D-19)
    const besideGroup = this.findBesideGroup(activeGroup);

    if (!besideGroup) {
      // No horizontal neighbor exists: split right
      const beside = this.splitGroup(activeGroup, 'right');
      return this.openItem(targetId, title, options, beside);
    }

    // Spatial beside group exists: open in it
    this.setActiveGroup(besideGroup);
    return this.openItem(targetId, title, options, besideGroup);
  }

  /**
   * Splits a group in the specified direction (FR-D1, FR-D2).
   */
  public splitGroup(group: DockviewGroupPanel, direction: 'right' | 'below'): DockviewGroupPanel {
    const dir: Direction = direction === 'right' ? 'right' : 'below';
    return this.api.addGroup({
      referenceGroup: group,
      direction: dir,
    });
  }

  /**
   * Splits active group in the specified direction (FR-D3).
   */
  public splitActiveGroup(direction: 'right' | 'below'): DockviewGroupPanel | undefined {
    const group = this.getActiveGroup();
    if (!group) return undefined;
    return this.splitGroup(group, direction);
  }

  /**
   * Closes the active tab in the active group (FR-N6b, Ctrl+W, FR-C3).
   * When the last tab of a group closes:
   * - If other groups exist, that group disappears (FR-C4, FR-J1).
   * - If it is the last group, it remains as an empty pane (FR-C4, FR-J7).
   */
  public closeActiveTab(): void {
    const activeGroup = this.getActiveGroup();
    const activePanel = activeGroup?.activePanel;
    if (activePanel) {
      this.closePanel(activePanel);
    }
  }

  /**
   * Closes a specific panel and disposes its view (FR-E3).
   * Preserves empty group if it is the last panel in the workbench (FR-C4, FR-J7).
   */
  public closePanel(panel: IDockviewPanel): void {
    const isLastPanelInWorkbench = this.api.totalPanels === 1 && this.api.groups.length === 1;
    if (isLastPanelInWorkbench) {
      (this.api as any).component.removePanel(panel, { removeEmptyGroup: false });
    } else {
      (this.api as any).component.removePanel(panel, { removeEmptyGroup: true });
    }
    if (this.api.groups.length === 0) {
      this.api.addGroup();
    }
  }

  /**
   * Closes all tabs in the specified group (or active group) (FR-J2).
   * If other groups exist, that group disappears (FR-J1).
   * If it is the last group, it remains as an empty pane (FR-J2, FR-J7).
   * If already an empty pane, changes nothing (FR-J4).
   */
  public closeAllTabsInGroup(targetGroup?: DockviewGroupPanel): void {
    const group = targetGroup || this.getActiveGroup();
    if (!group) return;

    const panels = [...group.panels];
    if (panels.length === 0) {
      // Empty group: already empty, nothing changes (FR-J4)
      return;
    }

    const isLastGroupInWorkbench = this.api.groups.length === 1;
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const isLastInThisOperation = isLastGroupInWorkbench && i === panels.length - 1;
      (this.api as any).component.removePanel(panel, {
        removeEmptyGroup: !isLastInThisOperation,
      });
    }
    if (this.api.groups.length === 0) {
      this.api.addGroup();
    }
  }

  /**
   * Sets tab dirty indicator (●) (FR-L1).
   */
  public setTabDirty(panelId: string, dirty: boolean): void {
    const panel = this.api.getPanel(panelId);
    if (!panel) return;

    const baseTitle = (panel.title || '').replace(/^●\s*/, '');
    const newTitle = dirty ? `● ${baseTitle}` : baseTitle;
    panel.setTitle(newTitle);
    panel.update({ params: { isDirty: dirty } });
  }

  /**
   * Subscribes to active panel changes.
   */
  public onActivePanelChange(callback: (panel: IDockviewPanel | undefined) => void): () => void {
    this.activePanelChangeListeners.push(callback);
    return () => {
      this.activePanelChangeListeners = this.activePanelChangeListeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Subscribes to layout mutations and changes.
   */
  public onLayoutChange(callback: () => void): () => void {
    this.layoutChangeListeners.push(callback);
    return () => {
      this.layoutChangeListeners = this.layoutChangeListeners.filter((cb) => cb !== callback);
    };
  }
}
