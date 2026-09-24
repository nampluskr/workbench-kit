import { createWorkbenchLayout, WorkbenchLayoutElements } from './core/layout';
import { setupWindowControls, setupResizeGrips, closeWindow } from './core/window';
import { ConfirmDialogController } from './core/dialog';
import { AboutDialogController } from './core/about';
import { StatusMessageController } from './core/statusmessage';
import { TextEditorView, setEditorColorTheme, getLineNumbersVisible, setLineNumbersVisible, getWordWrapEnabled, setWordWrapEnabled, findTextViewWithin, type EditCommandId } from './core/texteditor';
import { MenuController } from './core/menu';
import { ActivityBarController } from './core/activitybar';
import { ViewStateManager } from './core/viewstate';
import { FocusAreaController } from './core/focusareas';
import { ThemeManager, ColorTheme } from './core/theme';
import { IconThemeManager, FileIconThemeId } from './core/icontheme';
import { SetiResolver, VscodeIconsResolver, SimpleResolver } from './icons';
import { TreeController, TreeNode } from './core/tree';
import { FolderTabsController, FolderTab, driveIconInnerMarkup } from './core/foldertabs';
import { ExplorerTitlebarController } from './core/sidebar';
import { FileSystemTreeProvider, promptOpenFolderDialog, promptOpenFileDialog, listDrives } from './providers/filesystem';
import { EditorController, EditorOpenMode, snapshotHasDirtyPanels } from './core/editor';
import type { SerializedDockview, DockviewGroupPanel, IDockviewPanel } from 'dockview-core';
import { ContextMenuController, ContextMenuItem } from './core/contextmenu';
import { ResourceKindRegistry } from './registry/kind-registry';
import { registerFilePreset, FILE_KIND, getFileModeLabel, isLegacyEncoded } from './presets/file-preset';
import { registerFolderPreset, FOLDER_KIND } from './presets/folder-preset';
import { closeTerminalSession, registerTerminalPreset, TERMINAL_KIND } from './presets/terminal-preset';
import { AppEditorSurface, createAppEditorSurface } from './core/editor';
import { MenuItem } from './core/menu';
import { ActivityBarItem } from './core/activitybar';
import { ViewAction } from './core/sidebar';
import { TooltipController } from './core/tooltip';
import { clearFilter, describeExtensions, getFilter, isFilterActive, onFilterChange } from './providers/extension-filter';
import { ExtensionFilterPanel } from './presets/extension-filter-panel';
import { ExplorerFileOps } from './presets/explorer-file-ops';
import { checkTextFile, type TextEncodingId } from './presets/file-types';

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
 * How a folder-tab switch affects the editor (v0.3 D-7).
 * - `shared`: one editor layout, independent of the active folder tab.
 * - `workspace`: each folder tab keeps its own editor tabs/split/active tab.
 */
type EditorMode = 'shared' | 'workspace';

/**
 * The minimal shape `openFromEntry`/`buildResourceContextMenuItems` need to
 * open or build a menu for a resource (WK-113, 2026-09-21). `TreeNode` and
 * `HostDirectoryEntry` (folder file-list rows) both satisfy this
 * structurally, which is what lets the Explorer tree and a folder tab's
 * flat file list share the exact same open-mode and context-menu rules
 * without either one importing the other's type.
 */
interface OpenableEntry {
  id: string;
  label: string;
  isContainer?: boolean;
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
  /** Explorer create / rename on disk (D-14). */
  public explorerFileOps!: ExplorerFileOps;
  /** Latest file-open request; an older one whose text check finishes later is dropped (D-15). */
  private textOpenSeq = 0;
  public explorerTitlebar: ExplorerTitlebarController;
  public fsProvider: FileSystemTreeProvider;
  public editor: EditorController;
  public tooltip: TooltipController;
  public kindRegistry: ResourceKindRegistry;
  public contextMenu: ContextMenuController;
  public confirmDialog: ConfirmDialogController;
  public aboutDialog: AboutDialogController;
  public statusMessages: StatusMessageController;
  /** App-supplied item providers for the right-click device (FR-G6). Empty by default (D-22). */
  public contextMenuItemsForTreeNode: (nodeId: string) => ContextMenuItem[] = () => [];
  public contextMenuItemsForPanel: (panelId: string) => ContextMenuItem[] = () => [];
  private recentFolders: string[] = [];
  private defaultFileMode: 'editor' | 'viewer' = 'viewer';
  private defaultFolderMode: 'file-list' | 'cmd' | 'terminal' = 'file-list';
  /** See `openFromEntry` — coalesces requests while a dirty-preview confirm is on screen. */
  private pendingOpenEntry: { entry: OpenableEntry; mode: EditorOpenMode } | null = null;

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

    // Themed hover text in place of the OS tooltip for every `title` (user
    // request, 2026-09-23) — see src/core/tooltip.ts.
    this.tooltip = new TooltipController();

    // Resource kind registration slot + minimal example presets (FR-I1, FR-I2, FR-I3, WK-025, WK-026)
    this.kindRegistry = new ResourceKindRegistry();
    registerFilePreset(this.kindRegistry, { iconTheme: this.iconTheme });
    registerFolderPreset(this.kindRegistry, { iconTheme: this.iconTheme });
    registerTerminalPreset(this.kindRegistry);
    this.editor.setComponentFactory(this.kindRegistry.createComponentFactory(this.editor));
    this.editor.setSaveHandler((panelId) => this.kindRegistry.save(panelId));
    // Tab icons and the Viewer lock come from each kind's own decorator; an
    // icon or color theme switch redraws them like the Explorer tree's rows.
    this.editor.setTabDecorator((params, title) => this.kindRegistry.describeTab(params, title));
    this.iconTheme.onThemeChange(() => this.editor.refreshTabDecorations());
    this.iconTheme.onColorThemeChange(() => this.editor.refreshTabDecorations());
    this.editor.setPanelClosedHandler((panel) => {
      if (panel.params?.kind === TERMINAL_KIND && typeof panel.params.terminalSessionKey === 'string') {
        closeTerminalSession(panel.params.terminalSessionKey);
      }
    });

    try {
      if (typeof localStorage !== 'undefined') {
        const fm = localStorage.getItem('workbench:default-file-mode');
        if (fm === 'viewer') this.defaultFileMode = fm;
        const dm = localStorage.getItem('workbench:default-folder-mode');
        if (dm === 'file-list' || dm === 'cmd' || dm === 'terminal') this.defaultFolderMode = dm;
      }
    } catch {
      // Ignore localStorage errors
    }

    this.layout.statusbarModeBtn?.addEventListener('click', () => {
      const panel = this.editor.getActivePanel();
      if (!panel) return;
      const kind = panel.params?.kind;
      if (kind === FILE_KIND) {
        const currentMode = panel.params?.mode || this.defaultFileMode;
        const nextMode = currentMode === 'editor' ? 'viewer' : 'editor';
        this.setActivePanelMode(nextMode);
      }
    });
    this.editor.onActivePanelChange((panel) => {
      this.updateStatusbarMode();
      if (panel?.id) {
        this.kindRegistry.focusPanel(panel.id);
      }
    });
    this.editor.onLayoutChange(() => this.updateStatusbarMode());
    this.updateStatusbarMode();

