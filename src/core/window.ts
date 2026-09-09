export interface WindowControlsBridge {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    workbenchHost?: WindowControlsBridge;
    pywebview?: {
      api: WindowControlsBridge;
    };
  }
}

export function minimizeWindow(): void {
  if (window.workbenchHost?.minimize) {
    window.workbenchHost.minimize();
  } else if (window.pywebview?.api?.minimize) {
    window.pywebview.api.minimize();
  } else {
    console.log('[Window] Minimize requested (no host bridge)');
  }
}

export function maximizeWindow(): void {
  if (window.workbenchHost?.maximize) {
    window.workbenchHost.maximize();
  } else if (window.pywebview?.api?.maximize) {
    window.pywebview.api.maximize();
  } else {
    console.log('[Window] Maximize requested (no host bridge)');
  }
}

export function closeWindow(): void {
  if (window.workbenchHost?.close) {
    window.workbenchHost.close();
  } else if (window.pywebview?.api?.close) {
    window.pywebview.api.close();
  } else {
    console.log('[Window] Close requested (no host bridge)');
  }
}

export function setupWindowControls(minBtn: HTMLElement, maxBtn: HTMLElement, closeBtn: HTMLElement): void {
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    minimizeWindow();
  });
  maxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    maximizeWindow();
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeWindow();
  });
}
