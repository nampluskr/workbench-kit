/**
 * Options for the About dialog (v0.3 Help > About VS Code format).
 */
export interface AboutDialogOptions {
  version?: string;
  commitDate?: string;
  host?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Help > About overlay (D-23). Shows the app name/version, execution environment,
 * and the attribution required for third-party libraries and the two CC-licensed icon
 * sets (codicons: CC BY 4.0, vscode-icons: CC BY-SA) per `docs/refs/licenses.md`.
 */
export class AboutDialogController {
  private overlayEl: HTMLElement | null = null;
  private pendingCleanup: (() => void) | null = null;
  private version: string;
  private commitDate: string;
  private host: string;

  constructor(
    private rootContainer: HTMLElement,
    private appNameVersion: string,
    options?: AboutDialogOptions
  ) {
    this.version = options?.version || this.parseVersion(appNameVersion);
    this.commitDate = options?.commitDate || this.parseDate(appNameVersion);
    this.host = options?.host || this.detectHost();
  }

  private parseVersion(str: string): string {
    const match = str.match(/v([0-9.]+)/i);
    return match ? match[1] : '0.3.0';
  }

  private parseDate(str: string): string {
    const match = str.match(/\(([0-9-]+)\)/);
    return match ? match[1] : '2026-09-17';
  }

  private detectHost(): string {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { workbenchHost?: unknown; pywebview?: unknown };
      if (w.workbenchHost) {
        const electronMatch = typeof navigator !== 'undefined' ? navigator.userAgent.match(/Electron\/([0-9.]+)/) : null;
        return electronMatch ? `Electron ${electronMatch[1]}` : 'Electron';
      }
      if (w.pywebview) {
        return 'pywebview';
      }
    }
    return 'Web Browser';
  }

  private detectChromium(): string | null {
    if (typeof navigator === 'undefined') return null;
    const match = navigator.userAgent.match(/Chrome\/([0-9.]+)/);
    return match ? match[1] : null;
  }

  private detectOS(): string {
    if (typeof navigator === 'undefined') return 'Unknown OS';
    const ua = navigator.userAgent;
    if (ua.includes('Windows NT 10.0')) return 'Windows_NT x64 10.0';
    if (ua.includes('Windows NT 11.0')) return 'Windows_NT x64 11.0';
    if (ua.includes('Windows NT')) return 'Windows_NT';
    if (ua.includes('Mac OS X')) return 'macOS x64';
    if (ua.includes('Linux')) return 'Linux x64';
    return navigator.platform || 'Unknown OS';
  }

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

    const chromiumVer = this.detectChromium();
    const osVer = this.detectOS();

    // 1. Header with icon and title
    const headerEl = document.createElement('div');
    headerEl.className = 'about-dialog-header';
    headerEl.innerHTML = `
      <div class="about-dialog-icon"><i class="codicon codicon-window"></i></div>
      <div class="about-dialog-headings">
        <div class="about-dialog-title">Workbench-Kit</div>
        <div class="about-dialog-subtitle">${escapeHtml(this.appNameVersion)}</div>
      </div>
    `;
    dialogEl.appendChild(headerEl);

    // 2. Technical details block (VS Code style key-value metadata)
    const metaEl = document.createElement('div');
    metaEl.className = 'about-dialog-meta';
    metaEl.innerHTML = `
      <span class="about-meta-key">Version:</span>
      <span class="about-meta-val">${escapeHtml(this.version)}</span>
      <span class="about-meta-key">Date:</span>
      <span class="about-meta-val">${escapeHtml(this.commitDate)}</span>
      <span class="about-meta-key">Host:</span>
      <span class="about-meta-val">${escapeHtml(this.host)}</span>
      ${chromiumVer ? `<span class="about-meta-key">Chromium:</span><span class="about-meta-val">${escapeHtml(chromiumVer)}</span>` : ''}
      <span class="about-meta-key">OS:</span>
      <span class="about-meta-val">${escapeHtml(osVer)}</span>
    `;
    dialogEl.appendChild(metaEl);

