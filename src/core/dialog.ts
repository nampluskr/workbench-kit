export type ConfirmDialogChoice = 'save' | 'discard' | 'cancel';

/**
 * Generic three-button confirm dialog device (D-28). The shell only draws
 * and positions the modal; the caller supplies the message and awaits the
 * user's choice. Button labels are a fixed shell convention (D-28), not
 * something callers customize per resource kind.
 */
export class ConfirmDialogController {
  private overlayEl: HTMLElement | null = null;

  constructor(private rootContainer: HTMLElement) {}

  public isOpen(): boolean {
    return this.overlayEl !== null;
  }

  public show(message: string): Promise<ConfirmDialogChoice> {
    return new Promise((resolve) => {
      this.hide();

      const overlay = document.createElement('div');
      overlay.className = 'workbench-confirm-overlay';

      const dialogEl = document.createElement('div');
      dialogEl.className = 'workbench-confirm-dialog';
      dialogEl.setAttribute('role', 'alertdialog');

      const messageEl = document.createElement('div');
      messageEl.className = 'confirm-dialog-message';
      messageEl.textContent = message;
      dialogEl.appendChild(messageEl);

      const buttonsEl = document.createElement('div');
      buttonsEl.className = 'confirm-dialog-buttons';

      const finish = (choice: ConfirmDialogChoice) => {
        this.hide();
        resolve(choice);
      };

      const buttons: { id: ConfirmDialogChoice; label: string }[] = [
        { id: 'save', label: '저장' },
        { id: 'discard', label: '저장 안 함' },
        { id: 'cancel', label: '취소' },
      ];

      for (const btn of buttons) {
        const el = document.createElement('button');
        el.className = 'confirm-dialog-btn';
        el.dataset.choice = btn.id;
        el.textContent = btn.label;
        el.addEventListener('click', () => finish(btn.id));
        buttonsEl.appendChild(el);
      }
      dialogEl.appendChild(buttonsEl);

      const keydownHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish('cancel');
        }
      };
      document.addEventListener('keydown', keydownHandler);
      const cleanupKeydown = () => document.removeEventListener('keydown', keydownHandler);
      this.pendingCleanup = cleanupKeydown;

      overlay.appendChild(dialogEl);
      this.rootContainer.appendChild(overlay);
      this.overlayEl = overlay;

      const firstBtn = buttonsEl.querySelector('.confirm-dialog-btn') as HTMLButtonElement | null;
      firstBtn?.focus();
    });
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
