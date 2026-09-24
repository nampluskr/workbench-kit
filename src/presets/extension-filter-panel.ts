import {
  clearFilter,
  getFilter,
  getKnownExtensions,
  onFilterChange,
  parseExtensionList,
  setExclude,
  setInclude,
} from '../providers/extension-filter';

/**
 * The File Filter popup (user request, 2026-09-23 — D-12), opened from the
 * Activity Bar's filter button or View > File Filter. Every change applies
 * at once — there is no Apply/Cancel — and the popup redraws itself from
 * the shared filter state whenever that changes.
 *
 * - Include: "All files (*.*)" by default. Unticking it lets you pick
 *   extensions; unpicking the last one goes back to "All" by itself, so an
 *   empty include list never silently hides every file.
 * - Exclude: nothing by default; wins over Include.
 * - Each section has a text field for extensions not in the list yet
 *   (`md, *.ts; .py`), applied on Enter or when the field loses focus.
 */
export class ExtensionFilterPanel {
  private el: HTMLDivElement | null = null;
  private anchor: HTMLElement | null = null;
  /** "All files" unticked with nothing picked yet — a UI-only state; the filter itself is still "all". */
  private includePicking = false;
  private unsubscribe: (() => void) | null = null;
  private readonly onDocPointerDown = (e: PointerEvent) => {
    const target = e.target as Node;
    if (this.el?.contains(target) || this.anchor?.contains(target)) return;
    this.close();
  };
  private readonly onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    const anchor = this.anchor;
    this.close();
    anchor?.focus();
  };

  public isOpen(): boolean {
    return this.el !== null;
  }

  public toggle(anchor: HTMLElement | null): void {
    if (this.isOpen()) this.close();
    else this.open(anchor);
  }

  public open(anchor: HTMLElement | null): void {
    if (this.el) this.close();
    this.anchor = anchor;
    this.includePicking = false;
    const el = document.createElement('div');
    el.className = 'file-filter-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'File Filter');
    document.body.appendChild(el);
    this.el = el;
    this.render();
    this.position();
    this.unsubscribe = onFilterChange(() => this.render());
    document.addEventListener('pointerdown', this.onDocPointerDown, true);
    document.addEventListener('keydown', this.onDocKeyDown, true);
    el.querySelector<HTMLElement>('input, button')?.focus();
  }

  public close(): void {
    if (!this.el) return;
    document.removeEventListener('pointerdown', this.onDocPointerDown, true);
    document.removeEventListener('keydown', this.onDocKeyDown, true);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.el.remove();
    this.el = null;
    this.anchor = null;
  }

  /** Beside the anchor (the Activity Bar button), kept inside the window. */
  private position(): void {
    if (!this.el) return;
    const gap = 5;
    const a = this.anchor?.getBoundingClientRect();
    const box = this.el.getBoundingClientRect();
    let left = a ? a.right + gap : 50;
    let top = a ? a.top : 50;
    left = Math.min(left, window.innerWidth - gap - box.width);
    top = Math.max(gap, Math.min(top, window.innerHeight - gap - box.height));
    // CSSOM, not a style="" string — the path this app's CSP allows (D-20).
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  private render(): void {
    const el = this.el;
    if (!el) return;
    // Keep keyboard focus on the same control across the redraw a change triggers.
    const focusedKey = (document.activeElement as HTMLElement | null)?.dataset?.filterKey;
    const filter = getFilter();
    const known = getKnownExtensions();
    const includeAll = filter.include === null;
    const picking = !includeAll || this.includePicking;

    el.replaceChildren();
    const title = document.createElement('div');
    title.className = 'file-filter-title';
    title.textContent = 'File Filter';
    el.appendChild(title);

    // Include
    const inc = this.section('Include');
    const allRow = this.checkbox('All files (*.*)', !picking, 'include:all', (checked) => {
      this.includePicking = !checked;
      if (checked) setInclude(null);
      else this.render();
    });
    inc.appendChild(allRow);
    inc.appendChild(this.extensionList(known, filter.include ?? [], !picking, 'include', (next) => {
      if (next.length === 0) {
        // Unpicking the last extension returns to "All files".
        this.includePicking = false;
        setInclude(null);
      } else {
        setInclude(next);
      }
    }));
    inc.appendChild(this.addField('include', !picking, (exts) => setInclude([...(filter.include ?? []), ...exts])));
    el.appendChild(inc);

    // Exclude
    const exc = this.section('Exclude');
    exc.appendChild(this.extensionList(known, filter.exclude, false, 'exclude', (next) => setExclude(next)));
    exc.appendChild(this.addField('exclude', false, (exts) => setExclude([...filter.exclude, ...exts])));
    el.appendChild(exc);

    const actions = document.createElement('div');
    actions.className = 'file-filter-actions';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'file-filter-btn';
    clear.textContent = 'Clear';
    clear.dataset.filterKey = 'clear';
    clear.disabled = includeAll && filter.exclude.length === 0 && !this.includePicking;
    clear.addEventListener('click', () => {
      this.includePicking = false;
      clearFilter();
      this.render();
    });
    actions.appendChild(clear);
    el.appendChild(actions);

    if (focusedKey) el.querySelector<HTMLElement>(`[data-filter-key="${CSS.escape(focusedKey)}"]`)?.focus();
  }

  private section(label: string): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'file-filter-section';
    const head = document.createElement('div');
    head.className = 'file-filter-section-title';
    head.textContent = label;
    sec.appendChild(head);
    return sec;
  }

  private checkbox(label: string, checked: boolean, key: string, onChange: (checked: boolean) => void, disabled = false): HTMLElement {
    const row = document.createElement('label');
    row.className = 'file-filter-check';
    if (disabled) row.classList.add('disabled');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = disabled;
    input.dataset.filterKey = key;
    input.addEventListener('change', () => onChange(input.checked));
    const text = document.createElement('span');
    text.textContent = label;
    row.append(input, text);
    return row;
  }

  private extensionList(
    known: string[],
    selected: string[],
    disabled: boolean,
    keyPrefix: string,
    onChange: (next: string[]) => void
  ): HTMLElement {
    const list = document.createElement('div');
    list.className = 'file-filter-list';
    if (known.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'file-filter-empty';
      empty.textContent = 'No files listed yet';
      list.appendChild(empty);
      return list;
    }
    for (const ext of known) {
      list.appendChild(this.checkbox(ext === '' ? '(no extension)' : ext, selected.includes(ext), `${keyPrefix}:ext:${ext}`, (checked) => {
        const next = checked ? [...selected, ext] : selected.filter((x) => x !== ext);
        onChange(next);
      }, disabled));
    }
    return list;
  }

  private addField(keyPrefix: string, disabled: boolean, onAdd: (exts: string[]) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-filter-input';
    input.placeholder = 'Add: md, ts';
    input.spellcheck = false;
    input.disabled = disabled;
    input.dataset.filterKey = `${keyPrefix}:add`;
    const commit = () => {
      const exts = parseExtensionList(input.value);
      input.value = '';
      if (exts.length > 0) onAdd(exts);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    });
    input.addEventListener('blur', commit);
    return input;
  }
}
