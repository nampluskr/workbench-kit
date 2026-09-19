import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';
import { TextEditorView } from '../core/texteditor';

// NOT part of the common core. This preset is a minimal example of a
// "file" resource kind plugged into the registration slot (WK-025); it
// proves the slot works and is not the validation apps themselves
// (INTENT 7). Content is placeholder text rendered through the shell's
// monaco-backed text view (D-18) — no real file reading.

export const FILE_KIND = 'file';

export function getFileModeLabel(mode?: string): string {
  return mode === 'viewer' ? 'Viewer' : 'Editor';
}

export function registerFilePreset(registry: ResourceKindRegistry): void {
  registry.register(FILE_KIND, (targetId, { params, updateParams }) => {
    // `params.value`/`params.savedValue`, when present, are this panel's own
    // current buffer and its last-saved baseline as of the last edit/save
    // (written below via updateParams) — carried here through dockview's own
    // params, which is the only thing `toJSON()`/`fromJSON()` serialize
    // (v0.3 D-7/D-8, WK-108). Without this a Folder Workspace mode/folder
    // switch would rebuild this panel from scratch and always show the
    // placeholder again, discarding whatever had been typed. Both fields are
    // needed, not just `value`: a restored view that treats its own (still
    // unsaved) restored content as ALSO its saved baseline would silently
    // stop being dirty the moment an edit happened to return to that exact
    // text (round-2 adversarial review, Critical #2).
    const initialMode = typeof params.mode === 'string' ? params.mode : 'editor';
    const placeholder = params.mode
      ? `// File preset view: ${targetId} [Mode: ${getFileModeLabel(initialMode)}]\n`
      : `// File preset view: ${targetId}\n`;
    const initialValue = typeof params.value === 'string' ? params.value : placeholder;
    const initialSavedValue = typeof params.savedValue === 'string' ? params.savedValue : initialValue;
    const isReadOnly = initialMode === 'viewer';
    const view = new TextEditorView({
      value: initialValue,
      savedValue: initialSavedValue,
      language: 'javascript',
      readOnly: isReadOnly,
    });
    const pushContentParams = () => updateParams({ value: view.getValue(), savedValue: view.getSavedValue() });
    const unsubscribeContent = view.onDidChangeContent(pushContentParams);
    return {
      element: view.element,
      dispose: () => {
        unsubscribeContent();
        view.dispose();
      },
      onDirtyChange: (cb) => view.onDidChangeDirty(cb),
      // Placeholder "save" (INTENT 7): no real file I/O, just marks the
      // current content as the saved baseline (FR-P7, FR-L3) — and pushes
      // that new baseline into params too, or a later restore would still
      // treat the pre-save text as the saved baseline.
      save: () => {
        view.markSaved();
        pushContentParams();
        return true;
      },
      setMode: (newMode: string) => {
        const isViewer = newMode === 'viewer';
        view.setReadOnly(isViewer);
        updateParams({ mode: newMode });
        const currentVal = view.getValue();
        const targetPrefix = `// File preset view: ${targetId}`;
        if (currentVal.startsWith(targetPrefix)) {
          const newlineIdx = currentVal.indexOf('\n');
          const rest = newlineIdx !== -1 ? currentVal.slice(newlineIdx + 1) : '';
          const newHeader = `${targetPrefix} [Mode: ${getFileModeLabel(newMode)}]\n`;
          const wasClean = !view.isDirty();
          view.setValue(newHeader + rest, wasClean);
          pushContentParams();
        }
      },
      getContentForTest: () => view.getValue(),
      appendContentForTest: (text) => view.appendTextForTest(text),
      undoForTest: () => view.triggerCommand('undo'),
      isDirtyForTest: () => view.isDirty(),
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
