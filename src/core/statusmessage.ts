/**
 * The single shared status-bar message/progress line (D-21, D-32). The
 * shell's own errors (FR-G2 ~ FR-G4) and the app's messages (FR-N10a,
 * FR-N10b) use the exact same spot and the exact same mechanism — whoever
 * calls last wins, and there is no queue (D-21, D-32). The shell never
 * modifies the text a caller supplies, and never auto-clears progress.
 */
export class StatusMessageController {
  private progressActive = false;

  constructor(private element: HTMLElement) {}

  public showError(text: string): void {
    this.progressActive = false;
    this.render(text, true);
  }

  public showMessage(text: string): void {
    this.progressActive = false;
    this.render(text, false);
  }

  public startProgress(text: string): void {
    this.progressActive = true;
    this.render(text, false);
  }

  /**
   * The app (or the shell itself) turns progress off explicitly; nothing
   * here ever clears it on a timer (FR-N10b). If a later showError/
   * showMessage already superseded this progress (D-21/D-32's "latest
   * wins" — the only ordering rule this line has), progressActive is
   * already false and there is nothing left for this call to stop: it
   * must not blank whatever newer text is now showing.
   */
  public stopProgress(): void {
    if (!this.progressActive) return;
    this.progressActive = false;
    this.render('', false);
  }

  public isProgressActive(): boolean {
    return this.progressActive;
  }

  public getText(): string {
    return this.element.textContent || '';
  }

  private render(text: string, isError: boolean): void {
    this.element.textContent = text;
    this.element.classList.toggle('statusbar-message-error', isError);
  }
}