    // Right-click menu device, default off (FR-G5, FR-G6, D-22, WK-030)
    this.contextMenu = new ContextMenuController(this.layout.root);

    // Save-confirmation dialog (FR-L2 ~ FR-L7, D-28) and status message/progress line (D-21, D-32)
    this.confirmDialog = new ConfirmDialogController(this.layout.root);
    this.editor.setDialogController(this.confirmDialog);
    this.statusMessages = new StatusMessageController(this.layout.statusbarMessage);

    // Help > About (FR-Q5, D-23, WK-037): required attribution for the two
    // CC-licensed icon sets.
    this.aboutDialog = new AboutDialogController(this.layout.root, appInfoBase(), {
      version: __WB_VERSION__,
      commitDate: __WB_COMMIT_DATE__,
    });
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
    // Explorer's own Refresh (button click, or its native-button keyboard
    // path — Tab + Enter/Space, reserved-keys.md §5) now also re-reads
    // every open folder file-list tab (v0.3 WK-117, out-of-plan addition,
    // 2026-09-23 — user request: its own per-tab Refresh button is gone).
    this.explorerTitlebar.onRefresh(() => {
      for (const panel of this.editor.getApi().panels) {
        if (panel.params?.kind === FOLDER_KIND) this.kindRegistry.refreshPanel(panel.id);
      }
    });
    this.fsProvider = new FileSystemTreeProvider();
    this.tree.setDataProvider(this.fsProvider);

