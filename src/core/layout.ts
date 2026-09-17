export interface WorkbenchLayoutElements {
  root: HTMLElement;
  titlebar: HTMLElement;
  menuBtn: HTMLButtonElement;
  /** The program information line, left-aligned beside the menu button (v0.2 FR-C7). */
  windowTitle: HTMLElement;
  windowControls: HTMLElement;
  /** Zen and colour-theme actions beside the window controls (v0.2 FR-C1, D-3). */
  titlebarZenBtn: HTMLButtonElement;
  titlebarThemeBtn: HTMLButtonElement;
  windowMinBtn: HTMLButtonElement;
  windowMaxBtn: HTMLButtonElement;
  windowCloseBtn: HTMLButtonElement;
  activityBar: HTMLElement;
  activityBarTop: HTMLElement;
  activityBarBottom: HTMLElement;
  /** Folder Tabs rail, between the Activity Bar and Explorer (v0.3 D-1). */
  folderTabsRail: HTMLElement;
  folderTabsAddBtn: HTMLButtonElement;
  /** "Add All Drives" toggle (v0.3 WK-111) — see FolderTabsController.addDriveTabs/removeDriveTabs. */
  folderTabsDrivesBtn: HTMLButtonElement;
  folderTabsRenameBtn: HTMLButtonElement;
  /** "Set Tab Color" palette toggle (v0.3 WK-112) — see FolderTabsController.setTabColor. */
  folderTabsColorBtn: HTMLButtonElement;
  folderTabsList: HTMLElement;
  /** Drag handle between the Folder Tabs rail and the Explorer (user request, 2026-09-17). */
  folderTabsResizeHandle: HTMLElement;
  sidebar: HTMLElement;
  sidebarHeader: HTMLElement;
  sidebarTitle: HTMLElement;
  sidebarActions: HTMLElement;
  sidebarAppActions: HTMLElement;
  /** Shell view-titlebar actions, left to right (v0.2 FR-X2). */
  sidebarNewFileBtn: HTMLButtonElement;
  sidebarNewFolderBtn: HTMLButtonElement;
  sidebarRefreshBtn: HTMLButtonElement;
  sidebarCollapseAllBtn: HTMLButtonElement;
  sidebarContent: HTMLElement;
  /** Drag handle between the explorer and the editor area (v0.2 FR-X5). */
  sidebarResizeHandle: HTMLElement;
  mainArea: HTMLElement;
  editorContainer: HTMLElement;
  statusbar: HTMLElement;
  statusbarPath: HTMLElement;
  statusbarMessage: HTMLElement;
  statusbarAppItems: HTMLElement;
}

