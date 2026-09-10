import { createWorkbenchLayout, WorkbenchLayoutElements } from './core/layout';
import { setupWindowControls, closeWindow } from './core/window';
import { ConfirmDialogController } from './core/dialog';
import { AboutDialogController } from './core/about';
import { StatusMessageController } from './core/statusmessage';
import { TextEditorView } from './core/texteditor';
import { MenuController } from './core/menu';
import { ActivityBarController } from './core/activitybar';
import { ViewStateManager } from './core/viewstate';
import { FocusAreaController } from './core/focusareas';
import { ThemeManager } from './core/theme';
import { IconThemeManager } from './core/icontheme';
import { SetiResolver, VscodeIconsResolver } from './icons';
import { TreeController, TreeNode } from './core/tree';
import { ExplorerTitlebarController } from './core/sidebar';
import { FileSystemTreeProvider, promptOpenFolderDialog } from './providers/filesystem';
import { EditorController, EditorOpenMode } from './core/editor';
import { ContextMenuController, ContextMenuItem } from './core/contextmenu';
import { ResourceKindRegistry } from './registry/kind-registry';
import { registerFilePreset, FILE_KIND } from './presets/file-preset';
import { registerFolderPreset, FOLDER_KIND } from './presets/folder-preset';
import { AppEditorSurface, createAppEditorSurface } from './core/editor';
import { MenuItem } from './core/menu';
import { ActivityBarItem } from './core/activitybar';
import { ViewAction } from './core/sidebar';

/**
 * Everything a real app-extension author is meant to use (FR-I1 ~ FR-I11,
 * FR-N10, FR-N12, FR-G6). Unlike `window.__workbenchApp` (a full-access
 * diagnostic hook the Phase 1-4 test harnesses already depend on), this
 * surface has 0 methods that create, close, or move a tab or pane.
 */
export interface WorkbenchAppSurface {
  editor: AppEditorSurface;
  kindRegistry: ResourceKindRegistry;
  addFileMenuItem: (item: MenuItem) => void;
  addSidebarViewAction: (action: ViewAction) => void;
  setActivityBarTopItems: (items: ActivityBarItem[]) => void;
  setActivityBarBottomItems: (items: ActivityBarItem[]) => void;
  setContextMenuEnabled: (enabled: boolean) => void;
  setTreeContextMenuItemsProvider: (fn: (nodeId: string) => ContextMenuItem[]) => void;
  setPanelContextMenuItemsProvider: (fn: (panelId: string) => ContextMenuItem[]) => void;
  /** Same spot, same look as the shell's own errors/progress (D-32, FR-N10a, FR-N10b). */
  showStatusMessage: (text: string) => void;
  showStatusError: (text: string) => void;
  startStatusProgress: (text: string) => void;
  stopStatusProgress: () => void;
}

export class WorkbenchApp {
  public layout: WorkbenchLayoutElements;
  public menu: MenuController;
  public activityBar: ActivityBarController;
  public viewState: ViewStateManager;
  public theme: ThemeManager;
  public iconTheme: IconThemeManager;
  public tree: TreeController;
  public explorerTitlebar: ExplorerTitlebarController;
  public fsProvider: FileSystemTreeProvider;
  public editor: EditorController;
  public kindRegistry: ResourceKindRegistry;
  public contextMenu: ContextMenuController;
  /** Shell-internal picker for the File menu's "recent folder" item (D-16: a list, not just the most recent). Always enabled — unlike `contextMenu`, this is not the user-toggleable right-click feature (D-22). */
  private recentFoldersMenu: ContextMenuController;
  public confirmDialog: ConfirmDialogController;
  public aboutDialog: AboutDialogController;
  public statusMessages: StatusMessageController;
  /** App-supplied item providers for the right-click device (FR-G6). Empty by default (D-22). */
  public contextMenuItemsForTreeNode: (nodeId: string) => ContextMenuItem[] = () => [];
  public contextMenuItemsForPanel: (panelId: string) => ContextMenuItem[] = () => [];
  private recentFolders: string[] = [];

