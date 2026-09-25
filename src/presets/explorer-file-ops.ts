// Explorer create / rename on disk (D-14, user request 2026-09-24). The
// shell's tree only offers the inline inputs (promptNewItem / promptRename);
// everything that knows these are files and folders lives here, outside the
// common core (D-4, v0.1 D-30).
import type { TreeController, TreeNode } from '../core/tree';
import type { EditorController } from '../core/editor';
import { createFile, createFolder, renamePath, deletePath } from '../providers/filesystem';
import { getDeleteEnabled } from './delete-enabled';

export interface ExplorerFileOpsDeps {
  tree: TreeController;
  editor: EditorController;
  showMessage: (text: string) => void;
  showError: (text: string) => void;
  /** Re-reads the tree and every view that lists a folder (the file-list tabs). */
  refreshViews: () => Promise<void>;
  /** The delete confirm dialog (v0.3, user request 2026-09-25) — Delete/Cancel, not the 3-button dirty-close dialog. */
  confirmDelete: (message: string) => Promise<'delete' | 'cancel'>;
}

/** Kinds whose tab follows a renamed path. A terminal is left alone: rebuilding it would restart its shell. */
const RETARGET_KINDS = new Set(['file', 'folder']);

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Why `name` cannot be a Windows file or folder name, or null when it can. */
export function validateEntryName(name: string): string | null {
  if (name.trim().length === 0) return 'A name is required';
  if (name === '.' || name === '..') return `'${name}' is not a valid name`;
  if (/[\\/:*?"<>|]/.test(name) || /[\u0000-\u001f]/.test(name)) {
    return 'A name cannot contain \\ / : * ? " < > |';
  }
  if (/[. ]$/.test(name)) return 'A name cannot end with a period or a space';
  if (RESERVED_NAMES.test(name)) return `'${name}' is reserved by Windows`;
  return null;
}

/** Where a file name's stem ends — the part F2 pre-selects. A leading-dot name (".env") is all stem. */
export function stemLength(name: string): number {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? dot : name.length;
}

function separatorOf(path: string): string {
  return path.includes('\\') || !path.includes('/') ? '\\' : '/';
}

export function joinPath(dir: string, name: string): string {
  const sep = separatorOf(dir);
  return dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + sep + name;
}

function dirnameOf(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (i < 0) return path;
  // Keep a drive root's own separator ("D:\").
  return i === 2 && path[1] === ':' ? path.slice(0, 3) : path.slice(0, i);
}

function basenameOf(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1);
}

function nodePath(node: TreeNode | null | undefined): string | undefined {
  return (node?.data as { path?: string } | undefined)?.path || node?.id;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // Electron wraps a rejected IPC handler as "Error invoking remote method '...': Error: <msg>".
  const inner = text.match(/Error: (.*)$/);
  if (/EEXIST|already exists|FileExistsError/i.test(text)) return 'already exists';
  return inner ? inner[1] : text;
}

/**
 * The same resource under a new path: `candidate` is `oldPath` itself or
 * lies inside it. Case-insensitive, matching a Windows disk.
 */
function remapPath(candidate: string, oldPath: string, newPath: string): string | null {
  const c = candidate.toLowerCase();
  const o = oldPath.toLowerCase();
  if (c === o) return newPath;
  if (c.startsWith(o + '\\') || c.startsWith(o + '/')) return newPath + candidate.slice(oldPath.length);
  return null;
}

export class ExplorerFileOps {
  constructor(private deps: ExplorerFileOpsDeps) {}

