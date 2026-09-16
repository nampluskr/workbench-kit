import { createWorkbenchLayout, WorkbenchLayoutElements } from './core/layout';
import { setupWindowControls, setupResizeGrips, closeWindow } from './core/window';
import { ConfirmDialogController } from './core/dialog';
import { AboutDialogController } from './core/about';
import { StatusMessageController } from './core/statusmessage';
import { TextEditorView, setEditorColorTheme } from './core/texteditor';
import { MenuController } from './core/menu';
import { ActivityBarController } from './core/activitybar';
import { ViewStateManager } from './core/viewstate';
import { FocusAreaController } from './core/focusareas';
import { ThemeManager, ColorTheme } from './core/theme';
import { IconThemeManager, FileIconThemeId } from './core/icontheme';
import { SetiResolver, VscodeIconsResolver, SimpleResolver } from './icons';
import { TreeController, TreeNode } from './core/tree';
import { FolderTabsController, FolderTab } from './core/foldertabs';
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

/** Injected at build time by vite.config.ts (v0.2 FR-C7, FR-C8). */
declare const __WB_VERSION__: string;
declare const __WB_COMMIT_DATE__: string;

/**
 * The one place `package.json`'s version and the last-commit date turn into
 * display text — the title bar (FR-C7) and Help > About both read it, so
 * neither can drift from `package.json` or from each other (A15 round-1
 * Critical finding: About used to hardcode its own copy of this string
 * independently of the title bar's, so the two could show different
 * versions). The version NUMBER itself is `package.json`'s — an agent does
 * not change it on its own (project versioning policy); this only formats
 * whatever it is.
 */
function appInfoBase(): string {
  const [major, minor] = __WB_VERSION__.split('.');
  return `Workbench-Kit v${major}.${minor} (${__WB_COMMIT_DATE__})`;
}

/**
 * One folder tab's saved Explorer state (v0.3 D-5). Keyed by folder-tab id
 * in `WorkbenchApp.explorerStateByTab` — see there for why it lives on the
 * app rather than on `FolderTabsController` or `TreeController`.
 */
