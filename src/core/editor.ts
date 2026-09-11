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

/**
 * How firmly a tab holds its place (v0.2 D-1).
 *
 * - `preview` — a temporary spot. Opening something else in preview mode
 *   replaces it rather than adding a tab, so browsing costs one spot no
 *   matter how many things are looked at.
 * - `pinned` — the user said "keep this". It is never replaced; the next
 *   preview opens beside it.
 */
export type EditorOpenMode = 'preview' | 'pinned';

export interface EditorOpenOptions {
  renderer?: DockviewPanelRenderer;
  isUserCreatedEmptyTab?: boolean;
  /**
   * Defaults to `preview` (v0.2 FR-P1): a single pick is browsing until the
   * user confirms it.
   */
  mode?: EditorOpenMode;
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
        this.editorController.splitGroupForUser(this.group, 'right');
      }
    });

    splitDownBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.group) {
        this.editorController.splitGroupForUser(this.group, 'below');
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

    // Pressing anywhere in a group — its tab strip or its content — makes it
    // the focus area (v0.2 FR-F10, UT-FCS-003). dockview activates the group
    // but does not always move keyboard focus into it: a press on plain
    // content lands on a non-focusable element, which would leave the focus
    // mark behind in whatever area had it before. A surface that took focus
    // itself (an editor, a button) keeps it — only focus that ended up
    // outside the pressed group is pulled in, after the press has settled.
    this.container.addEventListener('pointerdown', (event) => {
      const pressed = event.target as HTMLElement | null;
      const groupEl = pressed?.closest?.('.dv-groupview') as HTMLElement | null;
      if (!groupEl) return;
      // A10 Major: a press on a control acts on its own — a dirty tab's close
      // button opens the confirmation dialog, which takes focus, and pulling
      // focus back into the group afterwards stole it from that dialog.
      if (pressed?.closest?.('.dv-default-tab-action, button, input, textarea, select, [contenteditable="true"]')) return;
      setTimeout(() => {
        if (groupEl.contains(document.activeElement)) return;
        // Whatever the press opened in the meantime (a dialog, a menu) keeps
        // the focus it took.
        const holder = document.activeElement as HTMLElement | null;
        if (holder?.closest?.('[role="dialog"], [role="alertdialog"], .workbench-confirm-overlay, .workbench-menu-dropdown, .workbench-context-menu')) return;
        const group = this.api.groups.find((g) => g.element === groupEl || g.element.contains(groupEl));
        if (group) this.focusGroup(group);
      }, 0);
    });

    // Double-pressing a tab title confirms it (FR-P6). Delegated from the
    // container because dockview owns — and rebuilds — the tab elements, so a
    // listener attached per tab would quietly disappear on the next relayout.
    this.container.addEventListener('dblclick', (event) => {
      const target = event.target as HTMLElement | null;
      const tab = target?.closest?.('.dv-tab') as HTMLElement | null;
      if (!tab) return;
      // Not the close button: that press means "go away", not "keep this".
      if (target?.closest?.('.dv-default-tab-action')) return;
      const panelId = tab.getAttribute('data-tab-panel-id');
      if (!panelId) return;
      const panel = this.api.getPanel(panelId);
      if (panel) this.pinPanel(panel);
    });

    // Dragging a tab into a different group confirms it (FR-P13, D-2 — human
    // decision after A9 R3-1). Carrying a tab to another group is already the
    // user saying "keep this here", and treating it as a confirm is what lets
    // FR-P10 (one preview per group) hold without auto-confirming a tab the
    // user never touched. A reorder inside the same group (from === to) is
    // not a confirm.
    this.api.onDidMovePanel((event) => {
      if (event.from === event.to) return;
      this.pinPanel(event.panel);
    });

    this.api.onDidLayoutChange(() => {
      // dockview rebuilds tab elements when panels move between groups or the
      // layout is restored, which drops the class carrying preview state. Put
      // it back before anyone reads the tab bar (FR-P9).
      this.refreshPreviewClasses();
      // Safety net only. A drag between groups is resolved above by confirming
      // the moved tab, so this should find nothing. It runs after the current
      // event turn so that the move handler always gets there first — run
      // synchronously it could confirm the tab the user did NOT move before
      // the moved one was confirmed, leaving both confirmed (A9 R3-1).
      queueMicrotask(() => {
        this.reconcilePreviewUniqueness();
        this.refreshPreviewClasses();
      });
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
        // Pressing [+] is the user asking for a place to keep, so the tab it
        // makes is confirmed, not the replaceable preview spot (FR-P10 allows
        // only one preview per group, and this must not compete for it).
        isPreview: false,
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
    // A12 Major: a bulk close (Close Editor Group / Close All Tabs) must not
    // half-empty the workspace and then stop at a Cancel. It confirms every
    // dirty tab up front and, only if none is cancelled, force-closes them all
    // through this raw path — no second per-tab prompt.
    (panel as unknown as { __rawClose: () => void }).__rawClose = rawClose;
  }

  /**
   * Confirms all the dirty panels in `panels` before any of them is closed
   * (A12 Major). Returns false the moment one is cancelled — with nothing
   * closed and nothing saved past that point — so the caller can abort the
   * whole bulk close. Clean panels need no confirmation (FR-L7).
   *
   * A12 R2 Critical: this never touches `isDirty`. `forceClosePanel` closes
   * the panel raw, bypassing the per-panel prompt, so there is no need to
   * "clear" the mark — and clearing it mid-loop would leave a panel falsely
   * clean if a *later* panel's prompt is then cancelled.
   */
  private async confirmCloseAll(panels: IDockviewPanel[]): Promise<boolean> {
    if (!this.dialogController) return true;
    for (const panel of panels) {
      if (!panel.params?.isDirty) continue;
      const choice = await this.dialogController.show(
        `Do you want to save the changes you made to ${panel.title || panel.id}?`
      );
      if (choice === 'cancel') return false;
      if (choice === 'save') {
        const ok = this.saveHandler ? await this.saveHandler(panel.id) : false;
        if (!ok) return false;
      }
    }
    return true;
  }

  /** Closes a panel through its raw path — no dirty prompt (see confirmCloseAll). */
  private forceClosePanel(panel: IDockviewPanel): void {
    (panel as unknown as { __rawClose?: () => void }).__rawClose?.();
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
    const choice = await this.dialogController.show(`Do you want to save the changes you made to ${panel.title || panel.id}?`);
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
   * Would a plain pick into this group overwrite unsaved content? Asks about
   * the panel that would actually be replaced — the preview spot, not whatever
   * happens to be active (A9 Round-1 Critical).
   */
  public isReplaceTargetDirty(group?: DockviewGroupPanel): boolean {
    return Boolean(this.resolveReplaceTarget(group)?.params?.isDirty);
  }

  /**
   * Round-1 adversarial finding (Critical): `openItem`'s in-place replacement
   * silently discarded whatever it overwrote, dirty or not. Callers that might
   * replace a tab in place (tree selection, the app-facing surface) call this
   * first and skip the open when it resolves false.
   *
   * A9 Round-1 (Critical): this used to always ask about the group's ACTIVE
   * tab, which stopped being the tab that gets replaced once v0.2 made a pick
   * land in the preview spot. With a clean confirmed tab active and a dirty
   * preview sitting beside it, no dialog appeared and the unsaved preview was
   * destroyed. Callers now name the panel they are about to overwrite.
   */
  public async confirmReplaceIfDirty(
    groupOrPanel?: DockviewGroupPanel | IDockviewPanel
  ): Promise<boolean> {
    const doomed = this.resolveReplaceTarget(groupOrPanel);
    if (!doomed?.params?.isDirty || !this.dialogController) return true;
    const choice = await this.dialogController.show(`Do you want to save the changes you made to ${doomed.title || doomed.id}?`);
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      const ok = this.saveHandler ? await this.saveHandler(doomed.id) : false;
      if (!ok) return false;
    }
    return true;
  }

  /**
   * Which panel a pick into `groupOrPanel` would overwrite: the panel itself
   * when one is named, otherwise that group's preview spot, and only failing
   * both its active tab (the pre-v0.2 answer, kept so callers that still pass
   * a group behave the way they always did when there is no preview).
   */
  private resolveReplaceTarget(
    groupOrPanel?: DockviewGroupPanel | IDockviewPanel
  ): IDockviewPanel | undefined {
    if (groupOrPanel && 'params' in groupOrPanel) return groupOrPanel as IDockviewPanel;
    const group = (groupOrPanel as DockviewGroupPanel | undefined) || this.getActiveGroup();
    return this.getPreviewPanel(group) || group?.activePanel;
  }

  /**
   * Asks once before quitting when any tab is dirty (FR-L6). Returns
   * whether it is OK to proceed with quitting.
   */
  public async confirmQuit(): Promise<boolean> {
    if (!this.hasDirtyPanels() || !this.dialogController) return true;
    const choice = await this.dialogController.show('Do you want to save the changes you made before closing?');
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

  /** The one preview tab a group may hold (FR-P10), if it has one. */
  public getPreviewPanel(group?: DockviewGroupPanel): IDockviewPanel | undefined {
    const target = group || this.getActiveGroup();
    if (!target) return undefined;
    return target.panels.find((p) => p.params?.isPreview === true);
  }

  /**
   * Confirms a tab: it stops being the replaceable preview spot and keeps its
   * place (FR-P4, FR-P6, FR-P7). Confirming an already-confirmed tab is a
   * no-op, so every confirm path can call this without checking first.
   */
  public pinPanel(panel: IDockviewPanel): void {
    if (!panel.params?.isPreview) return;
    panel.update({ params: { isPreview: false } });
    this.applyPreviewClass(panel);
  }

  /**
   * Mirrors a panel's preview state onto its rendered tab, because that is
   * where the user reads it (FR-P9). dockview owns the tab element, so this
   * toggles a class on it rather than re-rendering anything.
   */
  private applyPreviewClass(panel: IDockviewPanel): void {
    const el = document.querySelector(`.dv-tab[data-tab-panel-id="${panel.id}"]`);
    if (!el) return;
    el.classList.toggle('workbench-preview-tab', panel.params?.isPreview === true);
  }

  /** Re-applies preview marking to every tab, after dockview rebuilds them. */
  private refreshPreviewClasses(): void {
    for (const panel of this.api.panels) {
      this.applyPreviewClass(panel);
    }
  }

  /**
   * Restores "one preview spot per group" after the layout moved tabs around
   * (A9 Round-1, Critical).
   *
   * Dragging a preview tab into a group that already had one used to leave two
   * behind, and from then on a pick replaced whichever the lookup happened to
   * return first while the other stayed provisional forever. Nothing in the
   * drag path could prevent that, because dockview moves the panel itself.
   *
   * The survivor is the group's active panel when that is a preview — the one
   * the user is looking at — and otherwise the last in tab order. Everything
   * else in the group becomes confirmed, which is the safe direction: a tab
   * wrongly left provisional can be silently replaced, while one wrongly
   * confirmed merely takes up a place until the user closes it.
   */
  private reconcilePreviewUniqueness(): void {
    for (const group of this.api.groups) {
      const previews = group.panels.filter((p) => p.params?.isPreview === true);
      if (previews.length < 2) continue;
      const active = group.activePanel;
      const survivor =
        active && active.params?.isPreview === true ? active : previews[previews.length - 1];
      for (const panel of previews) {
        if (panel !== survivor) this.pinPanel(panel);
      }
    }
  }

  /**
   * Opens an item (v0.2 FR-P1 ~ FR-P8, FR-B2, FR-B4, FR-J8).
   *
   * The rule that changed in v0.2: a plain pick no longer overwrites whatever
   * tab happens to be active. It goes to the group's single preview spot,
   * creating that spot if there is none, so browsing never destroys something
   * the user chose to keep (v0.1 FR-B1/FR-B3 are superseded — SPEC 0.1).
   *
   * - Already open anywhere → jump to it (FR-B2). A confirming open also
   *   confirms the tab it landed on (FR-P7).
   * - `preview` and the group has a preview spot → replace it in place (FR-P2).
   * - Otherwise → add a tab, marked preview or not per `mode` (FR-P8).
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
    const mode: EditorOpenMode = options?.mode || 'preview';
    const group = targetGroup || this.getActiveGroup() || this.api.groups[0];

    // Rule FR-B2: Target is already open in any panel across workbench -> jump to it (D-5)
    const existingPanel = this.api.panels.find((p) => p.params?.targetId === targetId);
    if (existingPanel) {
      if (mode === 'pinned') this.pinPanel(existingPanel);
      existingPanel.api.setActive();
      return existingPanel;
    }

    // FR-P2: a preview open reuses the group's preview spot, replacing what is
    // shown there. A tab the user made with [+] is confirmed, so it is not a
    // candidate — browsing never overwrites it.
    // A preview spot that has never shown anything — the `Untitled` tab a
    // split starts with (FR-P11) — is taken by a confirming open too, so
    // pressing Enter there does not leave an empty tab behind beside it.
    const previewSpot = this.getPreviewPanel(group);
    const isBlankSpot = Boolean(
      previewSpot && previewSpot.params?.targetId == null && !previewSpot.params?.isDirty
    );
    const reusable = mode === 'preview' || isBlankSpot ? previewSpot : undefined;
    if (reusable) {
      reusable.setTitle(displayTitle);
      reusable.api.setRenderer(requestedRenderer);
      // A9 Round-3 (Major): dockview merges params, so metadata the previous
      // target carried survived into the replacement whenever the new caller
      // did not happen to supply the same key. The metadata bag is opaque to
      // the shell, so rather than know its keys, clear every key the new bag
      // does not set.
      const staleMeta: Record<string, undefined> = {};
      for (const key of Object.keys(reusable.params || {})) {
        if (!(key in meta)) staleMeta[key] = undefined;
      }
      reusable.update({
        params: {
          ...staleMeta,
          ...meta,
          targetId,
          isUserCreatedEmptyTab: false,
          isPreview: mode === 'preview',
          // Round-2 adversarial finding (Major): dockview merges partial
          // params rather than replacing them, so a stale isDirty: true from
          // whatever this panel held before would otherwise survive into the
          // freshly (re)loaded content it no longer describes.
          isDirty: false,
        },
      });
      reusable.api.setActive();
      this.applyPreviewClass(reusable);
      return reusable;
    }

    // FR-P8 / FR-J8: nothing to reuse — add a tab beside whatever is kept.
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
        isPreview: mode === 'preview',
      },
    });
    this.wirePanelClose(panel);

    panel.api.setActive();
    this.applyPreviewClass(panel);
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
      // No horizontal neighbor exists: make a bare group and fill it at once.
      // This is not a user-asked split, so it gets no `Untitled` spot (FR-P11).
      const beside = this.splitGroup(activeGroup, 'right');
      return this.openItem(targetId, title, options, beside);
    }

    // Spatial beside group exists: open in it
    this.setActiveGroup(besideGroup);
    return this.openItem(targetId, title, options, besideGroup);
  }

  /**
   * The bare split primitive (FR-D1, FR-D2): a new group in the given
   * direction, with no panels. Used where the caller fills it right away
   * (openBeside). User-facing splits go through `splitGroupForUser`.
   */
  public splitGroup(group: DockviewGroupPanel, direction: 'right' | 'below'): DockviewGroupPanel {
    const dir: Direction = direction === 'right' ? 'right' : 'below';
    return this.api.addGroup({
      referenceGroup: group,
      direction: dir,
    });
  }

  /**
   * Splits a group the way the user does — the header buttons, the File menu,
   * Ctrl+\ (v0.2 FR-P11, D-1).
   *
   * The new group is not empty: it opens with one `Untitled` preview tab. That
   * tab is the group's replaceable spot, so the first pick there lands in it,
   * and closing it without adding anything else takes the group with it by the
   * ordinary last-tab rule (FR-P12). Creating the group and its tab in one
   * addPanel call means no empty group ever exists in between.
   */
  public splitGroupForUser(group: DockviewGroupPanel, direction: 'right' | 'below'): DockviewGroupPanel {
    const dir: Direction = direction === 'right' ? 'right' : 'below';
    const panel = this.api.addPanel({
      id: `tab-${++this.panelCounter}`,
      component: 'editor-panel',
      title: 'Untitled',
      position: {
        referenceGroup: group,
        direction: dir,
      },
      params: {
        isUserCreatedEmptyTab: true,
        targetId: null,
        isPreview: true,
      },
    });
    this.wirePanelClose(panel);
    panel.api.setActive();
    this.applyPreviewClass(panel);
    return panel.group;
  }

  /**
   * Splits the active group the way the user does (FR-D1 ~ FR-D3, FR-P11):
   * the File menu's Split Right / Split Down and Ctrl+\ land here.
   */
  public splitActiveGroup(direction: 'right' | 'below'): DockviewGroupPanel | undefined {
    const group = this.getActiveGroup();
    if (!group) return undefined;
    return this.splitGroupForUser(group, direction);
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
   * Closes every tab in the group — the active tab's whole group (v0.2 FR-M10,
   * v0.1 FR-J2). Confirms all its dirty tabs first; a Cancel there aborts with
   * the group untouched (A12 Major). If other groups exist the group then
   * disappears (FR-J1); the last group stays as an empty pane (FR-J7); an
   * already-empty pane changes nothing (FR-J4).
   */
  public async closeAllTabsInGroup(targetGroup?: DockviewGroupPanel): Promise<void> {
    const group = targetGroup || this.getActiveGroup();
    if (!group) return;

    const panels = [...group.panels];
    if (panels.length === 0) return; // FR-J4

    if (!(await this.confirmCloseAll(panels))) return;
    for (const panel of panels) {
      this.forceClosePanel(panel);
    }
  }

  /**
   * File > Close All Tabs: every open tab in every group (v0.2 FR-M10, D-5).
   * Confirms all dirty tabs first; a Cancel aborts with nothing closed (A12
   * Major). Emptied groups disappear by the usual rule, and the last one
   * stays as an empty group (FR-J7).
   */
  public async closeAllTabs(): Promise<void> {
    const panels = [...this.api.panels];
    if (panels.length === 0) return;

    if (!(await this.confirmCloseAll(panels))) return;
    for (const panel of panels) {
      if (this.api.getPanel(panel.id)) this.forceClosePanel(panel);
    }
  }

  /**
   * Moves keyboard focus into a group without changing which tab it shows
   * (v0.2 FR-F1, FR-F3). The group becomes the active one — so group-scoped
   * commands such as Ctrl+W and Ctrl+Tab act on it — but its active panel, and
   * every other group's, stay exactly as they were.
   */
  public focusGroup(group: DockviewGroupPanel): void {
    this.setActiveGroup(group);
    this.focusTargetOf(group)?.focus({ preventScroll: true });
  }

  /**
   * The element a group takes keyboard focus through: its content area, made
   * focusable on demand. dockview renders it as a plain container, and focus
   * that cannot land inside the group cannot be shown on it either (FR-F10).
   */
  private focusTargetOf(group: DockviewGroupPanel): HTMLElement | null {
    const content = group.element.querySelector('.dv-content-container') as HTMLElement | null;
    if (content && !content.hasAttribute('tabindex')) content.setAttribute('tabindex', '-1');
    return content;
  }

  /**
   * Ctrl+Tab / Ctrl+Shift+Tab: the next or previous tab inside the active
   * group only (v0.2 FR-F2). It never crosses into another group, and keyboard
   * focus stays in the group if it was there.
   */
  public cycleActivePanel(direction: 1 | -1): void {
    const group = this.getActiveGroup();
    if (!group || group.panels.length < 2) return;
    const panels = group.panels;
    const current = panels.findIndex((p) => p === group.activePanel);
    const next = panels[(current + direction + panels.length) % panels.length];
    const hadFocus = group.element.contains(document.activeElement);
    next.api.setActive();
    if (hadFocus) this.focusTargetOf(group)?.focus({ preventScroll: true });
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
