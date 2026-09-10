import type { TreeController } from './tree';
import type { EditorController } from './editor';
import type { ViewStateManager } from './viewstate';

interface FocusArea {
  /** Whether the element that currently holds keyboard focus is inside this area. */
  contains(el: Element): boolean;
  focus(): void;
}

/**
 * Keyboard focus areas (v0.2 D-10, FR-F1 ~ FR-F5).
 *
 * An area is the visible tree or one editor group. Which area is current is
 * read straight from `document.activeElement` rather than tracked in a
 * variable of its own, so the focus mark drawn by CSS (`:focus` /
 * `:focus-within`) and the area this controller believes is current can
 * never disagree.
 *
 * Moving between areas never changes what is selected or which tab each group
 * shows (FR-F3). `Tab` is deliberately not taken: it stays with the browser's
 * own focus traversal and with the views inside tabs (D-10, human decision).
 */
export class FocusAreaController {
  constructor(
    private sidebarContent: HTMLElement,
    private tree: TreeController,
    private editor: EditorController,
    private viewState: ViewStateManager
  ) {
    window.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.sidebarContent.addEventListener('click', (e) => this.handleExplorerClick(e));
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'F6' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Inside a tab's view F6 is the app's key: v0.1 FR-I6 names it as one
      // (D-10, human decision). Leave it untouched and unprevented there.
      if (this.isInsideTabView(e.target)) return;
      e.preventDefault();
      this.cycle(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Tab' && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      this.editor.cycleActivePanel(e.shiftKey ? -1 : 1);
    }
  }

  /**
   * Was the key delivered inside the view a tab renders — an editor, an app's
   * own element? Judged by where the key landed (the event target), which is
   * what v0.1 FR-I6 is about: a key that reaches the tab view belongs to it.
   * For a real keypress that is the focused element anyway. A group's content
   * area itself, which is where F6 puts focus, is the group and not the view
   * inside it, so F6 keeps cycling from there.
   */
  private isInsideTabView(target: EventTarget | null): boolean {
    const el = target instanceof Element ? target : null;
    if (!el) return false;
    const content = el.closest('.dv-content-container');
    return Boolean(content && content !== el);
  }

  /**
   * The areas F6 visits, in order: the tree first, then each group. A hidden
   * explorer — collapsed, or covered by Zen — is not an area at all (FR-F4).
   */
  private areas(): FocusArea[] {
    const areas: FocusArea[] = [];
    const state = this.viewState.getState();
    const treeList = this.sidebarContent.querySelector('.tree-list');
    if (treeList && state.sidebarVisible && !state.isZenMode) {
      areas.push({
        contains: (el) => this.sidebarContent.contains(el),
        focus: () => {
          this.tree.ensureCursor();
          this.tree.focusTree();
        },
      });
    }
    // Screen reading order — top to bottom, then left to right — not the order
    // the groups were created in. dockview hands groups back in insertion
    // order, so a group split off to the left or above would otherwise be
    // visited last even though it is seen first (A10 finding).
    const ordered = this.editor
      .getGroups()
      .map((group) => ({ group, rect: group.element.getBoundingClientRect() }))
      .sort((a, b) => Math.round(a.rect.top) - Math.round(b.rect.top) || Math.round(a.rect.left) - Math.round(b.rect.left))
      .map((entry) => entry.group);
    for (const group of ordered) {
      areas.push({
        contains: (el) => group.element.contains(el),
        focus: () => this.editor.focusGroup(group),
      });
    }
    return areas;
  }

  private cycle(direction: 1 | -1): void {
    const areas = this.areas();
    if (areas.length === 0) return;
    const active = document.activeElement;
    const current = active ? areas.findIndex((area) => area.contains(active)) : -1;
    const next =
      current < 0
        ? direction === 1
          ? 0
          : areas.length - 1
        : (current + direction + areas.length) % areas.length;
    areas[next].focus();
  }

  /**
   * A press on the explorer's empty space brings focus to the tree without
   * opening or re-selecting anything (FR-F5). Rows, buttons and the inline
   * inputs keep their own meaning.
   */
  private handleExplorerClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.tree-row, input, textarea, button, [contenteditable="true"]')) return;
    this.tree.ensureCursor();
    this.tree.focusTree();
  }
}