    // Folder Tabs rail (v0.3 D-1, D-3, D-4): registers working folders as
    // tabs instead of the Explorer having a single swappable root. Add
    // Folder does the same dialog + registration `Open Folder` does.
    this.folderTabs = new FolderTabsController(
      this.layout.folderTabsList,
      this.layout.folderTabsAddBtn,
      this.iconTheme
    );
    this.folderTabs.onAddRequested = () => this.handleOpenFolderDialog();
    // "Add All Drives" toggle (v0.3 WK-111): adds every accessible drive at
    // once, or removes all of them if any are currently showing. The
    // button's own pressed state always reflects `hasDriveTabs()` after
    // every render, so it stays correct if drives are ever removed some
    // other way (e.g. `restoreTabs()` on a fresh restart never restoring
    // hardware that is no longer physically present).
    this.layout.folderTabsDrivesBtn?.addEventListener('click', () => {
      void this.handleToggleDriveTabs();
    });
    this.folderTabs.onChange(() => this.refreshDrivesButtonState());
    this.refreshDrivesButtonState();
    // "Locate Folder…" on an error tab (v0.3 D-6, WK-103).
    this.folderTabs.onRelocateRequested = (id) => {
      void this.handleRelocateFolderTab(id);
    };
    // A folder tab's own right-click menu (v0.3 WK-114/WK-115, out-of-plan
    // addition, 2026-09-23 — user request). Rename/Color used to be header
    // icons that always acted on the active tab; both moved here so they
    // act on whichever tab was actually right-clicked (WK-115). Below the
    // separator: the same three "open a folder" choices
    // `buildResourceContextMenuItems` already offers for a container, now
    // reachable from the rail itself, not just the Explorer tree (WK-114).
    // `tab.path` is the tab's actual filesystem root regardless of any
    // user-set alias, so opened resources still title/target correctly.
    // Rename is omitted for a 'drive-scan' tab (no individual rename of its
    // own — same restriction `beginRename()` already enforces); Color has
    // no such restriction (WK-112).
    this.folderTabs.onContextMenu((tab, x, y) => {
      const items: ContextMenuItem[] = [];
      if (tab.origin !== 'drive-scan') {
        items.push({ id: 'foldertab:rename', label: 'Rename', action: () => this.folderTabs.beginRename(tab.id) });
      }
      items.push({ id: 'foldertab:color', label: 'Color', action: () => this.folderTabs.openColorPicker(tab.id, x, y) });
      items.push({ id: 'foldertab:separator', label: '', type: 'separator' });
      items.push(...this.buildResourceContextMenuItems(tab.path, this.folderTabs.displayName(tab), true));
      this.contextMenu.show(x, y, items);
    });
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
      // No folder tab left to have a workspace — Folder Workspace mode has
      // nothing to show either (v0.3 D-7).
      if (this.editorMode === 'workspace') {
        this.editor.clear();
      }
    });
    // Drop a closed tab's saved Explorer state immediately — otherwise it
    // stays in the map forever and can leak onto a later, unrelated tab
    // that happens to reuse the same id after a restart (A4 R1 Critical
    // finding).
    this.folderTabs.onRemove((id) => {
      this.explorerStateByTab.delete(id);
      // Same reasoning, same bug class, for Folder Workspace's per-tab
      // editor layouts (v0.3 D-7) — never persisted so there is no
      // localStorage-shaped version of the A4 R1 finding to repeat, but a
      // closed tab's id being reused within THIS session (nextSeq only
      // increases, so unlikely but not the point — the map entry is simply
      // stale data with no owner) would still be wrong to hand to a new tab.
      this.folderWorkspaceByTab.delete(id);
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

    // Bind File menu actions (FR-A1, FR-N6a).
    this.menu.setAction('file:open-file', () => void this.handleOpenFileDialog());
    this.menu.setAction('file:open-folder', () => void this.handleOpenFolderDialog());
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

    // The sidebar title is always TREE — the open folder's name shows in
    // the tree's root row, not the header (v0.2 FR-X1, UT-EXP-001, v0.3 user request).
    if (this.layout.sidebarTitle) {
      this.layout.sidebarTitle.textContent = 'TREE';
    }
    this.tree.onRootChange((root) => {
      if (!root && this.layout.statusbarPath) {
        this.layout.statusbarPath.textContent = '';
      }
    });

    // View titlebar's New File / New Folder and F2 rename: the shell opens the
    // inline inputs; the app does the actual create / rename on disk (v0.2
    // FR-X4, D-6, D-14). Renamed paths carry their open tabs along.
    this.explorerFileOps = new ExplorerFileOps({
      tree: this.tree,
      editor: this.editor,
      showMessage: (text) => this.statusMessages.showMessage(text),
      showError: (text) => this.statusMessages.showError(text),
      refreshViews: async () => {
        // Refresh button path: the tree plus every file-list tab (WK-117).
        this.explorerTitlebar.refresh();
        await this.tree.refresh();
      },
    });
    this.explorerTitlebar.setNewItemHandler((req) => void this.explorerFileOps.create(req));
    // F2 is not a shell key (reserved-keys.md §4) — the app binds it on the
    // Explorer, for the focused tree row only.
    this.layout.sidebarContent.addEventListener('keydown', (e) => {
      if (e.key !== 'F2' || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      if (!(e.target as HTMLElement | null)?.closest?.('.tree-list')) return;
      const nodeId = this.tree.getFocusedId();
      if (!nodeId) return;
      e.preventDefault();
      this.explorerFileOps.beginRename(nodeId);
    });

    // Explorer width: a drag handle between the tree and the editor area
    // (v0.2 FR-X5 ~ FR-X7). The width is not persisted (D-8) — a restart
    // starts at the initial value baked into --sidebar-width.
    this.setupSidebarResize();

    // Folder Tabs rail width: same default/min/max and drag behavior as the
    // Explorer's own resize handle above (user request, 2026-09-17). Also
    // not persisted, for the same reason.
    this.setupFolderTabsResize();

    // Bind sidebar, titlebar, statusbar, and zen toggles
    // Titlebar/statusbar toggles also flip their Activity Bar chevron to
    // point the opposite way once hidden (user request, 2026-09-12) —
    // wrapped here so it happens the same way whether triggered from the
    // menu or the Activity Bar button itself.
    const toggleTitlebar = () => {
      const visible = this.viewState.toggleTitlebar();
      this.activityBar.setItemIcon('activity:toggle-titlebar', visible ? 'codicon-fold-down' : 'codicon-fold-up');
    };
    const toggleStatusbar = () => {
      const visible = this.viewState.toggleStatusbar();
      this.activityBar.setItemIcon('activity:toggle-statusbar', visible ? 'codicon-fold-up' : 'codicon-fold-down');
    };
    this.menu.setAction('view:toggle-navigation', () => this.viewState.toggleNavigationAreas());
    this.menu.setAction('view:toggle-sidebar', () => this.viewState.toggleSidebar());
    this.menu.setAction('view:toggle-titlebar', toggleTitlebar);
    this.menu.setAction('view:toggle-statusbar', toggleStatusbar);
    this.menu.setAction('view:toggle-foldertabs', () => this.viewState.toggleFolderTabs());
    this.menu.setAction('view:toggle-word-wrap', () => setWordWrapEnabled(!getWordWrapEnabled()));
    this.menu.setAction('view:toggle-line-numbers', () => setLineNumbersVisible(!getLineNumbersVisible()));
    this.menu.setAction('view:zen-mode', () => this.viewState.toggleZenMode());
    // Each row's check mark is read from the live state whenever the menu is
    // drawn, so a change made by key, title bar or Activity Bar shows the next
    // time the menu opens (UT-MNU-002).
    this.menu.setCheckedProvider('view:zen-mode', () => this.viewState.isZenMode);
    this.menu.setCheckedProvider(
      'view:toggle-navigation',
      () => this.viewState.getState().sidebarVisible || this.viewState.getState().folderTabsVisible
    );
    this.menu.setCheckedProvider('view:toggle-sidebar', () => this.viewState.getState().sidebarVisible);
    this.menu.setCheckedProvider('view:toggle-titlebar', () => this.viewState.getState().titlebarVisible);
    this.menu.setCheckedProvider('view:toggle-statusbar', () => this.viewState.getState().statusbarVisible);
    // The Activity Bar icon and this row watch the same state (v0.3 D-2).
    this.menu.setCheckedProvider('view:toggle-foldertabs', () => this.viewState.getState().folderTabsVisible);
    this.menu.setCheckedProvider('view:toggle-word-wrap', () => getWordWrapEnabled());
    this.menu.setCheckedProvider('view:toggle-line-numbers', () => getLineNumbersVisible());

    // One positive setting replaces the former pair of mode rows. Checked is
    // per-folder editor state; unchecked is one editor layout shared by roots.
    this.menu.setAction('view:editor-mode-workspace', () =>
      this.setEditorMode(this.editorMode === 'workspace' ? 'shared' : 'workspace')
    );
    this.menu.setCheckedProvider('view:editor-mode-workspace', () => this.editorMode === 'workspace');

    this.menu.setSubmenuProvider('view:layout', () => [
      { id: 'view:toggle-navigation', label: 'Show Sidebar', shortcut: 'Ctrl+B' },
      { id: 'view:toggle-foldertabs', label: 'Show Roots' },
      { id: 'view:toggle-sidebar', label: 'Show Tree' },
      { id: 'view:layout:separator-navigation', label: '', type: 'separator' },
      { id: 'file:split-right', label: 'Split Right', shortcut: 'Ctrl+\\' },
      { id: 'file:split-down', label: 'Split Down', shortcut: 'Ctrl+K Ctrl+\\' },
      { id: 'view:layout:separator-workspace', label: '', type: 'separator' },
      { id: 'view:editor-mode-workspace', label: 'Workspace per Folder' },
    ]);

    this.menu.setSubmenuProvider('view:appearance', () => [
      { id: 'view:color-theme', label: 'Color Theme', type: 'submenu' },
      { id: 'view:icon-theme', label: 'Icon Theme', type: 'submenu' },
      { id: 'view:appearance:separator-theme', label: '', type: 'separator' },
      { id: 'view:toggle-titlebar', label: 'Show Title Bar' },
      { id: 'view:toggle-statusbar', label: 'Show Status Bar' },
      // Wraps text / document files at the tab width (user request, 2026-09-24).
      { id: 'view:toggle-word-wrap', label: 'Word Wrap' },
      { id: 'view:toggle-line-numbers', label: 'Show Line Numbers' },
      { id: 'view:appearance:separator-zen', label: '', type: 'separator' },
      { id: 'view:zen-mode', label: 'Zen Mode', shortcut: 'F11' },
    ]);

    // File-only, always (v0.3 WK-124, user request): this used to switch to
    // folder/terminal-specific content when one of those was the active tab
    // (Level 1 open modes, 2026-09-19) — reverted. It is now the DEFAULT
    // mode new file tabs open in on an Explorer left click
    // (`this.defaultFileMode`, read by `openFromEntry`/`handleOpenFileDialog`
    // etc.), not the active tab's own mode — picking an item here persists
    // that default (`setDefaultFileMode`, previously dead code with no UI
    // caller) and does not touch whatever tab happens to be open right now.
    // Overriding a SPECIFIC file's mode stays a right-click/statusbar-button
    // affair (`buildResourceContextMenuItems`'s Open as Viewer/Editor,
    // `setActivePanelMode`) — a deliberate split between "default" and
    // "this one tab's override".
    this.menu.setSubmenuProvider('view:tab-mode', () => {
      const current = this.getDefaultFileMode();
      return [
        {
          id: 'view:tab-mode:file-editor',
          label: 'Editor',
          checked: current === 'editor',
          action: () => this.setDefaultFileMode('editor'),
        },
        {
          id: 'view:tab-mode:file-viewer',
          label: 'Viewer',
          checked: current === 'viewer',
          action: () => this.setDefaultFileMode('viewer'),
        },
      ];
    });

    this.activityBar.setAction('activity:toggle-sidebar', () => this.viewState.toggleSidebar());
    this.activityBar.setAction('activity:toggle-titlebar', toggleTitlebar);
    this.activityBar.setAction('activity:toggle-statusbar', toggleStatusbar);
    this.activityBar.setAction('activity:toggle-foldertabs', () => this.viewState.toggleFolderTabs());

    // File extension filter (user request, 2026-09-23 — D-12): one global
    // setting the Explorer tree and every folder file-list tab read. The
    // Activity Bar button opens the filter popup and turns filled while a
    // filter is on; its hover text spells the filter out.
    const fileFilterPanel = new ExtensionFilterPanel();
    const openFileFilter = () => fileFilterPanel.toggle(this.activityBar.getItemElement('activity:file-filter'));
    this.activityBar.setAction('activity:file-filter', openFileFilter);
    const showFileFilterState = () => {
      const f = getFilter();
      this.activityBar.setItemIcon('activity:file-filter', isFilterActive() ? 'codicon-filter-filled' : 'codicon-filter');
      this.activityBar.setItemLabel(
        'activity:file-filter',
        isFilterActive()
          ? `File Filter — Include: ${describeExtensions(f.include, 'none')} · Exclude: ${describeExtensions(f.exclude, 'none')}`
          : 'File Filter'
      );
    };
    showFileFilterState();
    onFilterChange(() => {
      showFileFilterState();
      // Folder file-list tabs re-render themselves; the tree re-reads,
      // keeping its expansion and selection (TreeController.refresh()).
      void this.tree.refresh();
    });
    // Just the two commands (user request, 2026-09-24: the read-only
    // Include/Exclude rows are gone — the Activity Bar button's icon and
    // hover text already show the current filter).
    this.menu.setSubmenuProvider('view:file-filter', () => [
      {
        id: 'view:file-filter:edit',
        label: 'Edit Filter...',
        action: () => fileFilterPanel.open(this.activityBar.getItemElement('activity:file-filter')),
      },
      { id: 'view:file-filter:clear', label: 'Clear Filter', disabled: !isFilterActive(), action: () => clearFilter() },
    ]);

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
    // The actual preview/pinned/dirty-confirm rules live in `openFromEntry`
    // (a class method, not a local closure here) so folder-list rows
    // (WK-113) can share them byte-for-byte instead of re-deriving the same
    // three rounds of adversarial findings (A9 R1/R3) independently.

    // A folder row no longer opens anything of its own on click/dblclick/
    // Enter (v0.3 WK-114, out-of-plan addition, 2026-09-23 — user request):
    // the Explorer is now pure navigation (arrow keys, expand/collapse) +
    // file selection. Opening a folder (file list/CMD/PowerShell) moved to
    // the folder tab rail's own right-click menu. Arrow-key navigation and
    // Space/dblclick expand-collapse are untouched — neither goes through
    // onOpen/onConfirm/onEnterOpen.
    // Every file open first checks that the file reads as text (D-15).
    this.tree.onOpen((node) => {
      if (!node.isContainer) void this.openIfText(node.id, node.label, (enc) => this.openFromEntry(node, 'preview', enc));
    });
    // A double click on a file row: the user is keeping this one
    // (v0.2 FR-P4).
    this.tree.onConfirm((node) => {
      if (!node.isContainer) void this.openIfText(node.id, node.label, (enc) => this.openFromEntry(node, 'pinned', enc));
    });
    this.tree.onEnterOpen((node) => {
      if (!node.isContainer) void this.openIfText(node.id, node.label, (enc) => this.openEntryOnEnter(node, enc));
    });
    // Ctrl+Enter "open to side" (FR-A14) is another opening trigger, same
    // family as onOpen/onConfirm/onEnterOpen above — a folder no longer
    // opens through the Explorer by any of them (WK-114, out-of-plan
    // addition, 2026-09-23 — user request).
    this.tree.onOpenToSide((node) => {
      if (node.isContainer) return;
      void this.openIfText(node.id, node.label, (enc) => this.openFileToSide(node, enc));
    });

    // The resource opener owns the tree's right-click choices.
    this.contextMenu.setEnabled(true);
    this.contextMenuItemsForTreeNode = (nodeId) => {
      const node = this.tree.getNodeById(nodeId);
      if (!node) return [];
      // A folder row's own "open a folder" choices moved to the folder tab
      // rail's right-click menu (v0.3 WK-114, out-of-plan addition,
      // 2026-09-23 — user request). A file row is unaffected — ContextMenu
      // Controller.show() already no-ops on zero items (FR-G5).
      if (node.isContainer) return [];
      return this.buildResourceContextMenuItems(node.id, node.label, node.isContainer);
    };
    this.layout.sidebarContent.addEventListener('contextmenu', (e) => {
      const row = (e.target as HTMLElement).closest('.tree-row') as HTMLElement | null;
      if (!row) return;
      e.preventDefault();
      const nodeId = row.getAttribute('data-id');
      // Right-click changes the selection to this row (a no-op if it was
      // already the selected one) and nothing else beyond that — no file
      // preview-open — before the menu appears (v0.3 WK-120, corrected
      // WK-122 then reverted back to this by WK-123, user request: "change
      // the selection marker" = swap the selection if different, not also
      // opening the file the way a left click does).
      if (nodeId) this.tree.focusItemById(nodeId);
      const items = nodeId ? this.contextMenuItemsForTreeNode(nodeId) : [];
      this.contextMenu.show(e.clientX, e.clientY, items);
    });

    // File menu close commands, each a different scope (v0.2 FR-M10, D-5):
    // the active tab, the active tab's whole group, every open tab.
    this.menu.setAction('file:new-tab', () => this.handleNewTab());
    this.menu.setAction('file:close-tab', () => this.editor.closeActiveTab());
    this.menu.setAction('file:close-editor-group', () => void this.editor.closeAllTabsInGroup());
    this.menu.setAction('file:close-all-tabs', () => void this.editor.closeAllTabs());

    // File > Save and the Edit menu (D-13) act on the active tab. Save goes
    // through the same app save handler as the close dialog; the Edit rows
    // drive the text view in that tab and are greyed out when there is none
    // (file list, terminal, empty tab) or the view refuses the command.
    const activeDirtyPanel = () => {
      const panel = this.editor.getActivePanel();
      return panel?.params?.isDirty ? panel : null;
    };
    this.menu.setAction('file:save', () => {
      const panel = activeDirtyPanel();
      if (panel) void this.kindRegistry.save(panel.id);
    });
    this.menu.setDisabledProvider('file:save', () => !activeDirtyPanel());
    const activeTextView = () => {
      const panel = this.editor.getActivePanel();
      const root = panel ? this.editor.getContentRenderer(panel.id)?.element : undefined;
      return root ? findTextViewWithin(root) : null;
    };
    const editRows: [string, EditCommandId][] = [
      ['edit:undo', 'undo'], ['edit:redo', 'redo'],
      ['edit:cut', 'cut'], ['edit:copy', 'copy'], ['edit:paste', 'paste'],
      ['edit:find', 'find'], ['edit:replace', 'replace'],
      ['edit:comment-line', 'commentLine'], ['edit:block-comment', 'blockComment'],
      ['edit:select-all', 'selectAll'], ['edit:add-next-occurrence', 'addNextOccurrence'],
      ['edit:cursor-above', 'cursorAbove'], ['edit:cursor-below', 'cursorBelow'],
    ];
    for (const [rowId, command] of editRows) {
      this.menu.setAction(rowId, () => activeTextView()?.runEditCommand(command));
      this.menu.setDisabledProvider(rowId, () => !activeTextView()?.canRunEditCommand(command));
    }

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

    // View > Layout split actions.
    this.menu.setAction('file:split-right', () => this.editor.splitActiveGroup('right'));
    this.menu.setAction('file:split-down', () => this.editor.splitActiveGroup('below'));

    // The status bar's app-item slot (FR-N10, WK-029) stays open but empty:
    // the "Presets: file, folder" example item was removed (user request,
    // 2026-09-23). An app appends its own `.statusbar-app-item` to
    // `layout.statusbarAppItems`; phase5-suite.js proves the slot with a
    // test item. FR-I10's view-titlebar app-action slot stays open too; a
    // real app registers through addSidebarViewAction.

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
      let pendingChord: 'ctrl-k' | null = null;
      let chordTimer: any = null;
      const resetChord = () => {
        pendingChord = null;
        if (chordTimer) {
          clearTimeout(chordTimer);
          chordTimer = null;
        }
      };

      window.addEventListener('keydown', (e) => {
        const ctrlOnly = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
        const altOnly = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
        // A12 R3 Major: a displayed shortcut must land on the same screen state
        // as clicking its row — and clicking a row closes the menu first. Run
        // the command with the menu already closed.
        const run = (fn: () => void) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.menu.isOpen) this.menu.closeMenu();
          fn();
        };

        // Handle active chord (e.g. Ctrl+K)
        if (pendingChord === 'ctrl-k') {
          if (e.key === 'Escape') {
            resetChord();
            return;
          }
          if ((ctrlOnly || (e.ctrlKey && !e.altKey && !e.metaKey)) && e.key === '\\') {
            resetChord();
            run(() => this.editor.splitActiveGroup('below'));
            return;
          }
          if ((e.key === 'w' || e.key === 'W') && !e.altKey && !e.metaKey) {
            resetChord();
            run(() => void this.editor.closeAllTabsInGroup());
            return;
          }
          if ((ctrlOnly || (e.ctrlKey && !e.altKey && !e.metaKey)) && (e.key === 'o' || e.key === 'O')) {
            resetChord();
            run(() => void this.handleOpenFolderDialog());
            return;
          }
          resetChord();
        }

        if (ctrlOnly && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          e.stopPropagation();
          pendingChord = 'ctrl-k';
          chordTimer = setTimeout(resetChord, 2000);
          return;
        }

        if (ctrlOnly && (e.key === 'o' || e.key === 'O')) {
          run(() => void this.handleOpenFileDialog());
        } else if (ctrlOnly && (e.key === 'w' || e.key === 'W')) {
          run(() => this.editor.closeActiveTab());
        } else if (ctrlOnly && (e.key === 'n' || e.key === 'N')) {
          run(() => this.handleNewTab());
        } else if (ctrlOnly && e.key === '\\') {
          run(() => this.editor.splitActiveGroup('right'));
        } else if (ctrlOnly && (e.key === 'PageDown' || e.code === 'PageDown' || e.key === 'pagedown')) {
          run(() => this.editor.cycleActivePanel(1));
        } else if (ctrlOnly && (e.key === 'PageUp' || e.code === 'PageUp' || e.key === 'pageup')) {
          run(() => this.editor.cycleActivePanel(-1));
        } else if (ctrlOnly && e.key === '0') {
          run(() => this.focusExplorerTree());
        } else if (ctrlOnly && e.key === '1') {
          run(() => this.focusEditorGroupByIndex(0));
        } else if (ctrlOnly && e.key === '2') {
          run(() => this.focusEditorGroupByIndex(1));
        } else if (ctrlOnly && (e.key === 'b' || e.key === 'B')) {
          // Ctrl+B hides the visible navigation areas, then restores that
          // exact Folder Tabs / Explorer combination on the next press.
          run(() => this.viewState.toggleNavigationAreas());
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

    // Lowered to 160 (user request, 2026-09-17). NOTE: A13's Critical
    // finding (2026-09-12) measured the full EXPLORER label + 4 shell
    // actions needing ~187px including header padding, clipping at 170px;
    // 200 was chosen specifically to sit above that floor. This 160 value
    // is below that measured floor and will very likely reintroduce that
    // same clipping when dragged to the minimum (see style.css's matching
    // .workbench-sidebar min-width comment).
    const MIN = 160;
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

  /**
   * Drag — or arrow-key nudge — the handle between the Folder Tabs rail and
   * the Explorer to resize the rail. The rail starts at 150px, stops at
   * 100px, and keeps the same ~60% of window cap and "lives only in a CSS
   * variable, never persisted" rule as the Explorer.
   */
  private setupFolderTabsResize(): void {
    const handle = this.layout.folderTabsResizeHandle;
    const rail = this.layout.folderTabsRail;
    if (!handle || !rail) return;

    const MIN = 100;
    const clamp = (px: number) => {
      const max = Math.max(MIN, Math.round((window.innerWidth || 1280) * 0.6));
      return Math.min(max, Math.max(MIN, px));
    };
    const setWidth = (px: number) => {
      this.layout.root.style.setProperty('--foldertabs-width', `${clamp(px)}px`);
    };

    let dragging = false;
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      setWidth(e.clientX - rail.getBoundingClientRect().left);
    };
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-resizing-foldertabs');
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
      if (this.viewState.isZenMode || !this.viewState.getState().folderTabsVisible) return;
      dragging = true;
      activePointerId = e.pointerId;
      try {
        handle.setPointerCapture?.(e.pointerId);
      } catch {
        // capture unavailable — window listeners below still track the drag
      }
      document.body.classList.add('is-resizing-foldertabs');
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
      if (this.viewState.isZenMode || !this.viewState.getState().folderTabsVisible) return;
      const current = rail.getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') setWidth(current - 16);
      else if (e.key === 'ArrowRight') setWidth(current + 16);
      else if (e.key === 'Home') setWidth(MIN);
      else if (e.key === 'End') setWidth(Math.round((window.innerWidth || 1280) * 0.4));
      else return;
      e.preventDefault();
    });
  }

  /**
   * Adds a new tab in the active group (Ctrl+N). Asks first if the replaced
   * preview tab is dirty (FR-P14/D-14, D-18).
   */
  private handleNewTab(): void {
    const group = this.editor.getActiveGroup();
    if (!group) return;
    const doomed = this.editor.getPreviewPanel(group);
    if (doomed?.params?.isDirty) {
      void (async () => {
        if (!(await this.editor.confirmReplaceIfDirty(doomed))) return;
        this.editor.addNewTab(group);
      })();
      return;
    }
    this.editor.addNewTab(group);
  }

  /**
   * Returns editor groups sorted in visual screen order (top-to-bottom,
   * then left-to-right), consistent with FocusAreaController (A10 finding).
   */
  private getOrderedEditorGroups(): DockviewGroupPanel[] {
    return this.editor
      .getGroups()
      .map((group) => ({ group, rect: group.element.getBoundingClientRect() }))
      .sort((a, b) => Math.round(a.rect.top) - Math.round(b.rect.top) || Math.round(a.rect.left) - Math.round(b.rect.left))
      .map((entry) => entry.group);
  }

  /**
   * Focuses the editor group by 0-based visual index (Ctrl+1, Ctrl+2).
   * If group 1 (Ctrl+2) is requested and only 1 group exists, splits right.
   */
  private focusEditorGroupByIndex(index: number): void {
    const groups = this.getOrderedEditorGroups();
    if (index < groups.length) {
      const group = groups[index];
      this.editor.focusGroup(group);
      group.activePanel?.api.setActive();
    } else if (index === 1 && groups.length === 1) {
      const newGroup = this.editor.splitGroupForUser(groups[0], 'right');
      if (newGroup) {
        this.editor.focusGroup(newGroup);
      }
    }
  }

  /**
   * Focuses the file explorer tree (Ctrl+0). Reveals the sidebar if hidden.
   */
  private focusExplorerTree(): void {
    if (!this.viewState.getState().sidebarVisible) {
      this.viewState.setSidebarVisible(true);
    }
    this.tree.ensureCursor();
    this.tree.focusTree();
  }

  private currentFolderRequestId = 0;
  private lastActivationPromise: Promise<void> = Promise.resolve();
  /**
   * Per-folder-tab Explorer state (v0.3 D-5, WK-098/099) — expansion,
   * selection, and scroll position, keyed by folder-tab id (not by path:
   * two tabs on the same path keep independent state, PLAN Phase 4's
   * "tabs opened with the same path maintain independent states"). Lives only on
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

  /**
   * `Workspace per Folder` (default) vs a shared editor layout (v0.3 D-7).
   * Session-only
   * — never persisted, never restored across a restart (D-8, WK-109); every
   * launch starts with per-folder workspaces enabled.
   */
  private editorMode: EditorMode = 'workspace';
  /** The editor layout Shared Editor mode uses — one shared layout, independent of which folder tab is active (D-7). */
  private sharedEditorSnapshot: SerializedDockview | null = null;
  /** Folder Workspace mode's per-tab editor layouts, keyed by folder-tab id (D-7). Session-only, like `explorerStateByTab`'s sibling but never even considered for persistence (D-8, WK-109). */
  private folderWorkspaceByTab = new Map<string, SerializedDockview>();
  /**
   * Whether the Shared Editor → Folder Workspace seed (D-8: "when first
   * switching to Folder Workspace") has already happened once this session. D-8 says
   * "first time", meaning once per session, not once per folder
   * tab — without this flag, every previously-unvisited tab entered while
   * already in Folder Workspace mode would keep re-seeding from whatever
   * Shared Editor currently held instead of starting empty like D-8 requires
   * for every switch after the first (round-1 adversarial review, Major #4).
   */
  private hasSeededWorkspaceFromShared = false;

  private captureEditorSnapshot(): SerializedDockview {
    return this.editor.getApi().toJSON();
  }

  /** Restores a saved editor layout, or clears to the empty default if there is none (a folder tab visited for the first time in Folder Workspace mode). */
  private restoreOrClearEditor(snapshot: SerializedDockview | null): void {
    if (snapshot) {
      this.editor.getApi().fromJSON(snapshot);
    } else {
      this.editor.clear();
    }
  }

  /**
   * Switches between Shared Editor and Folder Workspace (v0.3 D-7, D-8,
   * WK-105~108). Never discards the editor state being left — it is saved
   * into whichever slot that mode uses, and the ENTERING mode's own
   * last-known state is restored. The very first switch into Folder
   * Workspace has no saved workspace yet for the active tab, so it seeds
   * one from what Shared Editor was just showing (D-8's explicit rule) —
   * every later switch back into Folder Workspace restores whatever that
   * tab's workspace actually is by then.
   */
  public setEditorMode(mode: EditorMode): void {
    if (mode === this.editorMode) return;
    // `activeFolderTabId`, not `folderTabs.getActiveTab()?.id` — the rail's
    // active id flips the instant the user clicks a tab, but the editor/
    // Explorer keep showing the PREVIOUS tab's content until that tab's
    // async `activateFolderTab()` load resolves. Switching editor mode
    // while a folder load is in flight used to capture the still-visible
    // OLD tab's content and file it under the NEW (not-yet-loaded) tab's
    // id, silently overwriting that tab's real saved workspace (round-1
    // adversarial review, Critical #3). `activeFolderTabId` always names
    // whichever tab's content is actually on screen right now.
    const activeTabId = this.activeFolderTabId;

    if (mode === 'workspace') {
      this.sharedEditorSnapshot = this.captureEditorSnapshot();
      this.editorMode = 'workspace';
      if (!activeTabId) {
        this.editor.clear();
      } else if (this.folderWorkspaceByTab.has(activeTabId)) {
        this.restoreOrClearEditor(this.folderWorkspaceByTab.get(activeTabId) ?? null);
      } else if (!this.hasSeededWorkspaceFromShared) {
        // The very first switch into Folder Workspace this session (D-8's
        // "the first time"): the just-captured Shared Editor state becomes
        // this tab's initial workspace — already on screen, so no restore
        // call needed, just record it as saved.
        this.folderWorkspaceByTab.set(activeTabId, this.sharedEditorSnapshot);
        this.hasSeededWorkspaceFromShared = true;
      } else {
        // A later previously-unvisited tab: D-8's seed exception is a
        // one-time, session-wide rule, not "once per folder" — this tab
        // starts its own workspace empty instead of inheriting whatever
        // Shared Editor happens to hold right now.
        this.restoreOrClearEditor(null);
      }
    } else {
      if (activeTabId) {
        this.folderWorkspaceByTab.set(activeTabId, this.captureEditorSnapshot());
      }
      this.editorMode = 'shared';
      this.restoreOrClearEditor(this.sharedEditorSnapshot);
    }
  }

  /**
   * Whether any editor content NOT currently on screen — a Folder Workspace
   * tab other than the active one, or the Shared Editor snapshot while in
   * Folder Workspace mode — has unsaved changes. `EditorController.
   * hasDirtyPanels()`/`confirmQuit()` only ever see the one layout that is
   * currently live, so they cannot detect this on their own (round-1
   * adversarial review, Critical #2).
   */
  private hasHiddenDirtyEditorState(): boolean {
    for (const [tabId, snapshot] of this.folderWorkspaceByTab) {
      if (tabId === this.activeFolderTabId && this.editorMode === 'workspace') continue;
      if (snapshotHasDirtyPanels(snapshot)) return true;
    }
    if (this.editorMode === 'workspace' && snapshotHasDirtyPanels(this.sharedEditorSnapshot)) return true;
    return false;
  }

  /**
   * Actually saves every dirty panel in every HIDDEN saved workspace (round-3
   * adversarial review, Major #1: an earlier version treated "Save" as
   * impossible from here and downgraded it to behave like "Cancel" instead —
   * safe, but not what "Save" is supposed to do per D-28/FR-L3). None of
   * these panels are live, so each hidden snapshot is loaded into the editor
   * ONE AT A TIME via `fromJSON()`, its dirty panels are saved through the
   * exact same `kindRegistry.save()` path a live save already uses (dockview
   * preserves each panel's own id across the round-trip, so
   * `KindDispatchRenderer.init()` re-registers the same panelId's saveable),
   * then the next snapshot is loaded the same way. The whole app is about to
   * tear down the moment this resolves true, so the transient on-screen
   * flicker this causes, and not restoring whatever was visible before this
   * ran, are both moot — nothing after this point ever renders again.
   */
  private async saveHiddenDirtySnapshots(): Promise<boolean> {
    const dirtyEntries: SerializedDockview[] = [];
    for (const [tabId, snapshot] of this.folderWorkspaceByTab) {
      if (tabId === this.activeFolderTabId && this.editorMode === 'workspace') continue;
      if (snapshotHasDirtyPanels(snapshot)) dirtyEntries.push(snapshot);
    }
    if (this.editorMode === 'workspace' && snapshotHasDirtyPanels(this.sharedEditorSnapshot)) {
      dirtyEntries.push(this.sharedEditorSnapshot as SerializedDockview);
    }
    for (const snapshot of dirtyEntries) {
      this.editor.getApi().fromJSON(snapshot);
      for (const panel of this.editor.getPanels()) {
        if (panel.params?.isDirty) {
          const ok = await this.kindRegistry.save(panel.id);
          if (!ok) return false;
        }
      }
    }
    return true;
  }

  /**
   * The one gate both hosts' window-close handlers actually call (v0.3
   * round-1 adversarial review, Critical #2 fix) — previously they called
   * `editor.confirmQuit()` directly, which only inspects the currently
   * visible workspace. This wraps that same check and adds a second one for
   * dirty content hidden in another folder tab's saved workspace, or in the
   * Shared Editor snapshot while Folder Workspace is active.
   *
   * Round-2 review (Critical #1): an earlier version of this method treated
   * "Save" the same as "Don't Save" (`choice !== 'cancel'`), so picking Save
   * silently discarded the hidden content without ever writing it — worse
   * than doing nothing. Round-3 review (Major #1): the fix for that
   * downgraded "Save" to behave like "Cancel" instead (safe, but Save is
   * supposed to actually save). This version makes "Save" real via
   * `saveHiddenDirtySnapshots()` above.
   */
  public async confirmQuit(): Promise<boolean> {
    const visibleOk = await this.editor.confirmQuit();
    if (!visibleOk) return false;
    if (!this.hasHiddenDirtyEditorState()) return true;
    if (!this.confirmDialog) return true;
    const choice = await this.confirmDialog.show(
      'Folder Workspace has unsaved changes in a folder tab you are not currently viewing. Save it now?'
    );
    if (choice === 'cancel') return false;
    if (choice === 'save') return this.saveHiddenDirtySnapshots();
    return true; // 'discard'
  }

  public getEditorMode(): EditorMode {
    return this.editorMode;
  }

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
      // Folder Workspace mode saves the outgoing tab's editor layout too
      // (v0.3 D-7, WK-107) — Shared Editor mode leaves the editor alone
      // entirely on a folder switch (D-7's whole point).
      if (this.editorMode === 'workspace') {
        this.folderWorkspaceByTab.set(this.activeFolderTabId, this.captureEditorSnapshot());
      }
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
      // Restore (or start fresh) this tab's own editor workspace, if in
      // Folder Workspace mode (v0.3 D-7, WK-107). Shared Editor mode never
      // touches the editor on a folder switch.
      if (this.editorMode === 'workspace') {
        this.restoreOrClearEditor(this.folderWorkspaceByTab.get(tab.id) ?? null);
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
      // Same as the success path: an error tab has nothing valid to show,
      // in Folder Workspace mode that includes its editor workspace.
      if (this.editorMode === 'workspace') {
        this.restoreOrClearEditor(this.folderWorkspaceByTab.get(tab.id) ?? null);
      }
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

  /**
   * `Open Folder...` always adds a new folder tab; it never replaces the
   * active one (v0.3 D-3). It no longer also opens an editor file-list tab
   * for it (WK-114, out-of-plan addition, 2026-09-23 — user request) — the
   * folder tab rail's own "Open File List" context-menu action is now the
   * only path that opens one.
   */
  public async handleOpenFolderDialog(folderPath?: string): Promise<void> {
    const selected = folderPath ?? (await promptOpenFolderDialog());
    if (selected) {
      this.folderTabs.addTab(selected);
      await this.lastActivationPromise;
    }
  }

  /** `Open File...` opens a file preset in the editor, taking over any clean empty tab. */
  public async handleOpenFileDialog(filePath?: string): Promise<void> {
    const selected = filePath ?? (await promptOpenFileDialog());
    if (selected) {
      const fileName = selected.split(/[/\\]/).pop() || selected;
      await this.openIfText(selected, fileName, (enc) =>
        this.openResource(selected, fileName, FILE_KIND, this.fileModeFor(enc), 'pinned', false, enc));
    }
  }

  /**
   * Opens a file only when its content reads as text (D-15): a known binary
   * extension, or a head with NUL bytes or undecodable bytes, is refused
   * with a status-bar message and no tab. Only the latest request lands, so
   * a slow check on an earlier click cannot replace a later one.
   */
  private async openIfText(path: string, label: string, open: (encoding: TextEncodingId) => void): Promise<void> {
    const seq = ++this.textOpenSeq;
    const check = await checkTextFile(path);
    if (seq !== this.textOpenSeq) return;
    if (!check.ok) {
      this.statusMessages.showError(`Cannot open '${label}' — binary file`);
      return;
    }
    open(check.encoding);
  }

  /** A CP949 file always opens read-only (D-15). */
  private fileModeFor(encoding: TextEncodingId | undefined, requested = this.defaultFileMode): string {
    return encoding === 'cp949' ? 'viewer' : requested;
  }

  /** Ctrl+Enter from the tree (FR-A14), after the text check. */
  private openFileToSide(node: OpenableEntry, encoding: TextEncodingId): void {
    const meta = { kind: FILE_KIND, mode: this.fileModeFor(encoding), ...(encoding === 'cp949' ? { encoding } : {}) };
    const activeGroup = this.editor.getActiveGroup();
    const besideGroup = activeGroup ? this.editor.findBesideGroup(activeGroup) : undefined;
    // No existing beside group means openBeside() will split a fresh
    // empty one — nothing to silently replace, so no confirmation needed.
    if (besideGroup && this.editor.isActivePanelDirty(besideGroup)) {
      void (async () => {
        if (!(await this.editor.confirmReplaceIfDirty(besideGroup))) return;
        this.editor.openBeside(node.id, node.label, { meta });
      })();
      return;
    }
    this.editor.openBeside(node.id, node.label, { meta });
  }

  private openResource(
    targetId: string,
    title: string,
    kind: string,
    resourceMode: string,
    tabMode: EditorOpenMode,
    forceNew = false,
    encoding?: TextEncodingId
  ): IDockviewPanel {
    const panel = this.editor.openItem(targetId, title, {
      mode: tabMode,
      forceNew,
      meta: {
        kind,
        mode: resourceMode,
        ...(encoding === 'cp949' ? { encoding } : {}),
        ...(kind === TERMINAL_KIND ? { terminalSessionKey: crypto.randomUUID() } : {}),
      },
    });
    if (panel?.id) {
      this.kindRegistry.focusPanel(panel.id);
    }
    return panel;
  }

  /**
   * The Explorer tree's click/dblclick/Enter opening rules (FR-B1 ~ FR-B4,
   * FR-A6, FR-A14, D-5 — see the `this.tree.onOpen`/`onConfirm`/`onEnterOpen`
   * wiring below), with the dirty-preview confirmation gate the Explorer
   * tree earned across three rounds of adversarial review (A9 R1/R3). Every
   * current caller filters to `!node.isContainer` first (WK-114, out-of-plan
   * addition, 2026-09-23 — user request: the Explorer no longer opens
   * folders at all, only files) — `OpenableEntry`/`isContainer` stay generic
   * here rather than narrowing the type to file-only, since the shell layer
   * itself still must not branch on file/folder by name (INTENT 3, D-4).
   */
  private openFromEntry(entry: OpenableEntry, mode: EditorOpenMode, encoding?: TextEncodingId): void {
    const openNow = (target: OpenableEntry, how: EditorOpenMode) =>
      this.openResource(target.id, target.label, target.isContainer ? FOLDER_KIND : FILE_KIND,
        target.isContainer ? 'file-list' : this.fileModeFor(encoding), how, false, encoding);

    if (this.pendingOpenEntry) {
      const keepPinned = this.pendingOpenEntry.entry.id === entry.id && this.pendingOpenEntry.mode === 'pinned';
      this.pendingOpenEntry = { entry, mode: keepPinned ? 'pinned' : mode };
      return;
    }

    const activeGroupForCheck = this.editor.getActiveGroup();
    const requestedMode = entry.isContainer ? 'file-list' : this.fileModeFor(encoding);
    const alreadyOpen = Boolean(activeGroupForCheck?.panels.some((p) =>
      p.params?.targetId === entry.id && p.params?.mode === requestedMode));
    const doomed = mode === 'preview' && !alreadyOpen ? this.editor.getPreviewPanel() : undefined;
    if (doomed?.params?.isDirty) {
      this.pendingOpenEntry = { entry, mode };
      void (async () => {
        const proceed = await this.editor.confirmReplaceIfDirty(doomed);
        const request = this.pendingOpenEntry;
        this.pendingOpenEntry = null;
        if (!proceed || !request) return;
        const landed = openNow(request.entry, 'preview');
        if (request.mode === 'pinned') this.editor.pinPanel(landed);
      })();
      return;
    }
    openNow(entry, mode);
  }

  /**
   * Plain `Enter` on a focused row: preview-first like a click, unless the
   * row is already sitting in the active group's preview spot, in which
   * case this second `Enter` is what confirms/pins it (v0.2 FR-P7, FR-T3,
   * D-16). Shared by the Explorer tree and folder-list rows (WK-113).
   */
  private openEntryOnEnter(entry: OpenableEntry, encoding?: TextEncodingId): void {
    const activeGroup = this.editor.getActiveGroup();
    const currentPreview = activeGroup ? this.editor.getPreviewPanel(activeGroup) : undefined;
    const alreadyPreviewing = currentPreview?.params?.targetId === entry.id;
    this.openFromEntry(entry, alreadyPreviewing ? 'pinned' : 'preview', encoding);
  }

  /**
   * The right-click choices for a file/folder resource (v0.2 D-22, FR-G6):
   * shared by the Explorer tree's context menu and a folder tab's flat
   * file-list rows (WK-113) so both surfaces offer identical actions.
   */
  private buildResourceContextMenuItems(id: string, label: string, isContainer: boolean | undefined): ContextMenuItem[] {
    if (isContainer) {
      return [
        { id: 'open:file-list', label: 'Open File List', action: () => this.openResource(id, label, FOLDER_KIND, 'file-list', 'pinned') },
        { id: 'open:cmd', label: 'Open Command Prompt', action: () => this.openResource(id, label, TERMINAL_KIND, 'cmd', 'pinned') },
        { id: 'open:powershell', label: 'Open PowerShell', action: () => this.openResource(id, label, TERMINAL_KIND, 'powershell', 'pinned') },
      ];
    }
    return [
      { id: 'open:viewer', label: 'Open as Viewer', action: () => void this.openIfText(id, label, (enc) =>
        this.openResource(id, label, FILE_KIND, 'viewer', 'pinned', false, enc)) },
      { id: 'open:editor', label: 'Open as Editor', action: () => void this.openIfText(id, label, (enc) =>
        this.openResource(id, label, FILE_KIND, this.fileModeFor(enc, 'editor'), 'pinned', false, enc)) },
    ];
  }

  public setActivePanelMode(mode: string): void {
    const panel = this.editor.getActivePanel();
    if (!panel) return;
    const kind = panel.params?.kind;
    if (kind === FILE_KIND && mode === 'editor' && isLegacyEncoded(panel.params ?? {})) {
      // Saving writes UTF-8, which would re-encode a CP949 file (D-15).
      this.statusMessages.showError('CP949 file — read-only');
      return;
    }
    if (kind === FILE_KIND && (mode === 'editor' || mode === 'viewer')) {
      this.kindRegistry.setPanelMode(panel.id, mode);
      panel.update({ params: { mode } });
      this.updateStatusbarMode();
    }
  }

  public updateStatusbarMode(): void {
    const btn = this.layout.statusbarModeBtn;
    if (!btn) return;
    const panel = this.editor.getActivePanel();
    if (!panel) {
      btn.style.display = 'none';
      btn.textContent = '';
      return;
    }
    const kind = panel.params?.kind;
    if (kind === FILE_KIND) {
      const mode = panel.params?.mode || this.defaultFileMode;
      const label = getFileModeLabel(mode);
      btn.style.display = 'inline-flex';
      btn.disabled = false;
      btn.textContent = `File: ${label}`;
      btn.title = `File Mode: ${label} (click to toggle)`;
    } else {
      btn.style.display = 'none';
      btn.textContent = '';
    }
  }

  public getDefaultFileMode(): 'editor' | 'viewer' {
    return this.defaultFileMode;
  }

  public setDefaultFileMode(mode: 'editor' | 'viewer'): void {
    this.defaultFileMode = mode;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('workbench:default-file-mode', mode);
      }
    } catch {
      // Ignore
    }
  }

  public getDefaultFolderMode(): 'file-list' | 'cmd' | 'terminal' {
    return this.defaultFolderMode;
  }

  public setDefaultFolderMode(mode: 'file-list' | 'cmd' | 'terminal'): void {
    this.defaultFolderMode = mode;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('workbench:default-folder-mode', mode);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * "Add All Drives" toggle (v0.3 WK-111): a bare toggle, not a re-scan —
   * pressing it again while drives are showing always removes them, even
   * if the real drive set changed since (a USB stick unplugged, say). It
   * never dedupes against an already-open regular tab for the same drive
   * (D-3's "Open Folder always adds" policy applies here too).
   */
  private async handleToggleDriveTabs(): Promise<void> {
    if (this.folderTabs.hasDriveTabs()) {
      this.folderTabs.removeDriveTabs();
      return;
    }
    const drives = await listDrives();
    this.folderTabs.addDriveTabs(drives);
  }

  private refreshDrivesButtonState(): void {
    const btn = this.layout.folderTabsDrivesBtn;
    if (!btn) return;
    const pressed = this.folderTabs.hasDriveTabs();
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.classList.toggle('active', pressed);
    // Fixed to the 'seti' glyph (codicon-server) regardless of the active
    // icon theme (user request, 2026-09-17) — unlike the drive tab rows
    // themselves, which DO follow the icon theme, the header toggle button
    // never changes appearance. Still re-set on every call (not just once
    // at startup) purely so it survives a render() that clears the DOM —
    // not because the theme argument ever varies.
    btn.innerHTML = driveIconInnerMarkup('seti', '');
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
