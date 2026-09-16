/**
 * Help > About overlay (D-23). Shows the app name/version and the
 * attribution required for the two CC-licensed icon sets (codicons: CC BY
 * 4.0, vscode-icons: CC BY-SA) — the only two of the five bundled
 * third-party items whose license requires attribution, not just a license
 * body (FR-Q5, `docs/refs/licenses.md` section 2).
 */
export class AboutDialogController {
  private overlayEl: HTMLElement | null = null;

  constructor(
    private rootContainer: HTMLElement,
    private appNameVersion: string
  ) {}

  public isOpen(): boolean {
    return this.overlayEl !== null;
  }

  public show(): void {
    this.hide();

    const overlay = document.createElement('div');
    overlay.className = 'workbench-confirm-overlay';

    const dialogEl = document.createElement('div');
    dialogEl.className = 'workbench-confirm-dialog workbench-about-dialog';
    dialogEl.setAttribute('role', 'dialog');
    dialogEl.setAttribute('aria-label', 'About');

    const titleEl = document.createElement('div');
    titleEl.className = 'about-dialog-title';
    titleEl.textContent = this.appNameVersion;
    dialogEl.appendChild(titleEl);

    const attributionEl = document.createElement('div');
    attributionEl.className = 'about-dialog-attribution';
    attributionEl.innerHTML =
      '<p>Icons by <strong>@vscode/codicons</strong> — Copyright (c) Microsoft Corporation, licensed under CC BY 4.0.</p>' +
      '<p>File icons by <strong>vscode-icons</strong> — Copyright (c) 2016-present Roberto Huertas and vscode-icons contributors, licensed under CC BY-SA 4.0.</p>' +
      '<p>Full license texts: <code>licenses/</code>.</p>';
    dialogEl.appendChild(attributionEl);

    const buttonsEl = document.createElement('div');
    buttonsEl.className = 'confirm-dialog-buttons';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'confirm-dialog-btn';
    closeBtn.dataset.choice = 'close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.hide());
    buttonsEl.appendChild(closeBtn);
    dialogEl.appendChild(buttonsEl);

    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    };
    document.addEventListener('keydown', keydownHandler);
    this.pendingCleanup = () => document.removeEventListener('keydown', keydownHandler);

    overlay.appendChild(dialogEl);
    this.rootContainer.appendChild(overlay);
    this.overlayEl = overlay;
    closeBtn.focus();
  }

  private pendingCleanup: (() => void) | null = null;

  public hide(): void {
    if (this.pendingCleanup) {
      this.pendingCleanup();
      this.pendingCleanup = null;
    }
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
  }
}
