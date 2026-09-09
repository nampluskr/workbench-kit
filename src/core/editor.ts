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
import { ConfirmDialogController } from './dialog';

/**
 * Returns whether the save succeeded. On a falsy result the shell keeps the
 * tab open (D-28) instead of closing it (FR-P7: the shell performs 0 save
 * actions itself — this only calls out to whatever the app registered).
 */
export type SaveHandler = (panelId: string) => Promise<boolean> | boolean;

export interface EditorOpenOptions {
  renderer?: DockviewPanelRenderer;
  isUserCreatedEmptyTab?: boolean;
  /**
   * Opaque metadata the caller attaches to a panel (FR-I1, D-4, NFR-1).
   * The shell stores and forwards this bag without inspecting its keys or
   * values, so registering a new resource kind never requires a core change.
   */
  meta?: Record<string, unknown>;
}

export interface PanePlacement {
  groupId: string;
  targets: (string | null)[];
}

export interface OpenedPanelHandle {
  id: string;
}

/**
 * The entire surface the shell exposes to app code (presets, registry
 * helpers) that opens or inspects panes (FR-I4, FR-I5, FR-I8, C-9). It
 * deliberately excludes every method that creates, closes, or moves a tab
 * or pane (addNewTab, closePanel, splitGroup, ...) — those stay shell-only.
 * Note it does not take a `targetGroup` parameter and returns a plain
 * `{ id }` handle rather than the real dockview panel/group objects, so
 * holding this surface gives no path back to dockview's own API (Critical
 * finding, round 1: `AppEditorSurface` must not leak `IDockviewPanel` or
 * `DockviewGroupPanel`). Build one with `createAppEditorSurface()` below —
 * `EditorController` itself is deliberately NOT assignable to this type.
 */
export interface AppEditorSurface {
  /**
   * Async because it may need to ask first (FR-L2, D-28) when the target
   * group's active tab is dirty and would otherwise be silently replaced
   * in place (FR-B1, round-1 adversarial finding). Resolves to null if the
   * user cancels.
   */
  openItem(targetId: string, title?: string, options?: EditorOpenOptions): Promise<OpenedPanelHandle | null>;
  openBeside(targetId: string, title?: string, options?: EditorOpenOptions): Promise<OpenedPanelHandle | null>;
  queryPanePlacement(panelId?: string): { own: PanePlacement; beside: PanePlacement | null } | undefined;
  /** Reports "changed"/"saved" state for the ● indicator (FR-L1, FR-P7). Draws only — no structural change. */
  setTabDirty(panelId: string, dirty: boolean): void;
  /** Registers what "save" does; the shell calls this only when the user picks the Save button (FR-P7, D-28). */
  setSaveHandler(fn: SaveHandler | null): void;
}

/**
 * Builds a genuinely narrow, non-castable view of an EditorController: each
 * method here constructs a fresh plain object at runtime, so there is no
 * dockview panel/group reference for app code to reach through even via a
 * type cast (FR-I8, C-9).
 */