  constructor(container: HTMLElement) {
    this.layout = createWorkbenchLayout(container);
    setupWindowControls(
      this.layout.windowMinBtn,
      this.layout.windowMaxBtn,
      this.layout.windowCloseBtn
    );
    this.menu = new MenuController(this.layout.menuBtn, this.layout.root);
    this.activityBar = new ActivityBarController(
      this.layout.activityBarTop,
      this.layout.activityBarBottom
    );
    this.viewState = new ViewStateManager(this.layout);
    this.theme = new ThemeManager('dark');
    this.iconTheme = new IconThemeManager('seti', this.theme.getTheme());
    this.iconTheme.registerResolver('seti', new SetiResolver());
    this.iconTheme.registerResolver('vscode-icons', new VscodeIconsResolver());
    this.theme.onThemeChange((theme) => this.iconTheme.setColorTheme(theme));

    // Initialize EditorController layout engine (FR-C, FR-D, FR-E, FR-J, WK-019 ~ WK-024)
    this.editor = new EditorController(this.layout.editorContainer);

    // Resource kind registration slot + minimal example presets (FR-I1, FR-I2, FR-I3, WK-025, WK-026)
    this.kindRegistry = new ResourceKindRegistry();
    registerFilePreset(this.kindRegistry);
    registerFolderPreset(this.kindRegistry);
    this.editor.setComponentFactory(this.kindRegistry.createComponentFactory(this.editor));
    this.editor.setSaveHandler((panelId) => this.kindRegistry.save(panelId));

    // Right-click menu device, default off (FR-G5, FR-G6, D-22, WK-030)
    this.contextMenu = new ContextMenuController(this.layout.root);
    this.recentFoldersMenu = new ContextMenuController(this.layout.root);
    this.recentFoldersMenu.setEnabled(true);

    // Save-confirmation dialog (FR-L2 ~ FR-L7, D-28) and status message/progress line (D-21, D-32)
    this.confirmDialog = new ConfirmDialogController(this.layout.root);
    this.editor.setDialogController(this.confirmDialog);
    this.statusMessages = new StatusMessageController(this.layout.statusbarMessage);

    // Help > About (FR-Q5, D-23, WK-037): required attribution for the two
    // CC-licensed icon sets.
    this.aboutDialog = new AboutDialogController(this.layout.root, 'workbench-kit v0.1.0');
    this.menu.setAction('help:about', () => this.aboutDialog.show());

    // Initialize TreeController and Explorer view titlebar (FR-A, D-9, D-30)
    this.tree = new TreeController(this.layout.sidebarContent, this.iconTheme);
    this.explorerTitlebar = new ExplorerTitlebarController(
      this.layout.sidebarHeader,
      this.layout.sidebarAppActions,
      this.layout.sidebarCollapseAllBtn,
      this.layout.sidebarRefreshBtn,
      this.tree
    );
    this.fsProvider = new FileSystemTreeProvider();
    this.tree.setDataProvider(this.fsProvider);

    this.loadRecentFolders();

    // Bind File menu actions (FR-A1, FR-N6a, FR-N6c)
    this.menu.setAction('file:open-folder', () => this.handleOpenFolderDialog());
    this.menu.setAction('file:open-recent', () => this.showRecentFoldersPicker());
    this.menu.setAction('file:close-folder', () => this.closeFolder());

    // Update statusbar path on node selection
    this.tree.onSelect((nodes) => {
      if (nodes.length > 0) {
        const primary = nodes[0];
        const dataObj = primary.data as { path?: string } | undefined;
        const p = dataObj?.path || primary.id;
        if (this.layout.statusbarPath) {
          this.layout.statusbarPath.textContent = String(p);
        }
      }
    });

    // Update sidebar title on root change
    this.tree.onRootChange((root) => {
      if (this.layout.sidebarTitle) {
        this.layout.sidebarTitle.textContent = root ? root.label.toUpperCase() : 'EXPLORER';
      }
      if (!root && this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = '';
      }
    });

    // Bind sidebar, titlebar, statusbar, and zen toggles
    this.menu.setAction('view:toggle-sidebar', () => this.viewState.toggleSidebar());
    this.menu.setAction('view:toggle-titlebar', () => this.viewState.toggleTitlebar());
    this.menu.setAction('view:toggle-statusbar', () => this.viewState.toggleStatusbar());
    this.menu.setAction('view:zen-mode', () => this.viewState.toggleZenMode());

    this.activityBar.setAction('activity:toggle-sidebar', () => this.viewState.toggleSidebar());
    this.activityBar.setAction('activity:toggle-titlebar', () => this.viewState.toggleTitlebar());
    this.activityBar.setAction('activity:toggle-statusbar', () => this.viewState.toggleStatusbar());
    this.activityBar.setAction('activity:zen-mode', () => this.viewState.toggleZenMode());

    // Ensure menu controller state is closed when entering Zen mode (FR-F5, D-12)
    this.viewState.onZenEnter(() => this.menu.closeMenu());

    // Bind theme cycling (FR-M1: White -> Gray -> Dark)
    this.menu.setAction('view:cycle-color-theme', () => this.theme.cycleTheme());
    this.activityBar.setAction('activity:cycle-color-theme', () => this.theme.cycleTheme());

    // Bind icon theme cycling (FR-Q1a: seti <-> vscode-icons, View menu only).
    // Phase 7 finding: toggling the theme alone only flips internal state —
    // already-rendered tree rows keep resolving icons at render time, so
    // without an explicit re-render the visible icons would not actually
    // change until some unrelated refresh happened to redraw the tree.
    this.menu.setAction('view:cycle-icon-theme', () => {
      this.iconTheme.toggleTheme();
      this.tree.render();
    });

    // Bind Tree item opening rules (FR-B1 ~ FR-B4, FR-A6, FR-A14, D-5).
    // Which kind a node opens as is an app-layer decision (isContainer is a
    // generic core field); the shell itself never branches on file/folder.
    const kindOf = (isContainer: boolean | undefined) => (isContainer ? FOLDER_KIND : FILE_KIND);
    // Round-1 adversarial finding (Critical): selecting a new item replaces
    // the target group's active tab in place (FR-B1), which would silently
    // discard an unsaved edit. Ask first, same as closing that tab would (D-28).
    // A single pick is browsing: it goes to the group's preview spot and
    // replaces whatever was being looked at there (v0.2 FR-P1 ~ FR-P3).
    // A9 Round-3 (Major): a double click delivers click, click, dblclick.
    // With a dirty preview each click used to start its own confirmation, and
    // the dblclick opened the target pinned *behind* the dialog — after which
    // "Discard" found the target already open and discarded nothing. While a
    // confirmation is on screen, further requests fold into the one pending
    // request instead: the latest target wins, and a confirm upgrades it.
    let pendingOpen: { node: TreeNode; mode: EditorOpenMode } | null = null;

    const openFromTree = (node: TreeNode, mode: EditorOpenMode) => {
      const openNow = (target: TreeNode, how: EditorOpenMode) =>
        this.editor.openItem(target.id, target.label, {
          mode: how,
          meta: { kind: kindOf(target.isContainer) },
        });

      if (pendingOpen) {
        const keepPinned = pendingOpen.node.id === node.id && pendingOpen.mode === 'pinned';
        pendingOpen = { node, mode: keepPinned ? 'pinned' : mode };
        return;
      }

      // Stays fully synchronous in the common (clean) case — the acceptance
      // suites assert state right after a synchronous keydown/click with 0
      // waits. Only a genuinely dirty replace target takes the async confirm
      // path: overwriting it would discard an unsaved edit (D-28).
      //
      // A9 Round-1 (Critical): the tab about to be overwritten is the preview
      // spot, which is not necessarily the active one. Both the question and
      // the answer have to name that same panel.
      //
      // A9 Round-3 (Major): a target that is already open is jumped to, not
      // loaded into the preview spot, so nothing is overwritten and asking
      // would be a false alarm whose "Discard" discards nothing.
      const alreadyOpen = this.editor.getPanels().some((p) => p.params?.targetId === node.id);
      const doomed = mode === 'preview' && !alreadyOpen ? this.editor.getPreviewPanel() : undefined;
      if (doomed?.params?.isDirty) {
        pendingOpen = { node, mode };
        void (async () => {
          const proceed = await this.editor.confirmReplaceIfDirty(doomed);
          const request = pendingOpen;
          pendingOpen = null;
          if (!proceed || !request) return;
          // What the user just agreed to is replacing the dirty preview spot,
          // so the target goes INTO that spot. A pinned request would
          // otherwise open beside it and leave the "discarded" content in
          // place. A double click folded in here is then honoured by
          // confirming the tab the target landed in.
          const landed = openNow(request.node, 'preview');
          if (request.mode === 'pinned') this.editor.pinPanel(landed);
        })();
        return;
      }
      openNow(node, mode);
    };

    this.tree.onOpen((node) => openFromTree(node, 'preview'));
    // Enter, or a double click on a file row: the user is keeping this one
    // (v0.2 FR-P4, FR-P7, FR-T3).
    this.tree.onConfirm((node) => openFromTree(node, 'pinned'));
    this.tree.onOpenToSide((node) => {
      const activeGroup = this.editor.getActiveGroup();
      const besideGroup = activeGroup ? this.editor.findBesideGroup(activeGroup) : undefined;
      // No existing beside group means openBeside() will split a fresh
      // empty one — nothing to silently replace, so no confirmation needed.
      if (besideGroup && this.editor.isActivePanelDirty(besideGroup)) {
        void (async () => {
          if (!(await this.editor.confirmReplaceIfDirty(besideGroup))) return;
          this.editor.openBeside(node.id, node.label, { meta: { kind: kindOf(node.isContainer) } });
        })();
        return;
      }
      this.editor.openBeside(node.id, node.label, { meta: { kind: kindOf(node.isContainer) } });
    });

    // Right-click menu wiring (FR-G5, FR-G6, D-22). The shell only draws the
    // device; whether it is enabled and what items appear are app decisions.
    this.menu.setAction('view:toggle-context-menu', () => {
      this.contextMenu.setEnabled(this.menu.isItemChecked('view:toggle-context-menu'));
    });
    this.layout.sidebarContent.addEventListener('contextmenu', (e) => {
      const row = (e.target as HTMLElement).closest('.tree-row') as HTMLElement | null;
      if (!row) return;
      e.preventDefault();
      const nodeId = row.getAttribute('data-id');
      const items = nodeId ? this.contextMenuItemsForTreeNode(nodeId) : [];
      this.contextMenu.show(e.clientX, e.clientY, items);
    });
    this.layout.editorContainer.addEventListener('contextmenu', (e) => {
      const tab = (e.target as HTMLElement).closest('.dv-tab') as HTMLElement | null;
      if (!tab) return;
      e.preventDefault();
      const panelId = tab.getAttribute('data-tab-panel-id');
      const items = panelId ? this.contextMenuItemsForPanel(panelId) : [];
      this.contextMenu.show(e.clientX, e.clientY, items);
    });

    // File menu tab actions (FR-N6b)
    this.menu.setAction('file:close-tab', () => this.editor.closeActiveTab());

    // Overrides the built-in `file:exit` action (setAction takes priority
    // over the item's own embedded action) so quitting with unsaved changes
    // asks first, same as closing a dirty tab (FR-L6, D-28).
    this.menu.setAction('file:exit', () => this.handleExitRequest());

    // FR-G3: switching to a tab whose target has disappeared shows one
    // status-bar error line. This is app-layer (main.ts, not core) logic —
    // it reuses the existing host directory-listing bridge, no new native
    // host code (INTENT 3, NFR-1).
    this.editor.onActivePanelChange((panel) => {
      const targetId = panel?.params?.targetId as string | undefined;
      const kind = panel?.params?.kind as string | undefined;
      // Only file/folder-kind panels correspond to real filesystem paths;
      // checking any other kind would hammer the host bridge for targets
      // that were never meant to resolve to a path (e.g. test/demo kinds).
      if (!targetId || (kind !== FILE_KIND && kind !== FOLDER_KIND)) return;
      void this.fsProvider.pathExists(targetId).then((exists) => {
        if (!exists) {
          this.statusMessages.showError(`Error: target no longer exists: ${targetId}`);
        }
      });
    });

    // View menu layout actions (FR-D3, FR-J2)
    this.menu.setAction('view:split-horizontal', () => this.editor.splitActiveGroup('right'));
    this.menu.setAction('view:split-vertical', () => this.editor.splitActiveGroup('below'));
    this.menu.setAction('view:close-active-tabs', () => this.editor.closeAllTabsInGroup());

    // Activity bar split actions (FR-D3)
    this.activityBar.setAction('activity:split-horizontal', () => this.editor.splitActiveGroup('right'));
    this.activityBar.setAction('activity:split-vertical', () => this.editor.splitActiveGroup('below'));

    // Minimal example wiring proving the app-facing extension slots (WK-048, WK-029):
    // File menu item below the shell's separator (FR-I9), a view-titlebar action left
    // of the shell's two actions (FR-I10), and one status bar item beside the shell's
    // three slots (FR-N10). These are wiring examples, not domain functionality (INTENT 7).
    this.menu.addAppFileItem({
      id: 'app:file:preset-info',
      label: 'Preset Info',
      action: () => {
        this.statusMessages.showMessage('Presets registered: file, folder');
      },
    });
    this.explorerTitlebar.addAppAction({
      id: 'app:sidebar:preset-info',
      title: 'Preset Info',
      iconClass: 'codicon-info',
      action: () => {
        this.statusMessages.showMessage('Presets registered: file, folder');
      },
    });
    if (this.layout.statusbarAppItems) {
      const presetInfoEl = document.createElement('span');
      presetInfoEl.className = 'statusbar-app-item';
      presetInfoEl.textContent = 'Presets: file, folder';
      this.layout.statusbarAppItems.appendChild(presetInfoEl);
    }

    // Focus areas — F6 / Shift+F6 between the tree and each group, Ctrl+Tab
    // inside a group, and a press on the explorer's empty space (v0.2 D-10,
    // FR-F1 ~ FR-F5).
    new FocusAreaController(this.layout.sidebarContent, this.tree, this.editor, this.viewState);

    // Global keyboard shortcuts: Ctrl+O, Ctrl+W, Ctrl+\
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O')) {
          e.preventDefault();
          this.handleOpenFolderDialog();
        } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'w' || e.key === 'W')) {
          e.preventDefault();
          this.editor.closeActiveTab();
        } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '\\') {
          e.preventDefault();
          this.editor.splitActiveGroup('right');
        }
      });
    }

    // Statusbar app info: app name, version, host branch (FR-N9, D-7)
    const updateAppInfo = () => {
      const isElectron = typeof window !== 'undefined' && (Boolean(window.workbenchHost) || (navigator.userAgent && navigator.userAgent.includes('Electron')));
      const isPywebview = typeof window !== 'undefined' && (Boolean(window.pywebview) || (navigator.userAgent && navigator.userAgent.includes('pywebview')));
      const branch = isElectron ? 'Electron' : (isPywebview ? 'pywebview' : '');
      const text = branch ? `workbench-kit v0.1.0 · ${branch}` : 'workbench-kit v0.1.0';
      if (this.layout.statusbarAppInfo) {
        this.layout.statusbarAppInfo.textContent = text;
      }
    };
    updateAppInfo();
    if (typeof window !== 'undefined') {
      window.addEventListener('pywebviewready', updateAppInfo);
    }
  }

  private currentFolderRequestId = 0;

  public async openFolder(folderPath: string): Promise<void> {
    const reqId = ++this.currentFolderRequestId;
    this.statusMessages.startProgress(`Opening folder: ${folderPath}`);
    try {
      const rootNode = await this.fsProvider.createRootNode(folderPath);
      if (this.currentFolderRequestId !== reqId) {
        return;
      }
      this.tree.setRoot(rootNode);
      if (this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = folderPath;
      }
      this.addRecentFolder(folderPath);
      this.saveLastOpenedFolder(folderPath);
      this.statusMessages.stopProgress();
    } catch (err) {
      if (this.currentFolderRequestId !== reqId) {
        return;
      }
      this.statusMessages.showError(`Error opening folder: ${String(err)}`);
    }
  }

  /**
   * Reopens the last folder that was open when the app last closed (FR-K1).
   * Tab/pane layout, active tab, and tree expansion are deliberately not
   * restored (FR-K2, FR-K3, D-27, X-11) — the editor already starts with 1
   * empty pane and the tree already starts collapsed to just the root.
   */
  public async restoreLastSession(): Promise<void> {
    const lastFolder = this.loadLastOpenedFolder();
    if (lastFolder) {
      await this.openFolder(lastFolder);
    }
  }

  private saveLastOpenedFolder(folderPath: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('workbench:last-folder', folderPath);
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private loadLastOpenedFolder(): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('workbench:last-folder');
      }
    } catch {
      // Ignore localStorage errors
    }
    return null;
  }

  /**
   * Clears root and returns tree to empty state without altering editor tabs
   * (FR-G1, FR-N6c). Does not touch the persisted last-opened folder (FR-K1,
   * D-27): that value names the folder a restart should restore, and Close
   * Folder is a this-session-only action, not "forget for next time".
   */
  public closeFolder(): void {
    this.currentFolderRequestId++;
    this.tree.clearRoot();
    if (this.layout.statusbarPath) {
      this.layout.statusbarPath.textContent = '';
    }
  }

  /**
   * File > Exit deliberately confirms nothing itself — closeWindow() reaches
   * the exact same native close gate (each host's window-close handler, which
   * calls confirmQuit() before actually tearing the window down) that the
   * title-bar close button and the OS close button also go through. Asking
   * here too used to mean a dirty tab was confirmed twice for one exit
   * request (round-2 adversarial finding, Major).
   */
  public handleExitRequest(): void {
    closeWindow();
  }

  public async handleOpenFolderDialog(): Promise<void> {
    const selected = await promptOpenFolderDialog();
    if (selected) {
      await this.openFolder(selected);
    }
  }

  public async handleOpenRecentFolder(): Promise<void> {
    if (this.recentFolders.length > 0) {
      await this.openFolder(this.recentFolders[0]);
    }
  }

  /**
   * Shows the full recent-folders list (D-16: the recent-folder list lives
   * in the menu) so the user can pick any of the up to 10 stored entries, not
   * only the most recent one (FR-N6a, round-1 session review finding).
   */
  public showRecentFoldersPicker(): void {
    if (this.recentFolders.length === 0) return;
    const anchor = this.layout.menuBtn.getBoundingClientRect();
    const items = this.recentFolders.map((folderPath, index) => ({
      id: `recent-folder-${index}`,
      label: folderPath,
      action: () => {
        void this.openFolder(folderPath);
      },
    }));
    this.recentFoldersMenu.show(anchor.left, anchor.bottom, items);
  }

  public getRecentFolders(): readonly string[] {
    return this.recentFolders;
  }

  /**
   * The documented app-extension surface (FR-I1 ~ FR-I11, FR-N10, FR-N12,
   * FR-G6). Deliberately excludes `menu.setAction`/`menu.triggerItem` and
   * any dockview-facing method — see `WorkbenchAppSurface`.
   */
  public getAppSurface(): WorkbenchAppSurface {
    return {
      editor: createAppEditorSurface(this.editor),
      kindRegistry: this.kindRegistry,
      addFileMenuItem: (item) => this.menu.addAppFileItem(item),
      addSidebarViewAction: (action) => this.explorerTitlebar.addAppAction(action),
      setActivityBarTopItems: (items) => this.activityBar.setTopItems(items),
      setActivityBarBottomItems: (items) => this.activityBar.setBottomItems(items),
      setContextMenuEnabled: (enabled) => this.contextMenu.setEnabled(enabled),
      setTreeContextMenuItemsProvider: (fn) => {
        this.contextMenuItemsForTreeNode = fn;
      },
      setPanelContextMenuItemsProvider: (fn) => {
        this.contextMenuItemsForPanel = fn;
      },
      showStatusMessage: (text) => this.statusMessages.showMessage(text),
      showStatusError: (text) => this.statusMessages.showError(text),
      startStatusProgress: (text) => this.statusMessages.startProgress(text),
      stopStatusProgress: () => this.statusMessages.stopProgress(),
    };
  }

  private loadRecentFolders(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('workbench:recent-folders');
        if (raw) this.recentFolders = JSON.parse(raw);
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private addRecentFolder(folderPath: string): void {
    this.recentFolders = [folderPath, ...this.recentFolders.filter((p) => p !== folderPath)].slice(0, 10);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('workbench:recent-folders', JSON.stringify(this.recentFolders));
      }
    } catch {
      // Ignore localStorage errors
    }
  }
}

let appInstance: WorkbenchApp | null = null;

export function initWorkbench(): WorkbenchApp {
  if (appInstance) return appInstance;
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    throw new Error('Root #app container not found');
  }
  appInstance = new WorkbenchApp(appContainer);
  if (typeof window !== 'undefined') {
    // Full-access diagnostic hook for the Phase 1-4 verification harnesses
    // (phase2/3/4-suite.js), which legitimately test shell internals. This
    // is NOT the app-extension surface (FR-I8) — see __workbenchAppSurface.
    (window as any).__workbenchApp = appInstance;
    (window as any).__workbenchAppSurface = appInstance.getAppSurface();
    // Test-only diagnostic export (Phase 6 verification needs to construct
    // an isolated view directly, e.g. to prove read-only mode blocks edits).
    (window as any).__TextEditorView = TextEditorView;
  }
  void appInstance.restoreLastSession();
  return appInstance;
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      initWorkbench();
    });
  } else {
    initWorkbench();
  }
}
