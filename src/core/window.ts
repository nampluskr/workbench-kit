export type ResizeDirection = 'top' | 'bottom' | 'left' | 'right' | 'topleft' | 'topright' | 'bottomleft' | 'bottomright';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowControlsBridge {
  minimize: () => void;
  maximize: () => void;
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