export function createAppEditorSurface(controller: EditorController): AppEditorSurface {
  return {
    async openItem(targetId, title, options) {
      if (!(await controller.confirmReplaceIfDirty())) return null;
      const panel = controller.openItem(targetId, title, options);
      return { id: panel.id };
    },
    async openBeside(targetId, title, options) {
      const activeGroup = controller.getActiveGroup();
      const besideGroup = activeGroup ? controller.findBesideGroup(activeGroup) : undefined;
      if (besideGroup && !(await controller.confirmReplaceIfDirty(besideGroup))) return null;
      const panel = controller.openBeside(targetId, title, options);
      return { id: panel.id };
    },
    queryPanePlacement(panelId) {
      return controller.queryPanePlacement(panelId);
    },
    setTabDirty(panelId, dirty) {
      controller.setTabDirty(panelId, dirty);
    },
    setSaveHandler(fn) {
      controller.setSaveHandler(fn);
    },
  };
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
  private saveHandler: SaveHandler | null = null;
  private dialogController: ConfirmDialogController | null = null;
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

  /** Registers what "save" does (FR-P7, D-28). The shell never saves itself. */
  public setSaveHandler(fn: SaveHandler | null): void {
    this.saveHandler = fn;
  }

  /** Wires the confirm-dialog device the shell uses before a dirty tab or the app closes (D-28). */
  public setDialogController(dialog: ConfirmDialogController): void {
    this.dialogController = dialog;
  }

  public hasDirtyPanels(): boolean {
    return this.api.panels.some((p) => Boolean(p.params?.isDirty));
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
    this.wirePanelClose(panel);

    panel.api.setActive();
    return panel;
  }

  /**
   * Routes every close of this panel — the tab's own close button
   * (dockview calls `panel.api.close()` directly, bypassing our methods),
   * `Ctrl+W`, the File menu, and our own `closePanel`/`closeAllTabsInGroup`
   * — through the same dirty-confirmation gate (FR-L2, FR-L6, D-28).
   */
  private wirePanelClose(panel: IDockviewPanel): void {
    const rawClose = () => {
      const isLastPanelInWorkbench = this.api.totalPanels === 1 && this.api.groups.length === 1;
      (this.api as any).component.removePanel(panel, { removeEmptyGroup: !isLastPanelInWorkbench });
      if (this.api.groups.length === 0) {
        this.api.addGroup();
      }
    };
    // Cast past the `(): void` typing: the real return value is a Promise,
    // and every caller here (dockview's own tab button included) only ever
    // fires this from a click/keydown handler or `await`s it — both work
    // whether or not the declared type says `void` (TS's `await` on any
    // runtime thenable still suspends correctly regardless of static type).
    (panel.api as unknown as { close: () => Promise<boolean> }).close = () => this.confirmAndClose(panel, rawClose);
  }

  /**
   * If the panel is dirty, asks the user via the confirm-dialog device
   * before proceeding (FR-L2 ~ FR-L7). An unmodified tab closes with 0
   * dialogs (FR-L7). Saving calls only the app-registered handler — the
   * shell itself performs 0 save actions (FR-P7). Returns whether the panel
   * actually closed, so a caller closing several panels in sequence (FR-J2)
   * can stop at the first Cancel instead of proceeding to the next one.
   */
  private async confirmAndClose(panel: IDockviewPanel, rawClose: () => void): Promise<boolean> {
    const isDirty = Boolean(panel.params?.isDirty);
    if (!isDirty || !this.dialogController) {
      rawClose();
      return true;
    }
    const choice = await this.dialogController.show(`저장하지 않은 변경 내용이 있습니다: ${panel.title || panel.id}`);
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      const ok = this.saveHandler ? await this.saveHandler(panel.id) : false;
      if (!ok) return false;
    }
    rawClose();
    return true;
  }

  /**
   * Synchronous dirty check for the target group's active tab — the thing
   * `confirmReplaceIfDirty` would need to ask about. Callers use this to
   * stay on the old synchronous open path in the common (clean) case, so a
   * confirmation-capable call site does not force every open through an
   * extra microtask tick (Phase 4's FR-A6/FR-B1~B4/FR-J8 acceptance tests
   * assert state immediately after a synchronous keydown/click with 0 waits).
   */
  public isActivePanelDirty(group?: DockviewGroupPanel): boolean {
    const targetGroup = group || this.getActiveGroup();
    return Boolean(targetGroup?.activePanel?.params?.isDirty);
  }

  /**
   * Round-1 adversarial finding (Critical): `openItem`'s FR-B1 in-place
   * replacement silently discarded whatever the target group's active tab
   * held, dirty or not. Callers that might replace a group's active tab in
   * place (tree selection, the app-facing surface) call this first and
   * skip the open when it resolves false.
   */
  public async confirmReplaceIfDirty(group?: DockviewGroupPanel): Promise<boolean> {
    const targetGroup = group || this.getActiveGroup();
    const activePanel = targetGroup?.activePanel;
    if (!this.isActivePanelDirty(targetGroup) || !this.dialogController) return true;
    const choice = await this.dialogController.show(`저장하지 않은 변경 내용이 있습니다: ${activePanel!.title || activePanel!.id}`);
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      const ok = this.saveHandler ? await this.saveHandler(activePanel!.id) : false;
      if (!ok) return false;
    }
    return true;
  }

  /**
   * Asks once before quitting when any tab is dirty (FR-L6). Returns
   * whether it is OK to proceed with quitting.
   */
  public async confirmQuit(): Promise<boolean> {
    if (!this.hasDirtyPanels() || !this.dialogController) return true;
    const choice = await this.dialogController.show('저장하지 않은 변경 내용이 있습니다.');
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      for (const panel of this.api.panels) {
        if (panel.params?.isDirty) {
          const ok = this.saveHandler ? await this.saveHandler(panel.id) : false;
          if (!ok) return false;
        }
      }
    }
    return true;
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
    // No path-shape assumption: a targetId is an opaque resource identifier,
    // not necessarily a filesystem path (round 2 Minor finding, INTENT 3).
    const displayTitle = title || targetId;
    const requestedRenderer = options?.renderer || 'onlyWhenVisible';
    const meta = options?.meta || {};
    const group = targetGroup || this.getActiveGroup() || this.api.groups[0];
    const activePanel = group?.activePanel;

    // Rule FR-B3: If active tab in target group is a user-created empty tab, open in it even if duplicate
    if (activePanel && activePanel.params?.isUserCreatedEmptyTab && !activePanel.params?.targetId) {
      activePanel.setTitle(displayTitle);
      activePanel.api.setRenderer(requestedRenderer);
      activePanel.update({
        params: {
          ...meta,
          targetId,
          isUserCreatedEmptyTab: false,
          // Round-2 adversarial finding (Major): dockview merges partial
          // params rather than replacing them, so a stale isDirty: true from
          // whatever this panel held before would otherwise survive into the
          // freshly (re)loaded content it no longer describes.
          isDirty: false,
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
          ...meta,
          targetId,
          isUserCreatedEmptyTab: false,
          // Round-2 adversarial finding (Major): see the FR-B3 branch above —
          // the confirm-then-discard path already asked about (and gave up)
          // whatever this panel held; the freshly loaded content must start
          // clean, not inherit a stale isDirty: true from a dockview param merge.
          isDirty: false,
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
        ...meta,
        targetId,
        isUserCreatedEmptyTab: false,
      },
    });
    this.wirePanelClose(panel);

    panel.api.setActive();
    return panel;
  }

  /**
   * Reports the caller's own group and the targets currently open in the
   * spatially adjacent group (FR-I5, D-19). The shell only reports pane
   * placement; it never performs the copy/move itself (INTENT 3).
   */
  public queryPanePlacement(panelId?: string): { own: PanePlacement; beside: PanePlacement | null } | undefined {
    const panel = panelId ? this.api.getPanel(panelId) : this.getActivePanel();
    const group = panel?.group || this.getActiveGroup();
    if (!group) return undefined;

    const own: PanePlacement = {
      groupId: group.id,
      targets: group.panels.map((p) => (p.params?.targetId as string | undefined) ?? null),
    };

    const besideGroup = this.findBesideGroup(group);
    const beside: PanePlacement | null = besideGroup
      ? {
          groupId: besideGroup.id,
          targets: besideGroup.panels.map((p) => (p.params?.targetId as string | undefined) ?? null),
        }
      : null;

    return { own, beside };
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
  public async closeActiveTab(): Promise<void> {
    const activeGroup = this.getActiveGroup();
    const activePanel = activeGroup?.activePanel;
    if (activePanel) {
      await this.closePanel(activePanel);
    }
  }

  /**
   * Closes a specific panel and disposes its view (FR-E3), asking first if
   * it is dirty (FR-L2 ~ FR-L7, D-28). Preserves empty group if it is the
   * last panel in the workbench (FR-C4, FR-J7).
   */
  public async closePanel(panel: IDockviewPanel): Promise<boolean> {
    return (panel.api as unknown as { close: () => Promise<boolean> }).close();
  }

  /**
   * Closes all tabs in the specified group (or active group) (FR-J2),
   * asking first for each dirty tab (D-28).
   * If other groups exist, that group disappears (FR-J1).
   * If it is the last group, it remains as an empty pane (FR-J2, FR-J7).
   * If already an empty pane, changes nothing (FR-J4).
   */
  public async closeAllTabsInGroup(targetGroup?: DockviewGroupPanel): Promise<void> {
    const group = targetGroup || this.getActiveGroup();
    if (!group) return;

    const panels = [...group.panels];
    if (panels.length === 0) {
      // Empty group: already empty, nothing changes (FR-J4)
      return;
    }

    for (const panel of panels) {
      const closed = await this.closePanel(panel);
      if (!closed) break;
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
