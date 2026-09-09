import { createWorkbenchLayout, WorkbenchLayoutElements } from './core/layout';
import { setupWindowControls } from './core/window';
import { MenuController } from './core/menu';
import { ActivityBarController } from './core/activitybar';
import { ViewStateManager } from './core/viewstate';
import { ThemeManager } from './core/theme';
import { IconThemeManager } from './core/icontheme';
import { SetiResolver, VscodeIconsResolver } from './icons';
import { TreeController } from './core/tree';
import { ExplorerTitlebarController } from './core/sidebar';
import { FileSystemTreeProvider, promptOpenFolderDialog } from './providers/filesystem';
import { EditorController } from './core/editor';

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
    this.menu.setAction('file:open-recent', () => this.handleOpenRecentFolder());
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

    // Bind icon theme cycling (FR-Q1a: seti <-> vscode-icons, View menu only)
    this.menu.setAction('view:cycle-icon-theme', () => this.iconTheme.toggleTheme());

    // Bind Tree item opening rules (FR-B1 ~ FR-B4, FR-A6, FR-A14, D-5)
    this.tree.onOpen((node) => {
      this.editor.openItem(node.id, node.label);
    });
    this.tree.onOpenToSide((node) => {
      this.editor.openBeside(node.id, node.label);
    });

    // File menu tab actions (FR-N6b)
    this.menu.setAction('file:close-tab', () => this.editor.closeActiveTab());

    // View menu layout actions (FR-D3, FR-J2)
    this.menu.setAction('view:split-horizontal', () => this.editor.splitActiveGroup('right'));
    this.menu.setAction('view:split-vertical', () => this.editor.splitActiveGroup('below'));
    this.menu.setAction('view:close-active-tabs', () => this.editor.closeAllTabsInGroup());

    // Activity bar split actions (FR-D3)
    this.activityBar.setAction('activity:split-horizontal', () => this.editor.splitActiveGroup('right'));
    this.activityBar.setAction('activity:split-vertical', () => this.editor.splitActiveGroup('below'));

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
    } catch (err) {
      if (this.currentFolderRequestId !== reqId) {
        return;
      }
      if (this.layout.statusbarMessage) {
        this.layout.statusbarMessage.textContent = `Error opening folder: ${String(err)}`;
      }
    }
  }

  /**
   * Clears root and returns tree to empty state without altering editor tabs (FR-G1, FR-N6c).
   */
  public closeFolder(): void {
    this.currentFolderRequestId++;
    this.tree.clearRoot();
    if (this.layout.statusbarPath) {
      this.layout.statusbarPath.textContent = '';
    }
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

  public getRecentFolders(): readonly string[] {
    return this.recentFolders;
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
    (window as any).__workbenchApp = appInstance;
  }
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