  /** Handles a name typed into New File / New Folder's input row. */
  public async create(req: { type: 'leaf' | 'container'; name: string; parentId?: string }): Promise<boolean> {
    const { tree, editor } = this.deps;
    const parentNode = req.parentId ? tree.getNodeById(req.parentId) : tree.getRoot();
    const parentPath = nodePath(parentNode);
    if (!parentPath) return false;
    const reopen = () => tree.promptNewItem({
      type: req.type,
      parentId: req.parentId,
      initialValue: req.name,
      onCommit: (result) => void this.create({ type: req.type, name: result.name, parentId: result.parentId }),
    });

    const invalid = validateEntryName(req.name);
    if (invalid) {
      this.deps.showError(invalid);
      reopen();
      return false;
    }
    const target = joinPath(parentPath, req.name);
    try {
      if (req.type === 'container') await createFolder(target);
      else await createFile(target);
    } catch (error) {
      this.deps.showError(`Cannot create '${req.name}': ${errorText(error)}`);
      reopen();
      return false;
    }
    await this.deps.refreshViews();
    tree.focusItemById(target);
    if (req.type !== 'container') {
      await editor.openItem(target, req.name, { meta: { kind: 'file', mode: 'editor' } });
    }
    this.deps.showMessage(`Created '${req.name}'`);
    return true;
  }

  /** F2 on a tree row: opens the rename input. Returns whether it opened. */
  public beginRename(nodeId: string): boolean {
    const { tree } = this.deps;
    const node = tree.getNodeById(nodeId);
    if (!node) return false;
    return tree.promptRename(nodeId, {
      selectionEnd: node.isContainer ? node.label.length : stemLength(node.label),
      onCommit: (newName) => void this.rename(node, newName),
    });
  }

  private async rename(node: TreeNode, newName: string): Promise<boolean> {
    const { tree } = this.deps;
    const oldPath = nodePath(node);
    if (!oldPath) return false;
    const invalid = validateEntryName(newName);
    if (invalid) {
      this.deps.showError(invalid);
      return false;
    }
    const newPath = joinPath(dirnameOf(oldPath), newName);
    const wasExpanded = Boolean(node.isContainer) && tree.isExpanded(node.id);
    try {
      await renamePath(oldPath, newPath);
    } catch (error) {
      this.deps.showError(`Cannot rename '${node.label}': ${errorText(error)}`);
      return false;
    }
    this.retargetOpenTabs(oldPath, newPath);
    await this.deps.refreshViews();
    if (wasExpanded) await tree.setExpanded(newPath, true);
    tree.focusItemById(newPath);
    this.deps.showMessage(`Renamed '${node.label}' to '${newName}'`);
    return true;
  }

  /**
   * Points every open file / file-list tab on `oldPath` (or inside it) at
   * the new path. The file view is rebuilt from the tab's own value /
   * savedValue snapshot, so unsaved edits, the ● mark and the mode carry
   * over and a later save writes to the new path. Undo history starts over.
   */
  public retargetOpenTabs(oldPath: string, newPath: string): number {
    const { editor } = this.deps;
    let count = 0;
    for (const panel of editor.getPanels()) {
      const params = (panel.params ?? {}) as { kind?: string; targetId?: string };
      if (!params.kind || !RETARGET_KINDS.has(params.kind) || typeof params.targetId !== 'string') continue;
      const moved = remapPath(params.targetId, oldPath, newPath);
      if (!moved) continue;
      panel.update({ params: { ...panel.params, targetId: moved } });
      panel.api.setTitle(basenameOf(moved));
      count++;
    }
    if (count > 0) editor.refreshTabDecorations();
    return count;
  }

