export interface WorkbenchLayoutElements {
  root: HTMLElement;
  titlebar: HTMLElement;
  menuBtn: HTMLButtonElement;
  windowTitle: HTMLElement;
  windowControls: HTMLElement;
  windowMinBtn: HTMLButtonElement;
  windowMaxBtn: HTMLButtonElement;
  windowCloseBtn: HTMLButtonElement;
  activityBar: HTMLElement;
  activityBarTop: HTMLElement;
  activityBarBottom: HTMLElement;
  sidebar: HTMLElement;
  sidebarHeader: HTMLElement;
  sidebarTitle: HTMLElement;
  sidebarActions: HTMLElement;
  sidebarAppActions: HTMLElement;
  sidebarCollapseAllBtn: HTMLButtonElement;
  sidebarRefreshBtn: HTMLButtonElement;
  sidebarContent: HTMLElement;
  mainArea: HTMLElement;
  editorContainer: HTMLElement;
  statusbar: HTMLElement;
  statusbarPath: HTMLElement;
  statusbarMessage: HTMLElement;
  statusbarAppInfo: HTMLElement;
  statusbarAppItems: HTMLElement;
}

export function createWorkbenchLayout(container: HTMLElement): WorkbenchLayoutElements {
  container.innerHTML = `
    <div id="workbench-root" class="workbench-root">
      <header id="titlebar" class="workbench-titlebar pywebview-drag-region" aria-label="Titlebar">
        <div class="titlebar-left">
          <button id="menu-hamburger-btn" class="titlebar-btn" aria-label="Menu" title="Menu"><i class="codicon codicon-menu"></i></button>
        </div>
        <div id="window-title" class="titlebar-center">workbench-kit</div>
        <div id="window-controls" class="titlebar-right window-controls">
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

        <aside id="sidebar" class="workbench-sidebar" aria-label="Explorer">
          <div id="sidebar-header" class="sidebar-header">
            <span id="sidebar-title" class="sidebar-title">EXPLORER</span>
            <div id="sidebar-actions" class="sidebar-actions">
              <div id="sidebar-app-actions" class="sidebar-app-actions"></div>
              <button id="sidebar-action-collapse-all" class="sidebar-action-btn" title="Collapse All (Ctrl+LeftArrow)" aria-label="Collapse All"><i class="codicon codicon-collapse-all"></i></button>
              <button id="sidebar-action-refresh" class="sidebar-action-btn" title="Refresh" aria-label="Refresh"><i class="codicon codicon-refresh"></i></button>
            </div>
          </div>
          <div id="sidebar-content" class="sidebar-content"></div>
        </aside>

        <main id="main-area" class="workbench-main-area">
          <div id="editor-container" class="editor-container"></div>
        </main>
      </div>

      <footer id="statusbar" class="workbench-statusbar" aria-label="Statusbar">
        <div id="statusbar-left" class="statusbar-item statusbar-left">
          <span id="statusbar-path" class="statusbar-path"></span>
        </div>
        <div id="statusbar-center" class="statusbar-item statusbar-center">
          <span id="statusbar-message" class="statusbar-message">workbench-kit v0.1 ready</span>
        </div>
        <div id="statusbar-right" class="statusbar-item statusbar-right">
          <span id="statusbar-app-info" class="statusbar-app-info">workbench-kit v0.1.0</span>
          <div id="statusbar-app-items" class="statusbar-app-items"></div>
        </div>
      </footer>
    </div>
  `;

  return {
    root: container.querySelector('#workbench-root') as HTMLElement,
    titlebar: container.querySelector('#titlebar') as HTMLElement,
    menuBtn: container.querySelector('#menu-hamburger-btn') as HTMLButtonElement,
    windowTitle: container.querySelector('#window-title') as HTMLElement,
    windowControls: container.querySelector('#window-controls') as HTMLElement,
    windowMinBtn: container.querySelector('#window-min-btn') as HTMLButtonElement,
    windowMaxBtn: container.querySelector('#window-max-btn') as HTMLButtonElement,
    windowCloseBtn: container.querySelector('#window-close-btn') as HTMLButtonElement,
    activityBar: container.querySelector('#activity-bar') as HTMLElement,
    activityBarTop: container.querySelector('#activity-bar-top') as HTMLElement,
    activityBarBottom: container.querySelector('#activity-bar-bottom') as HTMLElement,
    sidebar: container.querySelector('#sidebar') as HTMLElement,
    sidebarHeader: container.querySelector('#sidebar-header') as HTMLElement,
    sidebarTitle: container.querySelector('#sidebar-title') as HTMLElement,
    sidebarActions: container.querySelector('#sidebar-actions') as HTMLElement,
    sidebarAppActions: container.querySelector('#sidebar-app-actions') as HTMLElement,
    sidebarCollapseAllBtn: container.querySelector('#sidebar-action-collapse-all') as HTMLButtonElement,
    sidebarRefreshBtn: container.querySelector('#sidebar-action-refresh') as HTMLButtonElement,
    sidebarContent: container.querySelector('#sidebar-content') as HTMLElement,
    mainArea: container.querySelector('#main-area') as HTMLElement,
    editorContainer: container.querySelector('#editor-container') as HTMLElement,
    statusbar: container.querySelector('#statusbar') as HTMLElement,
    statusbarPath: container.querySelector('#statusbar-path') as HTMLElement,
    statusbarMessage: container.querySelector('#statusbar-message') as HTMLElement,
    statusbarAppInfo: container.querySelector('#statusbar-app-info') as HTMLElement,
    statusbarAppItems: container.querySelector('#statusbar-app-items') as HTMLElement,
  };
}