interface ExplorerState {
  expandedIds: string[];
  selectedIds: string[];
  focusedId: string | null;
  scrollTop: number;
}

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
  /** What the shell's New File / New Folder view actions do once a name is typed (v0.2 FR-X4). */
  setSidebarNewItemHandler: (fn: (req: { type: 'leaf' | 'container'; name: string; parentId?: string }) => void) => void;
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
  public folderTabs: FolderTabsController;
  public explorerTitlebar: ExplorerTitlebarController;
  public fsProvider: FileSystemTreeProvider;
  public editor: EditorController;
  public kindRegistry: ResourceKindRegistry;
  public contextMenu: ContextMenuController;
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
    setupResizeGrips(this.layout.root);
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
    this.iconTheme.registerResolver('simple', new SimpleResolver());
    // The editor area follows the colour theme like every other area (D-11,
    // D-19). Its colours come from style.css's --vscode-* block; this call
    // only keeps monaco's own theme class in step — see setEditorColorTheme.
    setEditorColorTheme(this.theme.getTheme());
    this.theme.onThemeChange((theme) => {
      this.iconTheme.setColorTheme(theme);
      setEditorColorTheme(theme);
      // Repaint the tree's icon colours for the new theme in place (FR-X14).
      // A full re-render would drop an open inline-input row, focus and scroll
      // position (A14 R1-3), so this only touches colour. `this.tree` exists by
      // the time any theme change can fire.
      this.tree?.refreshThemeColors();
      // Folder tabs re-resolve their icon colour from the same iconTheme, and
      // the active-tab accent reads theme tokens too (v0.3 D-1). Phase 2's
      // rename DOES have an inline-input row now — refresh() preserves a
      // draft the user is mid-typing (FolderTabsController.renamingDraftValue),
      // the same guard the tree's colour-only path avoids the full rebuild for.
      this.folderTabs?.refresh();
    });

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

    // Save-confirmation dialog (FR-L2 ~ FR-L7, D-28) and status message/progress line (D-21, D-32)
    this.confirmDialog = new ConfirmDialogController(this.layout.root);
    this.editor.setDialogController(this.confirmDialog);
    this.statusMessages = new StatusMessageController(this.layout.statusbarMessage);

    // Help > About (FR-Q5, D-23, WK-037): required attribution for the two
    // CC-licensed icon sets.
    this.aboutDialog = new AboutDialogController(this.layout.root, appInfoBase());
    this.menu.setAction('help:about', () => this.aboutDialog.show());

    // Initialize TreeController and Explorer view titlebar (FR-A, D-9, D-30)
    this.tree = new TreeController(this.layout.sidebarContent, this.iconTheme);
    this.explorerTitlebar = new ExplorerTitlebarController(
      this.layout.sidebarAppActions,
      this.layout.sidebarNewFileBtn,
      this.layout.sidebarNewFolderBtn,
      this.layout.sidebarRefreshBtn,
      this.layout.sidebarCollapseAllBtn,
      this.tree
    );
    this.fsProvider = new FileSystemTreeProvider();
    this.tree.setDataProvider(this.fsProvider);

    // Folder Tabs rail (v0.3 D-1, D-3, D-4): registers working folders as
    // tabs instead of the Explorer having a single swappable root. Add
    // Folder does the same dialog + registration `Open Folder` does.
    this.folderTabs = new FolderTabsController(
      this.layout.folderTabsList,
      this.layout.folderTabsAddBtn,
      this.layout.folderTabsRenameBtn,
      this.iconTheme
    );
    this.folderTabs.onAddRequested = () => this.handleOpenFolderDialog();
    // "Locate Folder…" on an error tab (v0.3 D-6, WK-103).
    this.folderTabs.onRelocateRequested = (id) => {
      void this.handleRelocateFolderTab(id);
    };
    // onSelect fires on EVERY successful pick, even clicking the tab that
    // was already active — unlike onActivate below, which only fires on an
    // actual change. Explorer visibility has to follow the former: clicking
    // the already-active tab while the Explorer is hidden must still show it
    // again, or the selection has no visible effect (v0.3 D-2, WK-095; A3 R1
    // Major finding — this used to live in onActivate and so was silently
    // skipped for that exact case).
    this.folderTabs.onSelect(() => {
      if (!this.viewState.getState().sidebarVisible) {
        this.viewState.setSidebarVisible(true);
      }
    });
    this.folderTabs.onActivate((tab) => {
      // Tracked so the `openFolder()` compat shim below can await the
      // activation this triggers, instead of returning before the Explorer
      // root has actually resolved (A1 R2 Minor finding).
      this.lastActivationPromise = this.activateFolderTab(tab);
    });
    // Closing the last folder tab returns the Explorer to its pre-open empty
    // state (v0.3 D-4, WK-089) — the same shape `closeFolder()` produces.
    this.folderTabs.onEmpty(() => {
      this.currentFolderRequestId++;
      this.tree.clearRoot();
      this.activeFolderTabId = null;
      if (this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = '';
      }
      // Invalidating currentFolderRequestId makes an in-flight
      // activateFolderTab() return before its own stopProgress() call —
      // without this, closing a tab whose folder was still loading left
      // "Opening folder: …" showing forever (A2 R1 Major finding).
      this.statusMessages.stopProgress();
    });
    // Drop a closed tab's saved Explorer state immediately — otherwise it
    // stays in the map forever and can leak onto a later, unrelated tab
    // that happens to reuse the same id after a restart (A4 R1 Critical
    // finding).
    this.folderTabs.onRemove((id) => {
      this.explorerStateByTab.delete(id);
      // Closing the ACTIVE tab leaves `activeFolderTabId` pointing at the
      // just-deleted id until activateFolderTab() for its replacement
      // finishes (that happens later, asynchronously, via the
      // activateCallbacks removeTab() fires after this). In between,
      // removeTab()'s own render() call fires onChange -> persistFolderTabs(),
      // which would otherwise still see the stale activeFolderTabId, live-
      // capture the (now wrong) tree, and resurrect the entry onRemove just
      // deleted (A4 R3 Critical finding).
      if (this.activeFolderTabId === id) {
        this.activeFolderTabId = null;
      }
    });
    // Persist after every folder-tabs mutation (add/remove/reorder/alias/
    // activate) — see FolderTabsController.onChange's doc comment (v0.3 D-5,
    // WK-100/101).
    this.folderTabs.onChange(() => this.persistFolderTabs());
    // Safety net for whatever browsing (expand/select/scroll) happened on
    // the active tab since its last onChange-triggered save.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.persistFolderTabs());
    }

    this.loadRecentFolders();

    // Bind File menu actions (FR-A1, FR-N6a). `Open Folder` adds a new
    // folder tab rather than replacing the current one (v0.3 D-3).
    this.menu.setAction('file:open-folder', () => this.handleOpenFolderDialog());
    // Recent Folders opens the stored paths as a list, read each time it is
    // shown. A row adds that folder as a new tab (v0.3 D-3); its remove
    // button drops the path for good (v0.2 FR-M7, v0.1 FR-N6a · D-16).
    this.menu.setSubmenuProvider('file:open-recent', () =>
      this.recentFolders.length === 0
        ? [{ id: 'file:open-recent:empty', label: '(Empty)', disabled: true }]
        : this.recentFolders.map((folderPath, index) => ({
            id: `file:open-recent:${index}`,
            label: folderPath,
            action: () => {
              this.folderTabs.addTab(folderPath);
            },
            secondaryAction: {
              title: 'Remove from Recent Folders',
              iconClass: 'codicon-close',
              action: () => this.removeRecentFolder(folderPath),
            },
          }))
    );

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

    // The explorer title is always EXPLORER — the open folder's name shows in
    // the tree's root row, not the header (v0.2 FR-X1, UT-EXP-001, v0.1 impl fix).
    if (this.layout.sidebarTitle) {
      this.layout.sidebarTitle.textContent = 'EXPLORER';
    }
    this.tree.onRootChange((root) => {
      if (!root && this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = '';
      }
    });

    // View titlebar's New File / New Folder: the shell opens the inline input
    // row; the app does the actual creation (v0.2 FR-X4, D-6). This wiring is
    // an example (INTENT 7) — a real app registers its own handler through the
    // app surface. It reuses the host directory bridge, no new native code.
    this.explorerTitlebar.setNewItemHandler((req) => {
      const parentNode = req.parentId ? this.tree.getNodeById(req.parentId) : this.tree.getRoot();
      const parentPath = (parentNode?.data as { path?: string } | undefined)?.path || parentNode?.id;
      this.statusMessages.showMessage(
        `App would create ${req.type === 'container' ? 'folder' : 'file'} "${req.name}" in ${parentPath ?? '(root)'}`
      );
      void this.tree.refresh();
    });

    // Explorer width: a drag handle between the tree and the editor area
    // (v0.2 FR-X5 ~ FR-X7). The width is not persisted (D-8) — a restart
    // starts at the initial value baked into --sidebar-width.
    this.setupSidebarResize();

    // Bind sidebar, titlebar, statusbar, and zen toggles
    // Titlebar/statusbar toggles also flip their Activity Bar chevron to
    // point the opposite way once hidden (user request, 2026-09-12) —
    // wrapped here so it happens the same way whether triggered from the
    // menu or the Activity Bar button itself.
    const toggleTitlebar = () => {
      const visible = this.viewState.toggleTitlebar();
      this.activityBar.setItemIcon('activity:toggle-titlebar', visible ? 'codicon-chevron-down' : 'codicon-chevron-up');
    };
    const toggleStatusbar = () => {
      const visible = this.viewState.toggleStatusbar();
      this.activityBar.setItemIcon('activity:toggle-statusbar', visible ? 'codicon-chevron-up' : 'codicon-chevron-down');
    };
    this.menu.setAction('view:toggle-sidebar', () => this.viewState.toggleSidebar());
    this.menu.setAction('view:toggle-titlebar', toggleTitlebar);
    this.menu.setAction('view:toggle-statusbar', toggleStatusbar);
    this.menu.setAction('view:toggle-foldertabs', () => this.viewState.toggleFolderTabs());
    this.menu.setAction('view:zen-mode', () => this.viewState.toggleZenMode());
    // Each row's check mark is read from the live state whenever the menu is
    // drawn, so a change made by key, title bar or Activity Bar shows the next
    // time the menu opens (UT-MNU-002).
    this.menu.setCheckedProvider('view:zen-mode', () => this.viewState.isZenMode);
    this.menu.setCheckedProvider('view:toggle-sidebar', () => this.viewState.getState().sidebarVisible);
    this.menu.setCheckedProvider('view:toggle-titlebar', () => this.viewState.getState().titlebarVisible);
    this.menu.setCheckedProvider('view:toggle-statusbar', () => this.viewState.getState().statusbarVisible);
    // The Activity Bar icon and this row watch the same state (v0.3 D-2).
    this.menu.setCheckedProvider('view:toggle-foldertabs', () => this.viewState.getState().folderTabsVisible);

    this.activityBar.setAction('activity:toggle-sidebar', () => this.viewState.toggleSidebar());
    this.activityBar.setAction('activity:toggle-titlebar', toggleTitlebar);
    this.activityBar.setAction('activity:toggle-statusbar', toggleStatusbar);
    this.activityBar.setAction('activity:toggle-foldertabs', () => this.viewState.toggleFolderTabs());

    // Ensure menu controller state is closed when entering Zen mode (FR-F5, D-12)
    this.viewState.onZenEnter(() => this.menu.closeMenu());

    // View > Color Theme lists the three themes and marks the current one
    // (v0.2 FR-M8). The title bar button keeps cycling through them in the
    // same White -> Gray -> Dark order (FR-C3, v0.1 FR-M1).
    const colorThemes: { id: ColorTheme; label: string }[] = [
      { id: 'light', label: 'White' },
      { id: 'gray', label: 'Gray' },
      { id: 'dark', label: 'Dark' },
    ];
    this.menu.setSubmenuProvider('view:color-theme', () =>
      colorThemes.map((t) => ({
        id: `view:color-theme:${t.id}`,
        label: t.label,
        checked: this.theme.getTheme() === t.id,
        action: () => this.theme.setTheme(t.id),
      }))
    );

    // Title bar state actions (v0.2 FR-C1 ~ FR-C3, FR-C11, D-3). Zen and the
    // colour theme sit beside the window controls. Their icons are drawn from
    // the state itself rather than from the click, so F11, Escape and the View
    // menu keep them in step with no path of their own.
    this.layout.titlebarZenBtn.addEventListener('click', () => this.viewState.toggleZenMode());
    this.layout.titlebarThemeBtn.addEventListener('click', () => this.theme.cycleTheme());
    const themeGlyph: Record<string, string> = {
      light: 'codicon-circle-large-outline',
      gray: 'codicon-color-mode',
      dark: 'codicon-circle-large-filled',
    };
    const renderThemeIcon = (theme: string) => {
      const icon = this.layout.titlebarThemeBtn.querySelector('i');
      if (icon) icon.className = `codicon ${themeGlyph[theme] || 'codicon-color-mode'}`;
      this.layout.titlebarThemeBtn.title = `Color Theme: ${theme}`;
    };
    const renderZenIcon = (isZen: boolean) => {
      const icon = this.layout.titlebarZenBtn.querySelector('i');
      if (icon) icon.className = `codicon ${isZen ? 'codicon-screen-normal' : 'codicon-screen-full'}`;
      this.layout.titlebarZenBtn.setAttribute('aria-pressed', String(isZen));
    };
    this.theme.onThemeChange(renderThemeIcon);
    this.viewState.onZenChange(renderZenIcon);
    renderThemeIcon(this.theme.getTheme());
    renderZenIcon(this.viewState.isZenMode);

    // View > Icon Theme: choose one of the three, still from the View menu
    // only (v0.2 FR-M9, v0.1 FR-Q1a; Simple added 2026-09-15, reversing
    // FR-M9's earlier "Simple does not exist" requirement — DECISIONS.md
    // D-18). Phase 7 finding: switching the theme alone only flips internal
    // state —
    // already-rendered tree rows keep resolving icons at render time, so
    // without an explicit re-render the visible icons would not change until
    // some unrelated refresh redrew the tree.
    const iconThemes: { id: FileIconThemeId; label: string }[] = [
      { id: 'seti', label: 'VS Code Built-in' },
      { id: 'vscode-icons', label: 'VS Code Icons' },
      { id: 'simple', label: 'Simple' },
    ];
    this.menu.setSubmenuProvider('view:icon-theme', () =>
      iconThemes.map((t) => ({
        id: `view:icon-theme:${t.id}`,
        label: t.label,
        checked: this.iconTheme.getTheme() === t.id,
        action: () => {
          this.iconTheme.setTheme(t.id);
          this.tree.render();
          this.folderTabs.refresh();
        },
      }))
    );

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
      // A9 Round-3 (Major): a target that is already open in THIS group is
      // jumped to, not loaded into the preview spot, so nothing is
      // overwritten and asking would be a false alarm whose "Discard"
      // discards nothing. FR-P15/D-15 narrowed this to the active group —
      // the target being open, confirmed, in some OTHER group no longer
      // stops the active group's dirty preview from being the real target.
      const activeGroupForCheck = this.editor.getActiveGroup();
      const alreadyOpen = Boolean(activeGroupForCheck?.panels.some((p) => p.params?.targetId === node.id));
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
    // A double click on a file/folder row: the user is keeping this one
    // (v0.2 FR-P4).
    this.tree.onConfirm((node) => openFromTree(node, 'pinned'));
    // Plain Enter: preview-first, like a click, unless the focused item is
    // already the active group's preview spot — a second Enter on the same
    // item is what confirms it (v0.2 FR-P7, FR-T3, D-16).
    this.tree.onEnterOpen((node) => {
      const activeGroup = this.editor.getActiveGroup();
      const currentPreview = activeGroup ? this.editor.getPreviewPanel(activeGroup) : undefined;
      const alreadyPreviewing = currentPreview?.params?.targetId === node.id;
      openFromTree(node, alreadyPreviewing ? 'pinned' : 'preview');
    });
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
    // v0.2 removed the View menu's own switch (FR-M2), so the app turns it on
    // through setContextMenuEnabled.
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

    // File menu close commands, each a different scope (v0.2 FR-M10, D-5):
    // the active tab, the active tab's whole group, every open tab.
    this.menu.setAction('file:close-tab', () => this.editor.closeActiveTab());
    this.menu.setAction('file:close-editor-group', () => void this.editor.closeAllTabsInGroup());
    this.menu.setAction('file:close-all-tabs', () => void this.editor.closeAllTabs());

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

      // Editor tab selection also drives the statusbar path (user request,
      // 2026-09-15) — same label the tree's onSelect above already writes,
      // so switching editor tabs keeps it in sync with whichever surface
      // (tree or editor) the user is actually looking at.
      if (this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = targetId;
      }

      void this.fsProvider.pathExists(targetId).then((exists) => {
        if (!exists) {
          this.statusMessages.showError(`Error: target no longer exists: ${targetId}`);
        }
      });
    });

    // File menu split actions (v0.2 FR-M1; the menu path of v0.1 FR-D3 moved
    // here from View).
    this.menu.setAction('file:split-right', () => this.editor.splitActiveGroup('right'));
    this.menu.setAction('file:split-down', () => this.editor.splitActiveGroup('below'));

    // View > Preset Info (v0.2 FR-M12, D-6): the presets are registered right
    // here by this composition root, which is what lets it name them.
    this.menu.setAction('view:preset-info', () => {
      this.statusMessages.showMessage('Presets registered: file, folder');
    });

    // Minimal example wiring proving one app-facing extension slot (WK-029):
    // a status bar item beside the shell's slots (FR-N10). Preset Info is no
    // longer a view-titlebar action (v0.2 FR-X3) — it lives in View > Preset
    // Info (FR-M12). FR-I10's view-titlebar app-action slot stays open; a real
    // app registers through addSidebarViewAction.
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

    // Global keyboard shortcuts: Ctrl+O, Ctrl+W, Ctrl+\, Ctrl+B, Alt+F4.
    // Capture phase (A12 Critical): these are the shell's regardless of focus
    // (reserved-keys.md §1). A tab view that calls stopPropagation() on its own
    // keydown must not be able to swallow them, so the listener runs before the
    // event reaches the view. Non-reserved keys fall through untouched.
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        const ctrlOnly = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
        const altOnly = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
        // A12 R3 Major: a displayed shortcut must land on the same screen state
        // as clicking its row — and clicking a row closes the menu first. Run
        // the command with the menu already closed.
        const run = (fn: () => void) => {
          e.preventDefault();
          if (this.menu.isOpen) this.menu.closeMenu();
          fn();
        };
        if (ctrlOnly && (e.key === 'o' || e.key === 'O')) {
          run(() => this.handleOpenFolderDialog());
        } else if (ctrlOnly && (e.key === 'w' || e.key === 'W')) {
          run(() => this.editor.closeActiveTab());
        } else if (ctrlOnly && e.key === '\\') {
          run(() => this.editor.splitActiveGroup('right'));
        } else if (ctrlOnly && (e.key === 'b' || e.key === 'B')) {
          // The key View > Show Sidebar displays (v0.2 FR-M4, FR-M5).
          run(() => this.viewState.toggleSidebar());
        } else if (altOnly && e.key === 'F4') {
          // The key File > Exit displays (FR-M4, FR-M5). It takes the same
          // path as the menu row, so a dirty tab is asked about through the
          // same host close gate. A plain F4 is untouched (v0.1 FR-I6).
          run(() => this.handleExitRequest());
        }
      }, true);
    }

    // Program information, one line left in the title bar (v0.2 FR-C7 ~ FR-C9,
    // D-4). Version and last-commit date are baked in at build time; the host
    // branch is read at run time because both branches load one build (NFR-2).
    const updateAppInfo = () => {
      const isElectron = typeof window !== 'undefined' && (Boolean(window.workbenchHost) || (navigator.userAgent && navigator.userAgent.includes('Electron')));
      const isPywebview = typeof window !== 'undefined' && (Boolean(window.pywebview) || (navigator.userAgent && navigator.userAgent.includes('pywebview')));
      const branch = isElectron ? 'Electron' : (isPywebview ? 'PyWebView' : '');
      const base = appInfoBase();
      this.layout.windowTitle.textContent = branch ? `${base} - ${branch}` : base;
    };
    updateAppInfo();
    if (typeof window !== 'undefined') {
      window.addEventListener('pywebviewready', updateAppInfo);
    }
  }

  /**
   * Drag — or arrow-key nudge — the handle between the explorer and the editor
   * area to resize the explorer (v0.2 FR-X5, keyboard path per NFR-8). The
   * width is clamped so `EXPLORER` and the four view actions never clip (FR-X6)
   * and it cannot pass ~60% of the window; it lives only in the CSS variable,
   * never persisted (FR-X7, D-8 — this method touches 0 storage).
   */
  private setupSidebarResize(): void {
    const handle = this.layout.sidebarResizeHandle;
    const sidebar = this.layout.sidebar;
    if (!handle || !sidebar) return;

    // Wide enough for the full EXPLORER label + the 4 shell actions, at the
    // header's padding (A13 Critical + R3 Major) — lowered from 260 toward
    // VS Code's narrower range (user request, 2026-09-12); app actions clip
    // first and soonest at this width, by design (.sidebar-app-actions).
    const MIN = 200;
    const clamp = (px: number) => {
      const max = Math.max(MIN, Math.round((window.innerWidth || 1280) * 0.6));
      return Math.min(max, Math.max(MIN, px));
    };
    const setWidth = (px: number) => {
      this.layout.root.style.setProperty('--sidebar-width', `${clamp(px)}px`);
    };

    let dragging = false;
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      setWidth(e.clientX - sidebar.getBoundingClientRect().left);
    };
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-resizing-sidebar');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      try {
        handle.releasePointerCapture?.(activePointerId);
      } catch {
        // no capture held
      }
    };
    let activePointerId = -1;
    handle.addEventListener('pointerdown', (e) => {
      if (this.viewState.isZenMode || !this.viewState.getState().sidebarVisible) return;
      dragging = true;
      activePointerId = e.pointerId;
      try {
        handle.setPointerCapture?.(e.pointerId);
      } catch {
        // capture unavailable — window listeners below still track the drag
      }
      document.body.classList.add('is-resizing-sidebar');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
      window.addEventListener('blur', stop);
      e.preventDefault();
    });

    // Keyboard path (NFR-8, reserved-keys.md §3b): focus the handle, then
    // Left/Right nudges the width; Home/End jump to the min/a comfortable max.
    handle.setAttribute('tabindex', '0');
    handle.addEventListener('keydown', (e) => {
      if (this.viewState.isZenMode || !this.viewState.getState().sidebarVisible) return;
      const current = sidebar.getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') setWidth(current - 16);
      else if (e.key === 'ArrowRight') setWidth(current + 16);
      else if (e.key === 'Home') setWidth(MIN);
      else if (e.key === 'End') setWidth(Math.round((window.innerWidth || 1280) * 0.4));
      else return;
      e.preventDefault();
    });
  }

  private currentFolderRequestId = 0;
  private lastActivationPromise: Promise<void> = Promise.resolve();
  /**
   * Per-folder-tab Explorer state (v0.3 D-5, WK-098/099) — expansion,
   * selection, and scroll position, keyed by folder-tab id (not by path:
   * two tabs on the same path keep independent state, PLAN Phase 4's
   * "같은 경로로 연 탭들도 각각 다른 상태를 유지한다"). Lives only on
   * `WorkbenchApp`, not on `FolderTabsController` or `TreeController` —
   * neither of those needs to know the other exists.
   */
  private explorerStateByTab = new Map<string, ExplorerState>();
  private activeFolderTabId: string | null = null;
  /**
   * The tab id currently mid-`restoreExpanded()`, or null. While set, the
   * live tree reflects a PARTIALLY restored state for that tab — capturing
   * and saving it (on switch-away or on any other persist trigger) would
   * silently downgrade that tab's own last-known-good snapshot to whatever
   * had loaded so far (A4 R1 Critical finding). Every capture site checks
   * this before overwriting `explorerStateByTab`.
   */
  private restoringTabId: string | null = null;
  /**
   * The `currentFolderRequestId` value of whichever `activateFolderTab()`
   * call currently owns `restoringTabId` — an ABA guard (A4 R3 Critical
   * finding). Two overlapping restorations of the SAME tab (switch to A,
   * away, back to A while the first A restoration is still finishing) both
   * compare equal on tab id alone; comparing the request id too means only
   * the call that actually set `restoringTabId` may clear it, so an older,
   * cancelled restoration's `finally` can never wipe a newer one's guard.
   */
  private restoringReqId: number | null = null;

  private captureExplorerState(): ExplorerState | null {
    if (!this.tree.getRoot()) return null;
    return {
      expandedIds: this.tree.getExpandedIds(),
      selectedIds: this.tree.getSelectedIds(),
      focusedId: this.tree.getFocusedId(),
      scrollTop: this.tree.getScrollTop(),
    };
  }

  /**
   * Points the Explorer's one tree root at `tab.path` (v0.3 D-1, D-9). Does
   * not touch the folder-tabs list itself — that is `FolderTabsController`'s
   * job. Called whenever a folder tab is activated.
   */
  private async activateFolderTab(tab: FolderTab): Promise<void> {
    const reqId = ++this.currentFolderRequestId;
    // Save the OUTGOING tab's Explorer state before switching away (D-5,
    // WK-099) — capturing from the live tree, not from whatever was saved
    // last time, so mid-session browsing on that tab isn't lost. Skipped if
    // that tab's OWN restoration is still in flight (see restoringTabId's
    // doc comment) — its last-known-good snapshot is already correct and
    // must not be replaced with a partial one.
    if (
      this.activeFolderTabId &&
      this.activeFolderTabId !== tab.id &&
      this.restoringTabId !== this.activeFolderTabId
    ) {
      const outgoing = this.captureExplorerState();
      if (outgoing) this.explorerStateByTab.set(this.activeFolderTabId, outgoing);
    }
    const folderPath = tab.path;
    this.statusMessages.startProgress(`Opening folder: ${folderPath}`);
    try {
      const rootNode = await this.fsProvider.createRootNode(folderPath);
      if (this.currentFolderRequestId !== reqId) {
        return;
      }
      this.tree.setRoot(rootNode);
      this.activeFolderTabId = tab.id;
      // A retry that just succeeded (via "Locate Folder…") clears whatever
      // error this tab was showing (v0.3 D-6).
      this.folderTabs.setTabError(tab.id, null);
      if (this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = folderPath;
      }
      this.addRecentFolder(folderPath);
      this.statusMessages.stopProgress();

      // Restore this tab's own saved expansion/selection/scroll, if any
      // (D-5, WK-098/099). `setRoot` above already put the tree in its
      // default "just the root expanded" state — this replaces that with
      // whatever this SPECIFIC tab had last time it was active.
      const saved = this.explorerStateByTab.get(tab.id);
      if (saved) {
        this.restoringTabId = tab.id;
        this.restoringReqId = reqId;
        try {
          await this.tree.restoreExpanded(saved.expandedIds);
          if (this.currentFolderRequestId !== reqId) return;
          this.tree.restoreSelection(saved.selectedIds, saved.focusedId);
          this.tree.setScrollTop(saved.scrollTop);
        } finally {
          // Compare-and-clear keyed by reqId, not tab id (A4 R3 Critical
          // finding — comparing only tab id is an ABA race: switching to A,
          // away, and back to A again while the FIRST A restoration is still
          // in flight means two calls both compare equal on tab id, so the
          // older one's finally could still clear the newer one's guard).
          // Only the call that actually set restoringReqId may clear it.
          if (this.restoringReqId === reqId) {
            this.restoringTabId = null;
            this.restoringReqId = null;
          }
        }
      }
      this.persistFolderTabs();
    } catch (err) {
      if (this.currentFolderRequestId !== reqId) {
        return;
      }
      // The path is gone (deleted/moved) or otherwise unreadable — mark the
      // TAB itself, not just a transient status-bar line, and never remove
      // it (v0.3 D-6). The Explorer goes back to its pre-open empty state;
      // there is nothing valid to show for this tab right now.
      const message = `Error opening folder: ${String(err)}`;
      this.tree.clearRoot();
      this.activeFolderTabId = tab.id;
      if (this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = folderPath;
      }
      this.statusMessages.showError(message);
      this.folderTabs.setTabError(tab.id, message);
      this.persistFolderTabs();
    }
  }

  /**
   * Serializes the folder-tab list, the active tab, and every tab's saved
   * Explorer state to `localStorage` (v0.3 D-5, WK-100/101). Called after
   * every folder-tabs mutation (`FolderTabsController.onChange`) and once
   * more on `beforeunload` as a safety net for whatever browsing happened on
   * the currently active tab since its last save point.
   */
  private persistFolderTabs(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      // Same guard as activateFolderTab's outgoing-state capture above — a
      // persist triggered by something else (reorder, alias, …) while the
      // active tab's own restoration is still in flight must not overwrite
      // its last-known-good snapshot with the partial live state (A4 R1
      // Critical finding).
      if (this.activeFolderTabId && this.restoringTabId !== this.activeFolderTabId) {
        const live = this.captureExplorerState();
        if (live) this.explorerStateByTab.set(this.activeFolderTabId, live);
      }
      const explorerState: Record<string, ExplorerState> = {};
      for (const [id, state] of this.explorerStateByTab) {
        explorerState[id] = state;
      }
      const payload = {
        tabs: this.folderTabs.getTabs(),
        activeTabId: this.folderTabs.getActiveTab()?.id ?? null,
        explorerState,
      };
      localStorage.setItem('workbench:folder-tabs', JSON.stringify(payload));
    } catch {
      // Ignore localStorage errors (quota, disabled storage, …) — restart
      // restoration degrading to "start empty" is acceptable; a thrown
      // error from a save-path is not.
    }
  }

  /**
   * Restart restoration (v0.3 D-5, WK-100/101): registered folders, order,
   * aliases, the last active tab, and each tab's Explorer state. Called once
   * at startup. A missing or unparsable record just leaves the rail empty —
   * the same shape a first run has.
   */
  public async restoreFolderTabs(): Promise<void> {
    let raw: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem('workbench:folder-tabs');
      }
    } catch {
      return;
    }
    if (!raw) return;

    let data: { tabs?: FolderTab[]; activeTabId?: string | null; explorerState?: Record<string, ExplorerState> };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) return;

    this.folderTabs.restoreTabs(data.tabs, data.activeTabId ?? null);
    for (const [id, state] of Object.entries(data.explorerState || {})) {
      this.explorerStateByTab.set(id, state);
    }

    const activeTab = this.folderTabs.getActiveTab();
    if (activeTab) {
      await this.activateFolderTab(activeTab);
    }
  }

  /**
   * Compatibility shim for the v0.1/v0.2 verification suites, which still
   * call `app.openFolder(path)` directly (A1 R1 High finding: removing the
   * method outright made those suites throw TypeError instead of failing
   * individual assertions on the intentionally changed behavior). Adds a new
   * folder tab exactly like `Open Folder...` does now (v0.3 D-3) — it no
   * longer replaces the active root.
   */
  public async openFolder(path: string): Promise<FolderTab> {
    const tab = this.folderTabs.addTab(path);
    // addTab() activates synchronously but the activation itself (reading
    // the directory, setting the tree root) is async — await it so old
    // callers doing `await app.openFolder(path); tree.getRoot()` still see a
    // settled root, not a race (A1 R2 Minor finding).
    await this.lastActivationPromise;
    return tab;
  }

  /**
   * Compatibility shim, same reason as `openFolder` above. v0.2 restored the
   * single last-opened folder here; v0.3 removes that path entirely (D-3,
   * WK-087) — nothing is stored to restore, so this is now an intentional
   * no-op. Restart restoration of the whole folder-tab list is Phase 4's job
   * (D-5), not this method's.
   */
  public async restoreLastSession(): Promise<void> {
    // Intentionally empty.
  }

  /**
   * Clears root and returns tree to empty state without altering editor tabs
   * (FR-G1, FR-N6c).
   */
  public closeFolder(): void {
    this.currentFolderRequestId++;
    this.tree.clearRoot();
    if (this.layout.statusbarPath) {
      this.layout.statusbarPath.textContent = '';
    }
    // Same fix as the onEmpty() handler above — a folder still loading when
    // this fires would otherwise leave "Opening folder: …" stuck forever
    // (A2 R1 Major finding, same root cause).
    this.statusMessages.stopProgress();
    // Without this the folder tab that had been active stayed visually
    // active while pointing at an empty Explorer, and clicking it again did
    // nothing (activateTab() treats "already active" as a no-op) — A1 R1
    // Medium finding.
    this.folderTabs.clearActive();
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

  /** `Open Folder...` always adds a new folder tab; it never replaces the active one (v0.3 D-3). */
  public async handleOpenFolderDialog(): Promise<void> {
    const selected = await promptOpenFolderDialog();
    if (selected) {
      this.folderTabs.addTab(selected);
    }
  }

  /**
   * "Locate Folder…" on an error tab (v0.3 D-6, WK-103) — re-points that
   * EXACT tab at a new path (same id, alias, and rail position) and retries
   * loading it immediately, rather than opening a brand new tab. The tab
   * being relocated is not always the currently ACTIVE one (A5 R1 Major
   * finding: relocating an inactive error tab used to move the Explorer
   * root to it without moving the rail's own highlight, leaving the two
   * visibly out of sync) — this always syncs `folderTabs`'s active id first,
   * then forces the actual reload itself only when that sync alone would
   * not have triggered one (i.e. the tab was already active, so
   * `activateTab`'s `onActivate` — which normally drives the reload — does
   * not fire for an unchanged id).
   */
  private async handleRelocateFolderTab(id: string): Promise<void> {
    const selected = await promptOpenFolderDialog();
    if (!selected) return;
    const tab = this.folderTabs.setTabPath(id, selected);
    if (!tab) return;
    const wasAlreadyActive = this.folderTabs.getActiveTab()?.id === tab.id;
    this.folderTabs.activateTab(tab.id);
    if (wasAlreadyActive) {
      this.lastActivationPromise = this.activateFolderTab(tab);
    }
  }

  public handleOpenRecentFolder(): void {
    if (this.recentFolders.length > 0) {
      this.folderTabs.addTab(this.recentFolders[0]);
    }
  }

  /** Drops one path from the stored list; it stays gone after a restart (v0.2 FR-M7). */
  public removeRecentFolder(folderPath: string): void {
    this.recentFolders = this.recentFolders.filter((p) => p !== folderPath);
    this.saveRecentFolders();
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
      setSidebarNewItemHandler: (fn) => this.explorerTitlebar.setNewItemHandler(fn),
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
    this.saveRecentFolders();
  }

  private saveRecentFolders(): void {
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
  // v0.2 restored the single last-opened folder here; v0.3 replaces that
  // with the whole folder-tab list — registered folders, order, aliases,
  // the last active tab, and each tab's Explorer state (D-3, D-5,
  // WK-100/101).
  void appInstance.restoreFolderTabs();
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