  /**
   * Delete key / right-click "Delete" on the Explorer tree (v0.3, user
   * request 2026-09-25). Gated by the global "Delete enabled" setting —
   * the tree hands off unconditionally (D-30, D-22); this is the one place
   * that decides whether anything actually happens, so the Delete key and
   * the context menu's Delete item can never drift out of sync on that
   * gate. Permanent delete, no recycle bin. A dirty open tab on a deleted
   * target is force-closed with no save prompt (user decision) — the file
   * is already gone, so there is nowhere left to save it.
   *
   * Three guards added after adversarial review (A29, Codex `gpt-6-sol`):
   * (1) the tree's own root is never a delete target — deleting the open
   * folder itself left the tree pointed at a now-missing root; (2) when
   * both an ancestor folder and one of its own descendants are selected
   * (e.g. Ctrl+A), only the ancestor is actually deleted — the descendant
   * is dropped from the target list instead of being attempted afterward
   * and failing because it is already gone; (3) "delete enabled" is
   * re-checked after the confirm dialog resolves, not only before it was
   * shown, so toggling it off while the dialog is open (nothing traps
   * focus there) cannot let a stale "yes" through.
   */
  public async delete(nodes: TreeNode[]): Promise<boolean> {
    if (!getDeleteEnabled()) {
      this.deps.showError('Delete is disabled — enable it from View > Allow Delete in Explorer');
      return false;
    }
    if (nodes.length === 0) return false;
    const { tree, editor } = this.deps;

    const rootId = tree.getRoot()?.id;
    const withoutRoot = rootId ? nodes.filter((n) => n.id !== rootId) : nodes;
    if (withoutRoot.length === 0) {
      this.deps.showError('Cannot delete the open folder itself');
      return false;
    }
    if (withoutRoot.length < nodes.length) {
      this.deps.showError('The open folder itself cannot be deleted — skipped');
    }

    // Drop any selected node that sits inside another selected node — its
    // ancestor's deletion already removes it, so attempting it afterward
    // would only fail with a confusing "Cannot delete" for something that
    // is, correctly, already gone.
    const targets = withoutRoot.filter((node) => {
      const p = nodePath(node);
      if (!p) return false;
      return !withoutRoot.some((other) => {
        if (other === node) return false;
        const otherPath = nodePath(other);
        return otherPath ? remapPath(p, otherPath, otherPath) !== null : false;
      });
    });
    if (targets.length === 0) return false;

    const folders = targets.filter((n) => n.isContainer).length;
    const files = targets.length - folders;
    const message = targets.length === 1
      ? `Delete '${targets[0].label}'?`
      : `Delete ${folders > 0 ? `${folders} folder${folders > 1 ? 's' : ''}` : ''}${folders > 0 && files > 0 ? ' and ' : ''}${files > 0 ? `${files} file${files > 1 ? 's' : ''}` : ''}?`;

    const choice = await this.deps.confirmDelete(message);
    if (choice !== 'delete') return false;
    if (!getDeleteEnabled()) {
      this.deps.showError('Delete was turned off while the confirmation was open — nothing was deleted');
      return false;
    }

    // A29 round 3 Critical: the confirm dialog does not trap focus, so a
    // Folder Tab (a separate root) can be switched to and activated while
    // the dialog is still open — making one of `targets` the tree's LIVE
    // root by the time the user clicks Delete, even though it was not the
    // root when the initial filter above ran. Re-checking here, against
    // the root at THIS moment, closes that window the same way the
    // "delete enabled" re-check above closes its own.
    const liveRootId = tree.getRoot()?.id;
    const finalTargets = liveRootId ? targets.filter((n) => n.id !== liveRootId) : targets;
    if (finalTargets.length === 0) {
      this.deps.showError('Cannot delete the open folder itself');
      return false;
    }
    if (finalTargets.length < targets.length) {
      this.deps.showError('The open folder itself cannot be deleted — skipped');
    }

    let failed = 0;
    const deletedPaths: string[] = [];
    for (const node of finalTargets) {
      const targetPath = nodePath(node);
      if (!targetPath) continue;
      try {
        await deletePath(targetPath);
        deletedPaths.push(targetPath);
      } catch (error) {
        failed++;
        this.deps.showError(`Cannot delete '${node.label}': ${errorText(error)}`);
      }
    }

    for (const targetPath of deletedPaths) {
      for (const panel of editor.getPanels()) {
        const params = (panel.params ?? {}) as { kind?: string; targetId?: string };
        if (!params.kind || !RETARGET_KINDS.has(params.kind) || typeof params.targetId !== 'string') continue;
        if (remapPath(params.targetId, targetPath, targetPath)) editor.forceClosePanel(panel);
      }
    }

    // tree.refresh() already purges any now-missing id from selection/focus.
    await this.deps.refreshViews();

    if (failed === 0) {
      this.deps.showMessage(finalTargets.length === 1 ? `Deleted '${finalTargets[0].label}'` : `Deleted ${finalTargets.length} items`);
    }
    return failed === 0;
  }
}
