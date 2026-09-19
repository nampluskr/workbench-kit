import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';

// NOT part of the common core. Minimal "folder" resource kind, proving the
// same registration slot (WK-025) accepts a second, unrelated kind with
// zero further core changes. Renders a placeholder only (INTENT 7).

export const FOLDER_KIND = 'folder';

export function getFolderModeLabel(mode?: string): string {
  if (mode === 'cmd') return 'cmd';
  if (mode === 'terminal') return 'Terminal';
  return 'File List';
}

export function registerFolderPreset(registry: ResourceKindRegistry): void {
  registry.register(FOLDER_KIND, (targetId, { params, updateParams }) => {
    const element = document.createElement('div');
    element.className = 'preset-folder-view';
    const mode = typeof params.mode === 'string' ? params.mode : undefined;
    const renderText = (m?: string) => {
      if (!m) {
        element.textContent = `Folder preset view: ${targetId}`;
      } else {
        element.textContent = `Folder preset view: ${targetId} [Mode: ${getFolderModeLabel(m)}]`;
      }
    };
    renderText(mode);

    return {
      element,
      setMode: (newMode: string) => {
        updateParams({ mode: newMode });
        renderText(newMode);
      },
    };
  });
}

export async function openFolder(
  editor: AppEditorSurface,
  path: string,
  title?: string,
  options?: EditorOpenOptions
): Promise<void> {
  await editor.openItem(path, title, { ...options, meta: { ...(options?.meta || {}), kind: FOLDER_KIND } });
}
