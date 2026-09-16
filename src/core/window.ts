export type ResizeDirection = 'top' | 'bottom' | 'left' | 'right' | 'topleft' | 'topright' | 'bottomleft' | 'bottomright';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowControlsBridge {
  minimize: () => void;
  /**
   * Toggles maximize/restore. pywebview's bridge call resolves to the new
   * maximized state directly (its JS API is a request/response round-trip
   * per call); Electron's IPC send is fire-and-forget, so its state instead
   * arrives separately through onMaximizedChange (user request, 2026-09-15:
   * the button icon flips between codicon-chrome-maximize/-restore).
   */
  maximize: () => void | boolean | Promise<boolean | null>;
  /**
   * Electron-only: pushes the window's real maximized state whenever it
   * changes, from ANY cause — this button, double-clicking the draggable
   * titlebar region, or an OS-level Snap — so the icon never drifts out of
   * sync with the actual window.
   */
  onMaximizedChange?: (callback: (isMaximized: boolean) => void) => void;
  close: () => void;
  /**
   * Reads/writes the window's own bounds (user request, 2026-09-12).
   * Electron never needs these — its frameless BrowserWindow already gets
   * OS edge-resize for free. pywebview does need them: its WebView2 child
   * control covers the window pixel-for-pixel, so neither Windows' own edge
   * hit-testing NOR a WM_SYSCOMMAND/SC_SIZE native resize loop ever sees the
   * mouse (both were tried and measurably failed — SC_SIZE's modal loop
   * expects to own mouse capture starting from the raw WM_LBUTTONDOWN, but
   * WebView2's child hwnd already captured that in a separate process/
   * thread, and releasing capture on the parent's own thread does not take
   * it back). Driving width/height/position directly from JS mouse deltas,
   * entirely inside the same renderer that already owns mouse capture,
   * sidesteps that boundary instead of fighting it.
   */
  getWindowBounds?: () => WindowBounds | Promise<WindowBounds | null> | null;
  setWindowBounds?: (x: number, y: number, width: number, height: number) => void;
}

declare global {
  interface Window {
    workbenchHost?: WindowControlsBridge;
    pywebview?: {
      // pywebview does not camelCase-convert exposed Python method names —
      // the surface really is snake_case, unlike workbenchHost (Electron).
      api: WindowControlsBridge & {
        get_window_bounds?: () => Promise<WindowBounds | null>;
        set_window_bounds?: (x: number, y: number, width: number, height: number) => void;
      };
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

/**
 * Returns the new maximized state when the bridge call itself reports one
 * (pywebview); returns null when it doesn't (Electron, where
 * onMaximizedChange delivers the state on its own instead — see
 * WindowControlsBridge.maximize).
 */
export async function maximizeWindow(): Promise<boolean | null> {
  if (window.workbenchHost?.maximize) {
    const result = await window.workbenchHost.maximize();
    return typeof result === 'boolean' ? result : null;
  } else if (window.pywebview?.api?.maximize) {
    const result = await window.pywebview.api.maximize();
    return typeof result === 'boolean' ? result : null;
  } else {
    console.log('[Window] Maximize requested (no host bridge)');
    return null;
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

async function getWindowBounds(): Promise<WindowBounds | null> {
  if (window.workbenchHost?.getWindowBounds) {
    return (await window.workbenchHost.getWindowBounds()) || null;
  }
  if (window.pywebview?.api?.get_window_bounds) {
    return (await window.pywebview.api.get_window_bounds()) || null;
  }
  return null;
}

function setWindowBounds(x: number, y: number, width: number, height: number): void {
  if (window.workbenchHost?.setWindowBounds) {
    window.workbenchHost.setWindowBounds(x, y, width, height);
  } else if (window.pywebview?.api?.set_window_bounds) {
    window.pywebview.api.set_window_bounds(x, y, width, height);
  }
}

const MIN_WINDOW_WIDTH = 300;
const MIN_WINDOW_HEIGHT = 200;

/**
 * Wires invisible edge/corner grips so a WebView2-backed host (pywebview)
 * gets the same edge-drag resize Electron gets natively (user request,
 * 2026-09-12). A no-op on Electron: getWindowBounds() resolves to null
 * there (no bridge implements it, and none needs to), so the drag loop
 * below never starts — the OS's own native resize handles Electron's edges
 * entirely outside this code.
 */
export function setupResizeGrips(root: ParentNode): void {
  const directions: ResizeDirection[] = ['top', 'bottom', 'left', 'right', 'topleft', 'topright', 'bottomleft', 'bottomright'];
  for (const direction of directions) {
    const grip = root.querySelector(`[data-resize-grip="${direction}"]`);
    if (!grip) continue;
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      void beginResize(direction, e as MouseEvent);
    });
  }
}

async function beginResize(direction: ResizeDirection, downEvent: MouseEvent): Promise<void> {
  const start = await getWindowBounds();
  if (!start) return; // No bridge for this host — nothing to drive (Electron).

  const startScreenX = downEvent.screenX;
  const startScreenY = downEvent.screenY;
  let pendingFrame = 0;

  const applyDelta = (dx: number, dy: number) => {
    let { x, y, width, height } = start;
    if (direction.includes('right')) width = start.width + dx;
    if (direction.includes('left')) {
      width = start.width - dx;
      x = start.x + dx;
    }
    if (direction.includes('bottom')) height = start.height + dy;
    if (direction.includes('top')) {
      height = start.height - dy;
      y = start.y + dy;
    }
    if (width < MIN_WINDOW_WIDTH) {
      if (direction.includes('left')) x -= MIN_WINDOW_WIDTH - width;
      width = MIN_WINDOW_WIDTH;
    }
    if (height < MIN_WINDOW_HEIGHT) {
      if (direction.includes('top')) y -= MIN_WINDOW_HEIGHT - height;
      height = MIN_WINDOW_HEIGHT;
    }
    setWindowBounds(x, y, width, height);
  };

  const onMove = (e: MouseEvent) => {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      applyDelta(e.screenX - startScreenX, e.screenY - startScreenY);
    });
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/**
 * Flips the maximize button's icon (codicon-chrome-maximize <->
 * codicon-chrome-restore, the usual "duplicated square" restore glyph) and
 * label to match the window's real state (user request, 2026-09-15).
 */
function applyMaximizedIcon(maxBtn: HTMLElement, isMaximized: boolean): void {
  const icon = maxBtn.querySelector('i');
  if (icon) {
    icon.classList.toggle('codicon-chrome-maximize', !isMaximized);
    icon.classList.toggle('codicon-chrome-restore', isMaximized);
  }
  const label = isMaximized ? 'Restore' : 'Maximize';
  maxBtn.setAttribute('aria-label', label);
  maxBtn.title = label;
}

export function setupWindowControls(minBtn: HTMLElement, maxBtn: HTMLElement, closeBtn: HTMLElement): void {
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    minimizeWindow();
  });
  maxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void maximizeWindow().then((isMaximized) => {
      if (isMaximized !== null) applyMaximizedIcon(maxBtn, isMaximized);
    });
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeWindow();
  });

  window.workbenchHost?.onMaximizedChange?.((isMaximized) => applyMaximizedIcon(maxBtn, isMaximized));
}