    // 3. Third-Party Software & Attributions (FR-Q5, docs/refs/licenses.md)
    const attributionEl = document.createElement('div');
    attributionEl.className = 'about-dialog-attribution';
    attributionEl.innerHTML = `
      <div class="about-licenses-heading">Third-Party Software &amp; Attributions</div>
      <div class="about-licenses-card">
        <div class="about-license-entry">
          <div class="about-license-name"><strong>@vscode/codicons</strong> (0.0.46-24)</div>
          <div class="about-license-desc">Icons CC BY 4.0 / Code MIT — Copyright (c) Microsoft Corporation</div>
        </div>
        <div class="about-license-entry">
          <div class="about-license-name"><strong>vscode-icons</strong></div>
          <div class="about-license-desc">File icons: Icons CC BY-SA 4.0 / Code MIT — Copyright (c) 2016-present Roberto Huertas and vscode-icons contributors</div>
        </div>
        <div class="about-license-entry">
          <div class="about-license-name"><strong>seti-ui</strong></div>
          <div class="about-license-desc">File icons (default): MIT — Copyright (c) 2014 Jesse Weed</div>
        </div>
        <div class="about-license-entry">
          <div class="about-license-name"><strong>dockview-core</strong> (8.2.0)</div>
          <div class="about-license-desc">Dock layout &amp; tab lifecycle: MIT — Copyright (c) 2021 mathuo</div>
        </div>
        <div class="about-license-entry">
          <div class="about-license-name"><strong>monaco-editor</strong> (0.56.0)</div>
          <div class="about-license-desc">Code editor: MIT — Copyright (c) 2016 - present Microsoft Corporation</div>
        </div>
        <div class="about-license-entry">
          <div class="about-license-name"><strong>D2Coding</strong> (1.3.3)</div>
          <div class="about-license-desc">Editor and terminal font: SIL OFL 1.1 — Copyright (c) 2015 NAVER Corporation</div>
        </div>
      </div>
      <p class="about-licenses-note">Full license texts: <code>licenses/</code>.</p>
    `;
    dialogEl.appendChild(attributionEl);

    // 4. Action buttons: Copy & OK
    const buttonsEl = document.createElement('div');
    buttonsEl.className = 'confirm-dialog-buttons';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'about-dialog-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy version and attribution information to clipboard';

    const copyText = [
      'Workbench-Kit',
      this.appNameVersion,
      '',
      `Version: ${this.version}`,
      `Date: ${this.commitDate}`,
      `Host: ${this.host}`,
      chromiumVer ? `Chromium: ${chromiumVer}` : null,
      `OS: ${osVer}`,
      '',
      'Third-Party Software & Attributions:',
      '- @vscode/codicons (0.0.46-24): Icons CC BY 4.0 / Code MIT — Copyright (c) Microsoft Corporation',
      '- vscode-icons: Icons CC BY-SA 4.0 / Code MIT — Copyright (c) 2016-present Roberto Huertas and vscode-icons contributors',
      '- seti-ui: MIT — Copyright (c) 2014 Jesse Weed',
      '- dockview-core (8.2.0): MIT — Copyright (c) 2021 mathuo',
      '- monaco-editor (0.56.0): MIT — Copyright (c) 2016 - present Microsoft Corporation',
      '- D2Coding (1.3.3): SIL OFL 1.1 — Copyright (c) 2015 NAVER Corporation',
      '',
      'Full license texts: licenses/'
    ].filter((line): line is string => line !== null).join('\n');

    copyBtn.addEventListener('click', () => {
      copyToClipboard(copyText).then((ok) => {
        if (ok) {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            if (this.overlayEl) copyBtn.textContent = 'Copy';
          }, 1500);
        }
      });
    });
    buttonsEl.appendChild(copyBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'confirm-dialog-btn';
    closeBtn.dataset.choice = 'close';
    closeBtn.textContent = 'OK';
    closeBtn.addEventListener('click', () => this.hide());
    buttonsEl.appendChild(closeBtn);

    dialogEl.appendChild(buttonsEl);

    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      } else if (e.key === 'Enter' && (e.target === closeBtn || e.target === dialogEl)) {
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
