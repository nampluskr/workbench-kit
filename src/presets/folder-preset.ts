import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';

// NOT part of the common core. Minimal "folder" resource kind, proving the
// same registration slot (WK-025) accepts a second, unrelated kind with
// zero further core changes. Renders a placeholder only (INTENT 7).

export const FOLDER_KIND = 'folder';

export function registerFolderPreset(registry: ResourceKindRegistry): void {
  registry.register(FOLDER_KIND, (targetId) => {
    const element = document.createElement('div');
    element.className = 'preset-folder-view';
    element.textContent = `Folder preset view: ${targetId}`;
    return { element };
  });
}

export function openFolder(
  editor: AppEditorSurface,
  path: string,
  title?: string,
  options?: EditorOpenOptions
): void {
  editor.openItem(path, title, { ...options, meta: { ...(options?.meta || {}), kind: FOLDER_KIND } });
}
