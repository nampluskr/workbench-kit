import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';

// NOT part of the common core. This preset is a minimal example of a
// "file" resource kind plugged into the registration slot (WK-025); it
// proves the slot works and is not the validation apps themselves
// (INTENT 7). It renders a placeholder only — no real file reading.

export const FILE_KIND = 'file';

export function registerFilePreset(registry: ResourceKindRegistry): void {
  registry.register(FILE_KIND, (targetId) => {
    const element = document.createElement('div');
    element.className = 'preset-file-view';
    element.textContent = `File preset view: ${targetId}`;
    return { element };
  });
}

export function openFile(
  editor: AppEditorSurface,
  path: string,
  title?: string,
  options?: EditorOpenOptions
): void {
  editor.openItem(path, title, { ...options, meta: { ...(options?.meta || {}), kind: FILE_KIND } });
}
