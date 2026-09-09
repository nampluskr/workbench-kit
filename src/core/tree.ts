import { IconThemeManager, IconDescriptor } from './icontheme';

export interface TreeNode {
  id: string;
  label: string;
  isContainer?: boolean;
  children?: TreeNode[];
  icon?: IconDescriptor;
  data?: unknown;
}

export interface ITreeDataProvider {
  getChildren(node?: TreeNode): Promise<TreeNode[]> | TreeNode[];
  getParent?(node: TreeNode): Promise<TreeNode | null> | TreeNode | null;
}

export type PromptItemType = 'leaf' | 'container' | string;

export interface PromptNewItemOptions {
  type: PromptItemType;
  parentId?: string;
  icon?: IconDescriptor;
  onCommit: (result: { name: string; type: PromptItemType; parentId?: string }) => void;
}

export interface VisibleTreeItem {
  node: TreeNode;
  depth: number;
  parent: TreeNode | null;
  isExpanded: boolean;
  hasChildren: boolean;
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) {
    return '';
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class TreeController {
  private container: HTMLElement;
  private iconThemeManager: IconThemeManager;
  private dataProvider: ITreeDataProvider | null = null;

  private root: TreeNode | null = null;
  private expandedIds: Set<string> = new Set();
  private selectedIds: Set<string> = new Set();
  private focusedId: string | null = null;
  private anchorId: string | null = null;
  private selectionRevision = 0;
  private expansionRevision = 0;

  // Find widget state
  private isFindOpen = false;
  private findQuery = '';
  private findMatches: string[] = [];
  private findMatchIndex = -1;

  // Inline input widget state (FR-A23, WK-047)
  private promptState: PromptNewItemOptions | null = null;
  private refreshOpId = 0;

  // Event callbacks
  private onSelectCallbacks: ((nodes: TreeNode[]) => void)[] = [];
  private onOpenCallbacks: ((node: TreeNode) => void)[] = [];
  private onOpenToSideCallbacks: ((node: TreeNode) => void)[] = [];
  private onRootChangeCallbacks: ((root: TreeNode | null) => void)[] = [];

  constructor(container: HTMLElement, iconThemeManager: IconThemeManager) {
    this.container = container;
    this.iconThemeManager = iconThemeManager;

    // Re-render tree when icon theme changes
    this.iconThemeManager.onThemeChange(() => {
      if (this.root) {
        this.render();
      }
    });

    // Empty state on initial creation (FR-G1, D-20)
    this.render();
  }

  public setDataProvider(provider: ITreeDataProvider): void {
    this.dataProvider = provider;
  }

  public getDataProvider(): ITreeDataProvider | null {
    return this.dataProvider;
  }

  /**
   * Sets single root folder (FR-A1, D-16).
   * Replaces any existing root, discarding all previous nodes.
   */
  public setRoot(node: TreeNode | null): void {
    this.refreshOpId++;
    this.root = node;
    this.expandedIds.clear();
    this.selectedIds.clear();
    this.focusedId = null;
    this.anchorId = null;
    this.isFindOpen = false;
    this.findQuery = '';
    this.findMatches = [];
    this.findMatchIndex = -1;
    this.promptState = null;

    if (node) {
      // By default root is expanded so immediate children are shown
      this.expandedIds.add(node.id);
      this.focusedId = node.id;
      this.selectedIds.add(node.id);
      this.anchorId = node.id;
    }

    this.render();
    this.onRootChangeCallbacks.forEach((cb) => cb(this.root));
    this.emitSelect();
  }

  public getRoot(): TreeNode | null {
    return this.root;
  }

  /**
   * Clears root and returns tree to empty state (FR-G1, FR-N6c).
   * 0 child elements, 0 text, clicks do nothing.
   */
  public clearRoot(): void {
    this.setRoot(null);
  }

  public getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  public getFocusedId(): string | null {
    return this.focusedId;
  }

  public getExpandedIds(): string[] {
    return Array.from(this.expandedIds);
  }

  public isExpanded(id: string): boolean {
    return this.expandedIds.has(id);
  }

  public isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  public onSelect(cb: (nodes: TreeNode[]) => void): () => void {
    this.onSelectCallbacks.push(cb);
    return () => {
      this.onSelectCallbacks = this.onSelectCallbacks.filter((c) => c !== cb);
    };
  }

  public onOpen(cb: (node: TreeNode) => void): () => void {
    this.onOpenCallbacks.push(cb);
    return () => {
      this.onOpenCallbacks = this.onOpenCallbacks.filter((c) => c !== cb);
    };
  }

  public onOpenToSide(cb: (node: TreeNode) => void): () => void {
    this.onOpenToSideCallbacks.push(cb);
    return () => {
      this.onOpenToSideCallbacks = this.onOpenToSideCallbacks.filter((c) => c !== cb);
    };
  }

  public onRootChange(cb: (root: TreeNode | null) => void): () => void {
    this.onRootChangeCallbacks.push(cb);
    return () => {
      this.onRootChangeCallbacks = this.onRootChangeCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Collapse all expanded folders (FR-A7, FR-A21).
   */
  public collapseAll(): void {
    this.expandedIds.clear();
    this.expansionRevision++;
    if (this.root) {
      this.focusedId = this.root.id;
      this.selectedIds = new Set([this.root.id]);
      this.anchorId = this.root.id;
      this.selectionRevision++;
      this.emitSelect();
    }
    this.render();
  }

  /**
   * Refresh tree via data provider preserving expansion and selection (FR-A22, D-30).
   * The shell is oblivious to what is read.
   */
  public async refresh(): Promise<void> {
    if (!this.root || !this.dataProvider) {
      return;
    }

    const currentRoot = this.root;
    const opId = ++this.refreshOpId;
    const initialSelRev = this.selectionRevision;
    const initialExpRev = this.expansionRevision;

    const savedExpanded = new Set(this.expandedIds);
    const savedSelected = new Set(this.selectedIds);
    const savedFocused = this.focusedId;
    const savedAnchor = this.anchorId;

    try {
      const refreshedChildren = await this.dataProvider.getChildren(this.root);
      if (this.root !== currentRoot || this.refreshOpId !== opId || !this.root) {
        return;
      }
      this.root.children = refreshedChildren;

      const visited = new Set<string>();
      const refreshDescendants = async (node: TreeNode) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        if (node.isContainer && node.children && node.children.length > 0) {
          for (const child of node.children) {
            if (child.isContainer && savedExpanded.has(child.id) && !visited.has(child.id)) {
              try {
                child.children = await this.dataProvider!.getChildren(child);
                await refreshDescendants(child);
              } catch {
                // Ignore failure on single node
              }
            }
          }
        }
      };
      await refreshDescendants(this.root);
      if (this.root !== currentRoot || this.refreshOpId !== opId || !this.root) {
        return;
      }

      // Restore expansion, selection, and anchor - filtering out deleted nodes
      // and honoring any manual user interactions that occurred while I/O was pending (Major 2)
      const nodeExists = (id: string | null) => (id ? this.getNodeById(id) !== null : false);

      if (this.expansionRevision === initialExpRev) {
        this.expandedIds = new Set(Array.from(savedExpanded).filter(nodeExists));
      } else {
        this.expandedIds = new Set(Array.from(this.expandedIds).filter(nodeExists));
      }

      if (this.selectionRevision === initialSelRev) {
        const validSelected = Array.from(savedSelected).filter(nodeExists);
        this.selectedIds = new Set(validSelected);

        if (savedFocused && nodeExists(savedFocused)) {
          this.focusedId = savedFocused;
        } else {
          this.focusedId = this.root.id;
        }

        if (savedAnchor && nodeExists(savedAnchor)) {
          this.anchorId = savedAnchor;
        } else {
          this.anchorId = this.focusedId;
        }

        if (this.selectedIds.size === 0 && this.focusedId) {
          this.selectedIds = new Set([this.focusedId]);
        }
        this.emitSelect();
      } else {
        // User changed selection while I/O was pending - do not roll back!
        this.selectedIds = new Set(Array.from(this.selectedIds).filter(nodeExists));
        if (this.focusedId && !nodeExists(this.focusedId)) {
          this.focusedId = this.root.id;
        }
        if (this.anchorId && !nodeExists(this.anchorId)) {
          this.anchorId = this.focusedId;
        }
        this.emitSelect();
      }

      this.render();
    } catch {
      if (this.root === currentRoot && this.refreshOpId === opId) {
        this.render();
      }
    }
  }

  /**
   * Opens inline name input widget for new file / folder (FR-A23, WK-047, D-30).
   */
  public promptNewItem(options: PromptNewItemOptions): void {
    if (!this.root) return;

    // Ensure target parent folder is expanded
    if (options.parentId) {
      this.expandedIds.add(options.parentId);
    } else {
      this.expandedIds.add(this.root.id);
    }

    this.promptState = options;
    this.render();

    // Auto-focus input
    const inputEl = this.container.querySelector('.tree-input-field') as HTMLInputElement | null;
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  }

  public cancelPrompt(): void {
    if (this.promptState) {
      this.promptState = null;
      this.render();
      this.focusTree();
    }
  }

  /**
   * Opens inline find widget (FR-A13, FR-A19).
   */
  public openFindWidget(): void {
    if (!this.root) return;
    this.isFindOpen = true;
    this.render();

    const findInput = this.container.querySelector('.tree-find-input') as HTMLInputElement | null;
    if (findInput) {
      findInput.focus();
      findInput.select();
    }
  }

  public closeFindWidget(): void {
    this.isFindOpen = false;
    this.findQuery = '';
    this.findMatches = [];
    this.findMatchIndex = -1;
    this.render();
    this.focusTree();
  }

  public getIsFindOpen(): boolean {
    return this.isFindOpen;
  }

  public setFindQuery(query: string): void {
    this.handleFindInput(query);
  }

  public getVisibleItems(): VisibleTreeItem[] {
    if (!this.root) {
      return [];
    }

    const items: VisibleTreeItem[] = [];

    const traverse = (node: TreeNode, depth: number, parent: TreeNode | null) => {
      const isContainer = Boolean(node.isContainer);
      const isExpanded = isContainer && this.expandedIds.has(node.id);
      const hasChildren = Boolean(node.children && node.children.length > 0);

      items.push({
        node,
        depth,
        parent,
        isExpanded,
        hasChildren,
      });

      if (isContainer && isExpanded && node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1, node);
        }
      }
    };

    traverse(this.root, 0, null);
    return items;
  }

  public findNodeById(current: TreeNode | null, id: string): TreeNode | null {
    if (!current) return null;
    if (current.id === id) return current;
    if (current.children) {
      for (const child of current.children) {
        const found = this.findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  public getNodeById(id: string | null): TreeNode | null {
    if (!id || !this.root) return null;
    return this.findNodeById(this.root, id);
  }

  /**
   * Checks if targetId is a descendant of ancestorId.
   */
  public isDescendantOf(targetId: string | null, ancestorId: string): boolean {
    if (!targetId || targetId === ancestorId) return false;
    const ancestor = this.getNodeById(ancestorId);
    if (!ancestor) return false;
    return this.findNodeById(ancestor, targetId) !== null;
  }

  /**
   * Relocate focus, selection, and anchor if they were on a descendant of a collapsed folder (Major 1).
   */
  public reconcileFocusAndSelectionAfterCollapse(collapsedId: string): void {
    if (!this.root) return;

    if (this.isDescendantOf(this.focusedId, collapsedId)) {
      this.focusedId = collapsedId;
    }
    if (this.isDescendantOf(this.anchorId, collapsedId)) {
      this.anchorId = collapsedId;
    }

    let anyHidden = false;
    const newSelected = new Set<string>();
    for (const selId of this.selectedIds) {
      if (this.isDescendantOf(selId, collapsedId)) {
        anyHidden = true;
      } else {
        newSelected.add(selId);
      }
    }
    if (anyHidden) {
      newSelected.add(collapsedId);
      this.selectedIds = newSelected;
      this.emitSelect();
    }
  }

  public focusItemByIndex(index: number): void {
    const visible = this.getVisibleItems();
    if (index < 0 || index >= visible.length) return;
    const target = visible[index];
    this.focusedId = target.node.id;
    this.selectedIds = new Set([target.node.id]);
    this.anchorId = target.node.id;
    this.selectionRevision++;
    this.render();
    this.focusTree();
    this.scrollItemIntoView(target.node.id);
    this.emitSelect();
  }

  public focusItemById(id: string): void {
    const visible = this.getVisibleItems();
    const idx = visible.findIndex((it) => it.node.id === id);
    if (idx !== -1) {
      this.focusItemByIndex(idx);
    } else {
      const node = this.getNodeById(id);
      if (node) {
        this.focusedId = node.id;
        this.selectedIds = new Set([node.id]);
        this.anchorId = node.id;
        this.selectionRevision++;
        this.render();
        this.focusTree();
        this.emitSelect();
      }
    }
  }

  public selectAll(): void {
    const visible = this.getVisibleItems();
    this.selectedIds = new Set(visible.map((it) => it.node.id));
    this.selectionRevision++;
    this.render();
    this.focusTree();
    this.emitSelect();
  }

  public clearSelection(): void {
    this.selectedIds.clear();
    this.selectionRevision++;
    this.render();
    this.focusTree();
    this.emitSelect();
  }

  public async ensureChildrenLoaded(node: TreeNode): Promise<void> {
    if (this.dataProvider && node.isContainer && (!node.children || node.children.length === 0)) {
      try {
        const children = await this.dataProvider.getChildren(node);
        node.children = children || [];
      } catch {
        node.children = [];
      }
    }
  }

  public async toggleExpand(id: string): Promise<void> {
    const opId = this.refreshOpId;
    const node = this.getNodeById(id);
    if (!node || !node.isContainer) return;
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
      this.expansionRevision++;
      this.reconcileFocusAndSelectionAfterCollapse(id);
      this.render();
    } else {
      if ((!node.children || node.children.length === 0) && this.dataProvider) {
        await this.ensureChildrenLoaded(node);
      }
      if (this.refreshOpId !== opId || !this.root || !this.getNodeById(id)) {
        return;
      }
      this.expandedIds.add(id);
      this.expansionRevision++;
      this.render();
    }
  }

  public async setExpanded(id: string, expanded: boolean): Promise<void> {
    const opId = this.refreshOpId;
    const node = this.getNodeById(id);
    if (!node || !node.isContainer) return;
    if (expanded) {
      if ((!node.children || node.children.length === 0) && this.dataProvider) {
        await this.ensureChildrenLoaded(node);
      }
      if (this.refreshOpId !== opId || !this.root || !this.getNodeById(id)) {
        return;
      }
      this.expandedIds.add(id);
      this.expansionRevision++;
    } else {
      this.expandedIds.delete(id);
      this.expansionRevision++;
      this.reconcileFocusAndSelectionAfterCollapse(id);
    }
    this.render();
  }

  public focusTree(): void {
    const listEl = this.container.querySelector('.tree-list') as HTMLElement | null;
    if (listEl) {
      listEl.focus();
    }
  }

  private emitSelect(): void {
    const selectedNodes: TreeNode[] = [];
    for (const id of this.selectedIds) {
      const node = this.getNodeById(id);
      if (node) selectedNodes.push(node);
    }
    this.onSelectCallbacks.forEach((cb) => cb(selectedNodes));
  }

  private emitOpen(node: TreeNode): void {
    this.onOpenCallbacks.forEach((cb) => cb(node));
  }

  private emitOpenToSide(node: TreeNode): void {
    this.onOpenToSideCallbacks.forEach((cb) => cb(node));
  }

  private scrollItemIntoView(nodeId: string): void {
    const rowEls = this.container.querySelectorAll('.tree-row');
    for (let i = 0; i < rowEls.length; i++) {
      if (rowEls[i].getAttribute('data-id') === nodeId) {
        (rowEls[i] as HTMLElement).scrollIntoView({ block: 'nearest' });
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Keyboard Navigation Handling (FR-A2 ~ FR-A5, FR-A7 ~ FR-A10, FR-A12, FR-A16 ~ FR-A18)
  // --------------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.root) return;

    // F3 or Ctrl+Alt+F: Find in tree (FR-A13, FR-A19)
    if (e.key === 'F3' || (e.ctrlKey && e.altKey && (e.key === 'f' || e.key === 'F'))) {
      e.preventDefault();
      e.stopPropagation();
      this.openFindWidget();
      return;
    }

    // Ctrl+A: Select all visible items (FR-A10)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      e.stopPropagation();
      this.selectAll();
      return;
    }

    // Escape: Clear selection (FR-A12)
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.clearSelection();
      return;
    }

    // Ctrl+LeftArrow: Collapse all (FR-A7, FR-A21)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      this.collapseAll();
      return;
    }

    // Ctrl+Shift+Enter: Toggle selection of current item (FR-A18)
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (this.focusedId) {
        if (this.selectedIds.has(this.focusedId)) {
          this.selectedIds.delete(this.focusedId);
        } else {
          this.selectedIds.add(this.focusedId);
        }
        this.render();
        this.emitSelect();
      }
      return;
    }

    // Ctrl+Enter: Open to side (FR-A14)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const node = this.getNodeById(this.focusedId);
      if (node) {
        this.emitOpenToSide(node);
      }
      return;
    }

    // Enter: Select/open focused item (FR-A6)
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const node = this.getNodeById(this.focusedId);
      if (node) {
        this.emitOpen(node);
      }
      return;
    }

    // Ctrl+Enter: Open item in beside pane (FR-A14)
    if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const node = this.getNodeById(this.focusedId);
      if (node) {
        this.emitOpenToSide(node);
      }
      return;
    }

    // Space: Toggle expand/collapse of container (FR-A5)
    if (e.key === ' ' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (this.focusedId) {
        const node = this.getNodeById(this.focusedId);
        if (node?.isContainer) {
          this.toggleExpand(node.id);
        }
      }
      return;
    }

    // Ctrl+ArrowUp / Ctrl+ArrowDown: Scroll without moving focus (FR-A17)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      const listEl = this.container.querySelector('.tree-list') as HTMLElement | null;
      if (listEl) {
        listEl.scrollTop += e.key === 'ArrowDown' ? 22 : -22;
      }
      return;
    }

    const visible = this.getVisibleItems();
    if (visible.length === 0) return;

    let curIdx = this.focusedId ? visible.findIndex((it) => it.node.id === this.focusedId) : 0;
    if (curIdx < 0) curIdx = 0;

    // Home: Focus first visible item (FR-A8)
    if (e.key === 'Home' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      this.focusItemByIndex(0);
      return;
    }

    // End: Focus last visible item (FR-A8)
    if (e.key === 'End' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      this.focusItemByIndex(visible.length - 1);
      return;
    }

    // PageDown / PageUp: Move focus one page (FR-A16)
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      e.stopPropagation();
      const listEl = this.container.querySelector('.tree-list') as HTMLElement | null;
      const viewportHeight = listEl?.clientHeight || this.container.clientHeight || 0;
      const pageSize = viewportHeight > 0 ? Math.max(1, Math.floor(viewportHeight / 22)) : 10;
      const targetIdx = e.key === 'PageDown'
        ? Math.min(visible.length - 1, curIdx + pageSize)
        : Math.max(0, curIdx - pageSize);
      this.focusItemByIndex(targetIdx);
      return;
    }

    // Shift+ArrowUp / Shift+ArrowDown: Expand selection range (FR-A9)
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      if (!this.anchorId) {
        this.anchorId = this.focusedId || visible[0].node.id;
      }
      const anchorIdx = visible.findIndex((it) => it.node.id === this.anchorId);
      const safeAnchorIdx = anchorIdx >= 0 ? anchorIdx : 0;

      const newFocusIdx = e.key === 'ArrowDown'
        ? Math.min(visible.length - 1, curIdx + 1)
        : Math.max(0, curIdx - 1);

      const targetItem = visible[newFocusIdx];
      this.focusedId = targetItem.node.id;

      const minIdx = Math.min(safeAnchorIdx, newFocusIdx);
      const maxIdx = Math.max(safeAnchorIdx, newFocusIdx);
      this.selectedIds = new Set(visible.slice(minIdx, maxIdx + 1).map((it) => it.node.id));

      this.render();
      this.focusTree();
      this.scrollItemIntoView(targetItem.node.id);
      this.emitSelect();
      return;
    }

    // ArrowDown: Focus next visible item (FR-A2)
    if (e.key === 'ArrowDown' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (curIdx < visible.length - 1) {
        this.focusItemByIndex(curIdx + 1);
      }
      return;
    }

    // ArrowUp: Focus previous visible item (FR-A2)
    if (e.key === 'ArrowUp' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (curIdx > 0) {
        this.focusItemByIndex(curIdx - 1);
      }
      return;
    }

    // ArrowRight: Expand container or move to first child (FR-A3)
    if (e.key === 'ArrowRight' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const current = visible[curIdx];
      if (current.node.isContainer) {
        if (!current.isExpanded) {
          // Expand container, load children if needed, focus stays on node (FR-A3)
          this.setExpanded(current.node.id, true);
        } else if (current.hasChildren && curIdx < visible.length - 1) {
          // Already expanded -> move focus to first child (FR-A3)
          const nextItem = visible[curIdx + 1];
          if (nextItem && nextItem.parent && nextItem.parent.id === current.node.id) {
            this.focusItemByIndex(curIdx + 1);
          }
        }
      }
      return;
    }

    // ArrowLeft: Collapse container or move to parent (FR-A4)
    if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const current = visible[curIdx];
      if (current.node.isContainer && current.isExpanded) {
        // Collapse container, focus stays on node (FR-A4)
        this.expandedIds.delete(current.node.id);
        this.reconcileFocusAndSelectionAfterCollapse(current.node.id);
        this.render();
        this.focusTree();
      } else if (current.parent) {
        // Already collapsed or leaf -> move focus to parent (FR-A4)
        const parentIdx = visible.findIndex((it) => it.node.id === current.parent!.id);
        if (parentIdx >= 0) {
          this.focusItemByIndex(parentIdx);
        }
      }
      return;
    }
  }

  // --------------------------------------------------------------------------
  // Mouse Multi-selection Handling (FR-A11)
  // --------------------------------------------------------------------------

  private handleRowClick(node: TreeNode, e: MouseEvent): void {
    const visible = this.getVisibleItems();

    if (e.ctrlKey) {
      // Ctrl+Click: Toggle selection (FR-A11)
      if (this.selectedIds.has(node.id)) {
        this.selectedIds.delete(node.id);
      } else {
        this.selectedIds.add(node.id);
      }
      this.focusedId = node.id;
      if (!this.anchorId) {
        this.anchorId = node.id;
      }
      this.selectionRevision++;
      this.render();
      this.emitSelect();
      return;
    }

    if (e.shiftKey) {
      // Shift+Click: Range selection between anchor and clicked item (FR-A11)
      if (!this.anchorId) {
        this.anchorId = this.focusedId || visible[0]?.node.id || node.id;
      }
      const anchorIdx = visible.findIndex((it) => it.node.id === this.anchorId);
      const clickIdx = visible.findIndex((it) => it.node.id === node.id);

      const safeAnchorIdx = anchorIdx >= 0 ? anchorIdx : clickIdx;
      const minIdx = Math.min(safeAnchorIdx, clickIdx);
      const maxIdx = Math.max(safeAnchorIdx, clickIdx);

      this.selectedIds = new Set(visible.slice(minIdx, maxIdx + 1).map((it) => it.node.id));
      this.focusedId = node.id;
      this.selectionRevision++;
      this.render();
      this.emitSelect();
      return;
    }

    // Normal Click: Single selection and open (FR-B1, FR-B4)
    this.selectedIds = new Set([node.id]);
    this.focusedId = node.id;
    this.anchorId = node.id;
    this.selectionRevision++;
    this.render();
    this.emitSelect();
    this.emitOpen(node);
  }

  // --------------------------------------------------------------------------
  // Find Widget Filtering (FR-A13, FR-A19)
  // --------------------------------------------------------------------------

  private handleFindInput(query: string): void {
    this.findQuery = query.trim().toLowerCase();
    if (!this.findQuery || !this.root) {
      this.findMatches = [];
      this.findMatchIndex = -1;
      this.updateFindCountUI();
      return;
    }

    // Search all nodes recursively
    const matches: TreeNode[] = [];
    const search = (node: TreeNode) => {
      if (node.label.toLowerCase().includes(this.findQuery)) {
        matches.push(node);
      }
      if (node.children) {
        for (const child of node.children) {
          search(child);
        }
      }
    };
    search(this.root);

    this.findMatches = matches.map((m) => m.id);
    if (this.findMatches.length > 0) {
      this.findMatchIndex = 0;
      this.goToFindMatch(0);
    } else {
      this.findMatchIndex = -1;
    }
    this.updateFindCountUI();
  }

  private goToFindMatch(index: number): void {
    if (this.findMatches.length === 0 || !this.root) return;
    const safeIdx = ((index % this.findMatches.length) + this.findMatches.length) % this.findMatches.length;
    this.findMatchIndex = safeIdx;
    const targetId = this.findMatches[safeIdx];

    // Ensure all ancestors are expanded to make matched node visible
    const expandAncestors = (current: TreeNode, id: string): boolean => {
      if (current.id === id) return true;
      if (current.children) {
        for (const child of current.children) {
          if (expandAncestors(child, id)) {
            this.expandedIds.add(current.id);
            return true;
          }
        }
      }
      return false;
    };
    expandAncestors(this.root, targetId);

    this.focusedId = targetId;
    this.selectedIds = new Set([targetId]);
    this.anchorId = targetId;

    this.renderTreeListOnly();
    this.scrollItemIntoView(targetId);
    this.emitSelect();
    this.updateFindCountUI();
  }

  private updateFindCountUI(): void {
    const countEl = this.container.querySelector('.tree-find-count') as HTMLElement | null;
    if (countEl) {
      if (this.findMatches.length > 0) {
        countEl.textContent = `${this.findMatchIndex + 1} of ${this.findMatches.length}`;
      } else if (this.findQuery) {
        countEl.textContent = 'No results';
      } else {
        countEl.textContent = '';
      }
    }
  }

  // --------------------------------------------------------------------------
  // DOM Rendering
  // --------------------------------------------------------------------------

  public render(): void {
    // Empty state: When root is null, 0 child elements, 0 text, clicks do nothing (FR-G1, D-20)
    if (!this.root) {
      this.container.innerHTML = '';
      return;
    }

    const prevList = this.container.querySelector('.tree-list');
    const hadFocus = Boolean(
      typeof document !== 'undefined' &&
      document.activeElement &&
      prevList &&
      (document.activeElement === prevList || prevList.contains(document.activeElement))
    );

    const visibleItems = this.getVisibleItems();

    let html = '';

    // 1. Find widget bar (if open)
    if (this.isFindOpen) {
      html += `
        <div class="tree-find-widget">
          <input type="text" class="tree-find-input" placeholder="Find in tree" value="${escapeHtml(this.findQuery)}" />
          <span class="tree-find-count"></span>
          <button class="tree-find-nav-btn prev-btn" title="Previous match"><i class="codicon codicon-arrow-up"></i></button>
          <button class="tree-find-nav-btn next-btn" title="Next match"><i class="codicon codicon-arrow-down"></i></button>
          <button class="tree-find-close-btn" title="Close (Escape)"><i class="codicon codicon-close"></i></button>
        </div>
      `;
    }

    // 2. Tree list
    html += `<div class="tree-list" tabindex="0" role="tree" aria-label="Explorer">`;

    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i];
      const isSelected = this.selectedIds.has(item.node.id);
      const isFocused = this.focusedId === item.node.id;

      // Safe indentation: 14px step + 10px base (Zero forbidden tokens: 12px, 4px, 8px, 16px, 6px)
      const indentPx = item.depth * 14 + 10;

      // Vertical Indentation Guides (D-9)
      let indentGuidesHtml = '';
      for (let d = 0; d < item.depth; d++) {
        const guideLeft = d * 14 + 18;
        indentGuidesHtml += `<span class="tree-indent-guide" style="left: ${guideLeft}px;"></span>`;
      }

      // Twistie
      let twistieHtml = `<span class="tree-twistie tree-twistie-spacer"></span>`;
      if (item.node.isContainer) {
        const twistieIcon = item.isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right';
        twistieHtml = `<span class="tree-twistie" data-twistie="true"><i class="codicon ${twistieIcon}"></i></span>`;
      }

      // Icon: Shell delegates to IconThemeManager (FR-Q3, INTENT 3)
      const iconDesc = this.iconThemeManager.resolveIcon(
        item.node.label,
        Boolean(item.node.isContainer),
        item.isExpanded
      );

      let iconHtml = '';
      if (iconDesc.kind === 'codicon') {
        const colorStyle = iconDesc.color ? `style="color: ${iconDesc.color};"` : '';
        iconHtml = `<span class="tree-icon"><i class="codicon ${iconDesc.cssClass || 'codicon-file'}" ${colorStyle}></i></span>`;
      } else if (iconDesc.kind === 'font') {
        const colorStyle = iconDesc.color ? `style="color: ${iconDesc.color};"` : '';
        iconHtml = `<span class="tree-icon seti-icon" ${colorStyle}>${iconDesc.char || ''}</span>`;
      } else if (iconDesc.kind === 'svg') {
        iconHtml = `<span class="tree-icon svg-icon">${iconDesc.svgData || ''}</span>`;
      }

      html += `
        <div class="tree-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}"
             data-id="${escapeHtml(item.node.id)}"
             role="treeitem"
             aria-selected="${isSelected}"
             aria-expanded="${item.node.isContainer ? item.isExpanded : undefined}"
             style="padding-left: ${indentPx}px;">
          ${indentGuidesHtml}
          ${twistieHtml}
          ${iconHtml}
          <span class="tree-label">${escapeHtml(item.node.label)}</span>
        </div>
      `;

      // 3. Inline Input Row if prompt active under this container (FR-A23, WK-047)
      if (
        this.promptState &&
        ((this.promptState.parentId && this.promptState.parentId === item.node.id) ||
         (!this.promptState.parentId && item.node.id === this.root.id))
      ) {
        const promptIndentPx = (item.depth + 1) * 14 + 10;
        let promptIndentGuidesHtml = '';
        for (let d = 0; d <= item.depth; d++) {
          const guideLeft = d * 14 + 18;
          promptIndentGuidesHtml += `<span class="tree-indent-guide" style="left: ${guideLeft}px;"></span>`;
        }
        let promptIconHtml = '';
        if (this.promptState.icon) {
          // Render icon only if provided by app (WK-047)
          const pIcon = this.promptState.icon;
          if (pIcon.kind === 'codicon') {
            promptIconHtml = `<span class="tree-icon"><i class="codicon ${pIcon.cssClass || ''}"></i></span>`;
          } else if (pIcon.kind === 'font') {
            promptIconHtml = `<span class="tree-icon seti-icon">${pIcon.char || ''}</span>`;
          } else if (pIcon.kind === 'svg') {
            promptIconHtml = `<span class="tree-icon svg-icon">${pIcon.svgData || ''}</span>`;
          }
        }

        html += `
          <div class="tree-row tree-input-row" style="padding-left: ${promptIndentPx}px;">
            ${promptIndentGuidesHtml}
            <span class="tree-twistie tree-twistie-spacer"></span>
            ${promptIconHtml}
            <input type="text" class="tree-input-field" placeholder="Name" />
          </div>
        `;
      }
    }

    html += `</div>`;

    this.container.innerHTML = html;
    this.attachDomEvents();

    if (hadFocus) {
      this.focusTree();
    }
  }

  private renderTreeListOnly(): void {
    const listContainer = this.container.querySelector('.tree-list');
    if (!listContainer) {
      this.render();
      return;
    }

    const prevList = this.container.querySelector('.tree-list');
    const hadFocus = Boolean(
      typeof document !== 'undefined' &&
      document.activeElement &&
      prevList &&
      (document.activeElement === prevList || prevList.contains(document.activeElement))
    );

    const visibleItems = this.getVisibleItems();
    let rowsHtml = '';

    for (const item of visibleItems) {
      const isSelected = this.selectedIds.has(item.node.id);
      const isFocused = this.focusedId === item.node.id;
      const indentPx = item.depth * 14 + 10;

      let indentGuidesHtml = '';
      for (let d = 0; d < item.depth; d++) {
        const guideLeft = d * 14 + 18;
        indentGuidesHtml += `<span class="tree-indent-guide" style="left: ${guideLeft}px;"></span>`;
      }

      let twistieHtml = `<span class="tree-twistie tree-twistie-spacer"></span>`;
      if (item.node.isContainer) {
        const twistieIcon = item.isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right';
        twistieHtml = `<span class="tree-twistie" data-twistie="true"><i class="codicon ${twistieIcon}"></i></span>`;
      }

      const iconDesc = this.iconThemeManager.resolveIcon(
        item.node.label,
        Boolean(item.node.isContainer),
        item.isExpanded
      );

      let iconHtml = '';
      if (iconDesc.kind === 'codicon') {
        const colorStyle = iconDesc.color ? `style="color: ${iconDesc.color};"` : '';
        iconHtml = `<span class="tree-icon"><i class="codicon ${iconDesc.cssClass || 'codicon-file'}" ${colorStyle}></i></span>`;
      } else if (iconDesc.kind === 'font') {
        const colorStyle = iconDesc.color ? `style="color: ${iconDesc.color};"` : '';
        iconHtml = `<span class="tree-icon seti-icon" ${colorStyle}>${iconDesc.char || ''}</span>`;
      } else if (iconDesc.kind === 'svg') {
        iconHtml = `<span class="tree-icon svg-icon">${iconDesc.svgData || ''}</span>`;
      }

      rowsHtml += `
        <div class="tree-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}"
             data-id="${escapeHtml(item.node.id)}"
             role="treeitem"
             aria-selected="${isSelected}"
             aria-expanded="${item.node.isContainer ? item.isExpanded : undefined}"
             style="padding-left: ${indentPx}px;">
          ${indentGuidesHtml}
          ${twistieHtml}
          ${iconHtml}
          <span class="tree-label">${escapeHtml(item.node.label)}</span>
        </div>
      `;
    }

    listContainer.innerHTML = rowsHtml;
    this.attachRowEvents();

    if (hadFocus) {
      this.focusTree();
    }
  }

  private attachDomEvents(): void {
    const listEl = this.container.querySelector('.tree-list') as HTMLElement | null;
    if (listEl) {
      listEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    this.attachRowEvents();

    // Find widget events
    const findInput = this.container.querySelector('.tree-find-input') as HTMLInputElement | null;
    if (findInput) {
      findInput.addEventListener('input', () => this.handleFindInput(findInput.value));
      findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
      e.stopPropagation();
          this.closeFindWidget();
        } else if (e.key === 'Enter') {
          e.preventDefault();
      e.stopPropagation();
          if (e.shiftKey) {
            this.goToFindMatch(this.findMatchIndex - 1);
          } else {
            this.goToFindMatch(this.findMatchIndex + 1);
          }
        }
      });
      const prevBtn = this.container.querySelector('.tree-find-nav-btn.prev-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => this.goToFindMatch(this.findMatchIndex - 1));
      }
      const nextBtn = this.container.querySelector('.tree-find-nav-btn.next-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => this.goToFindMatch(this.findMatchIndex + 1));
      }
      const closeBtn = this.container.querySelector('.tree-find-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeFindWidget());
      }
      this.updateFindCountUI();
    }

    // Inline input widget events (FR-A23, WK-047)
    const promptInput = this.container.querySelector('.tree-input-field') as HTMLInputElement | null;
    if (promptInput && this.promptState) {
      promptInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
      e.stopPropagation();
          const val = promptInput.value;
          if (val.length > 0 && this.promptState) {
            const commitCb = this.promptState.onCommit;
            const res = {
              name: val,
              type: this.promptState.type,
              parentId: this.promptState.parentId,
            };
            this.promptState = null;
            this.render();
            this.focusTree();
            commitCb(res); // Emits name verbatim to app (1 record, 0 shell creation actions)
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
      e.stopPropagation();
          this.cancelPrompt(); // Disappears, 0 app commit calls
        }
      });
    }
  }

  private attachRowEvents(): void {
    const rowEls = this.container.querySelectorAll('.tree-row:not(.tree-input-row)');
    rowEls.forEach((rowEl) => {
      const id = rowEl.getAttribute('data-id');
      if (!id) return;

      const node = this.getNodeById(id);
      if (!node) return;

      rowEl.addEventListener('click', (e) => {
        this.focusTree();
        const target = (e.target || e.currentTarget || rowEl) as HTMLElement;
        const isTwistie = target?.closest ? target.closest('[data-twistie="true"]') : null;
        if (isTwistie && node.isContainer) {
          this.toggleExpand(node.id);
          return;
        }
        this.handleRowClick(node, e as MouseEvent);
      });

      rowEl.addEventListener('dblclick', () => {
        if (node.isContainer) {
          this.toggleExpand(node.id);
        } else {
          this.emitOpen(node);
        }
      });
    });
  }
}
