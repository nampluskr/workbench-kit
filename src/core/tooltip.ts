/**
 * Themed hover text for every `title` attribute in the app (user request,
 * 2026-09-23). A native `title` tooltip is drawn by the OS — its border,
 * background and font ignore the colour theme and read as a white, heavily
 * outlined box against a dark workbench — and no CSS reaches it. This draws
 * the same text in a small themed box instead, VS Code-hover style.
 *
 * Nothing that sets a `title` has to change: one delegated listener takes
 * the attribute off an element only while the pointer is over it (so the OS
 * tooltip never starts) and puts it back when the pointer leaves. Code and
 * tests that read `title`, and the accessible name/description it feeds,
 * see it unchanged the rest of the time. Kind-agnostic: it only ever reads
 * the attribute's text (D-4).
 */

/** How long the pointer rests on an element before its text appears. */
const SHOW_DELAY_MS = 500;
/** Moving onto another titled element within this long after a tooltip closed shows the next one at once. */
const WARM_WINDOW_MS = 300;
/** Gap between the element and the tooltip, and the minimum margin kept from the window edge. */
const GAP_PX = 5;

export class TooltipController {
  private readonly el: HTMLDivElement;
  /** The element whose `title` is currently held back, while the pointer is over it. */
  private owner: HTMLElement | null = null;
  private heldTitle = '';
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHiddenAt = 0;
  private visible = false;
  /** Picks up a `title` the app sets on the owner while it is hovered (a tab's mode switching, say). */
  private readonly titleObserver: MutationObserver;

  constructor(private readonly root: Document = document) {
    this.el = root.createElement('div');
    this.el.className = 'workbench-tooltip';
    this.el.setAttribute('role', 'tooltip');
    this.el.hidden = true;
    root.body.appendChild(this.el);

    this.titleObserver = new MutationObserver(() => {
      const owner = this.owner;
      if (!owner) return;
      const next = owner.getAttribute('title');
      if (next === null) return;
      // The app wrote a fresh title while we were holding the old one back.
      owner.removeAttribute('title');
      this.heldTitle = next;
      if (!next) this.hide();
      else if (this.visible) this.render();
    });

    root.addEventListener('pointerover', (e) => this.onPointerOver(e), true);
    root.addEventListener('pointerout', (e) => this.onPointerOut(e), true);
    // Any deliberate action dismisses the hover, as a native tooltip does.
    for (const type of ['pointerdown', 'keydown', 'wheel']) {
      root.addEventListener(type, () => this.release(), true);
    }
    root.addEventListener('scroll', () => this.release(), true);
    window.addEventListener('blur', () => this.release());
  }

  private onPointerOver(e: Event): void {
    // Moving between the hovered element's own children: its title is held
    // back right now, so `closest('[title]')` below would skip past it to
    // some titled ancestor.
    if (this.owner && this.owner.contains(e.target as Node)) return;
    const target = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null;
    if (!target || target === this.owner) return;
    this.release();
    const text = target.getAttribute('title') || '';
    if (!text) return;
    this.owner = target;
    this.heldTitle = text;
    target.removeAttribute('title');
    this.titleObserver.observe(target, { attributes: true, attributeFilter: ['title'] });
    const warm = Date.now() - this.lastHiddenAt < WARM_WINDOW_MS;
    this.showTimer = setTimeout(() => this.show(), warm ? 0 : SHOW_DELAY_MS);
  }

  private onPointerOut(e: PointerEvent): void {
    if (!this.owner) return;
    const to = e.relatedTarget as Node | null;
    // Still inside the same titled element (moving between its children).
    if (to && this.owner.contains(to)) return;
    this.release();
  }

  /** Hides the tooltip and gives the held-back `title` back to its element. */
  private release(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.titleObserver.disconnect();
    const owner = this.owner;
    if (owner && this.heldTitle && !owner.hasAttribute('title')) {
      owner.setAttribute('title', this.heldTitle);
    }
    this.owner = null;
    this.heldTitle = '';
    this.hide();
  }

  private show(): void {
    this.showTimer = null;
    if (!this.owner || !this.owner.isConnected || !this.heldTitle) return;
    this.visible = true;
    this.render();
  }

  private hide(): void {
    if (this.visible) this.lastHiddenAt = Date.now();
    this.visible = false;
    this.el.hidden = true;
  }

  /** Places the box below its element (above when there is no room), kept inside the window. */
  private render(): void {
    const owner = this.owner;
    if (!owner) return;
    this.el.textContent = this.heldTitle;
    this.el.hidden = false;
    const anchor = owner.getBoundingClientRect();
    const box = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = anchor.bottom + GAP_PX;
    if (top + box.height > vh - GAP_PX) top = anchor.top - GAP_PX - box.height;
    top = Math.max(GAP_PX, top);
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.min(Math.max(GAP_PX, left), vw - GAP_PX - box.width);
    // CSSOM, not a style="" string — the path this app's CSP allows (D-20).
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }
}