export function createWorkbenchLayout(container: HTMLElement): WorkbenchLayoutElements {
  container.innerHTML = `
    <div id="workbench-root" class="workbench-root">
      <header id="titlebar" class="workbench-titlebar pywebview-drag-region" aria-label="Titlebar">
        <div class="titlebar-left">
          <button id="menu-hamburger-btn" class="titlebar-btn" aria-label="Menu" title="Menu"><i class="codicon codicon-menu"></i></button>
          <span id="window-title" class="titlebar-program-info">Workbench-Kit</span>
        </div>
        <div class="titlebar-spacer"></div>
        <div id="window-controls" class="titlebar-right window-controls">
          <button id="titlebar-zen-btn" class="titlebar-btn titlebar-state-btn" aria-label="Zen Mode" title="Zen Mode (F11)" aria-pressed="false"><i class="codicon codicon-screen-full"></i></button>
          <button id="titlebar-theme-btn" class="titlebar-btn titlebar-state-btn" aria-label="Color Theme" title="Color Theme"><i class="codicon codicon-circle-large-filled"></i></button>
          <button id="window-min-btn" class="titlebar-btn window-control-btn" aria-label="Minimize" title="Minimize"><i class="codicon codicon-chrome-minimize"></i></button>
          <button id="window-max-btn" class="titlebar-btn window-control-btn" aria-label="Maximize" title="Maximize"><i class="codicon codicon-chrome-maximize"></i></button>
          <button id="window-close-btn" class="titlebar-btn window-control-btn close-btn" aria-label="Close" title="Close"><i class="codicon codicon-chrome-close"></i></button>
        </div>
      </header>

      <div id="workbench-body" class="workbench-body">
        <nav id="activity-bar" class="workbench-activity-bar" aria-label="Activity Bar">
          <div id="activity-bar-top" class="activity-bar-group top"></div>
          <div id="activity-bar-bottom" class="activity-bar-group bottom"></div>
        </nav>

        <aside id="foldertabs-rail" class="workbench-foldertabs-rail" aria-label="Folder Tabs">
          <div id="foldertabs-header" class="foldertabs-header">
            <span id="foldertabs-title" class="foldertabs-title">ROOTS</span>
            <div class="foldertabs-header-actions">
              <button id="foldertabs-add-btn" class="foldertabs-action-btn" title="Add Folder" aria-label="Add Folder"><i class="codicon codicon-new-folder"></i></button>
              <button id="foldertabs-rename-btn" class="foldertabs-action-btn" title="Rename Folder Tab" aria-label="Rename Folder Tab" disabled><i class="codicon codicon-edit"></i></button>
              <button id="foldertabs-color-btn" class="foldertabs-action-btn" title="Set Tab Color" aria-label="Set Tab Color" disabled><i class="codicon codicon-symbol-color"></i></button>
              <!-- Icon set by main.ts's refreshDrivesButtonState() (v0.3 WK-111) — it is per-icon-theme, so there is no single correct default to bake in here. -->
              <button id="foldertabs-drives-btn" class="foldertabs-action-btn" title="Add All Drives" aria-label="Add All Drives" aria-pressed="false"></button>
            </div>
          </div>
          <div id="foldertabs-list" class="foldertabs-list" role="tablist" aria-label="Folder Tabs List"></div>
        </aside>

        <div id="foldertabs-resize-handle" class="foldertabs-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize Folder Tabs"></div>

        <aside id="sidebar" class="workbench-sidebar" aria-label="Explorer">
          <div id="sidebar-header" class="sidebar-header">
            <span id="sidebar-title" class="sidebar-title">TREE</span>
            <div id="sidebar-actions" class="sidebar-actions">
              <div id="sidebar-app-actions" class="sidebar-app-actions"></div>
              <button id="sidebar-action-new-file" class="sidebar-action-btn" title="New File..." aria-label="New File..."><i class="codicon codicon-new-file"></i></button>
              <button id="sidebar-action-new-folder" class="sidebar-action-btn" title="New Folder..." aria-label="New Folder..."><i class="codicon codicon-new-folder"></i></button>
              <button id="sidebar-action-refresh" class="sidebar-action-btn" title="Refresh Explorer" aria-label="Refresh Explorer"><i class="codicon codicon-refresh"></i></button>
              <button id="sidebar-action-collapse-all" class="sidebar-action-btn" title="Collapse Folders in Explorer" aria-label="Collapse Folders in Explorer"><i class="codicon codicon-collapse-all"></i></button>
            </div>
          </div>
          <div id="sidebar-content" class="sidebar-content"></div>
        </aside>

        <div id="sidebar-resize-handle" class="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize Explorer"></div>

        <main id="main-area" class="workbench-main-area">
          <div id="editor-container" class="editor-container"></div>
        </main>
      </div>

      <footer id="statusbar" class="workbench-statusbar" aria-label="Statusbar">
        <div id="statusbar-left" class="statusbar-item statusbar-left">
          <span id="statusbar-path" class="statusbar-path"></span>
        </div>
        <div id="statusbar-center" class="statusbar-item statusbar-center">
          <span id="statusbar-message" class="statusbar-message">Ready</span>
        </div>
        <div id="statusbar-right" class="statusbar-item statusbar-right">
          <div id="statusbar-app-items" class="statusbar-app-items"></div>
        </div>
      </footer>

      <div class="resize-grip resize-grip-n" data-resize-grip="top"></div>
      <div class="resize-grip resize-grip-s" data-resize-grip="bottom"></div>
      <div class="resize-grip resize-grip-e" data-resize-grip="right"></div>
      <div class="resize-grip resize-grip-w" data-resize-grip="left"></div>
      <div class="resize-grip resize-grip-nw" data-resize-grip="topleft"></div>
      <div class="resize-grip resize-grip-ne" data-resize-grip="topright"></div>
      <div class="resize-grip resize-grip-sw" data-resize-grip="bottomleft"></div>
      <div class="resize-grip resize-grip-se" data-resize-grip="bottomright"></div>
    </div>
  `;

  return {
    root: container.querySelector('#workbench-root') as HTMLElement,
    titlebar: container.querySelector('#titlebar') as HTMLElement,
    menuBtn: container.querySelector('#menu-hamburger-btn') as HTMLButtonElement,
    windowTitle: container.querySelector('#window-title') as HTMLElement,
    windowControls: container.querySelector('#window-controls') as HTMLElement,
    titlebarZenBtn: container.querySelector('#titlebar-zen-btn') as HTMLButtonElement,
    titlebarThemeBtn: container.querySelector('#titlebar-theme-btn') as HTMLButtonElement,
    windowMinBtn: container.querySelector('#window-min-btn') as HTMLButtonElement,
    windowMaxBtn: container.querySelector('#window-max-btn') as HTMLButtonElement,
    windowCloseBtn: container.querySelector('#window-close-btn') as HTMLButtonElement,
    activityBar: container.querySelector('#activity-bar') as HTMLElement,
    activityBarTop: container.querySelector('#activity-bar-top') as HTMLElement,
    activityBarBottom: container.querySelector('#activity-bar-bottom') as HTMLElement,
    folderTabsRail: container.querySelector('#foldertabs-rail') as HTMLElement,
    folderTabsAddBtn: container.querySelector('#foldertabs-add-btn') as HTMLButtonElement,
    folderTabsDrivesBtn: container.querySelector('#foldertabs-drives-btn') as HTMLButtonElement,
    folderTabsRenameBtn: container.querySelector('#foldertabs-rename-btn') as HTMLButtonElement,
    folderTabsColorBtn: container.querySelector('#foldertabs-color-btn') as HTMLButtonElement,
    folderTabsList: container.querySelector('#foldertabs-list') as HTMLElement,
    folderTabsResizeHandle: container.querySelector('#foldertabs-resize-handle') as HTMLElement,
    sidebar: container.querySelector('#sidebar') as HTMLElement,
    sidebarHeader: container.querySelector('#sidebar-header') as HTMLElement,
    sidebarTitle: container.querySelector('#sidebar-title') as HTMLElement,
    sidebarActions: container.querySelector('#sidebar-actions') as HTMLElement,
    sidebarAppActions: container.querySelector('#sidebar-app-actions') as HTMLElement,
    sidebarNewFileBtn: container.querySelector('#sidebar-action-new-file') as HTMLButtonElement,
    sidebarNewFolderBtn: container.querySelector('#sidebar-action-new-folder') as HTMLButtonElement,
    sidebarRefreshBtn: container.querySelector('#sidebar-action-refresh') as HTMLButtonElement,
    sidebarCollapseAllBtn: container.querySelector('#sidebar-action-collapse-all') as HTMLButtonElement,
    sidebarContent: container.querySelector('#sidebar-content') as HTMLElement,
    sidebarResizeHandle: container.querySelector('#sidebar-resize-handle') as HTMLElement,
    mainArea: container.querySelector('#main-area') as HTMLElement,
    editorContainer: container.querySelector('#editor-container') as HTMLElement,
    statusbar: container.querySelector('#statusbar') as HTMLElement,
    statusbarPath: container.querySelector('#statusbar-path') as HTMLElement,
    statusbarMessage: container.querySelector('#statusbar-message') as HTMLElement,
    statusbarAppItems: container.querySelector('#statusbar-app-items') as HTMLElement,
  };
}
