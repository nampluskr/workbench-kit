import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';
import { TextEditorView } from '../core/texteditor';

// NOT part of the common core. This preset is a minimal example of a
// "file" resource kind plugged into the registration slot (WK-025); it
// proves the slot works and is not the validation apps themselves
// (INTENT 7). Content is placeholder text rendered through the shell's
// monaco-backed text view (D-18) — no real file reading.

export const FILE_KIND = 'file';

export function registerFilePreset(registry: ResourceKindRegistry): void {
  registry.register(FILE_KIND, (targetId) => {
    const view = new TextEditorView({
      value: `// File preset view: ${targetId}\n`,
      language: 'javascript',
    });
    return {
      element: view.element,
      dispose: () => view.dispose(),
      onDirtyChange: (cb) => view.onDidChangeDirty(cb),
      // Placeholder "save" (INTENT 7): no real file I/O, just marks the
      // current content as the saved baseline (FR-P7, FR-L3).
      save: () => {
        view.markSaved();
        return true;
      },
    };
  });
}

export async function openFile(
  editor: AppEditorSurface,
  path: string,
  title?: string,
  options?: EditorOpenOptions
): Promise<void> {
  await editor.openItem(path, title, { ...options, meta: { ...(options?.meta || {}), kind: FILE_KIND } });
}
