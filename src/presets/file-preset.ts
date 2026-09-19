import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';
import { TextEditorView } from '../core/texteditor';
import { readTextFile, writeTextFile } from '../providers/filesystem';

// The file preset owns disk I/O and mode behavior; the editor shell remains
// independent of resource kinds and filesystem paths.
export const FILE_KIND = 'file';

export function getFileModeLabel(mode?: string): string {
  return mode === 'viewer' ? 'Viewer' : 'Editor';
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'ts':
    case 'cts':
    case 'mts':
      return 'typescript';
    case 'js':
    case 'cjs':
    case 'mjs':
      return 'javascript';
    case 'jsx':
      return 'javascript';
    case 'tsx':
      return 'typescript';
    case 'json':
      return 'json';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'scss':
    case 'less':
      return 'css';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'py':
      return 'python';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'bat':
    case 'cmd':
      return 'bat';
    case 'ps1':
      return 'powershell';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'sql':
      return 'sql';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'hpp':
    case 'cc':
      return 'cpp';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'cs':
      return 'csharp';
    default:
      return 'plaintext';
  }
}

export function registerFilePreset(registry: ResourceKindRegistry): void {
  registry.register(FILE_KIND, (targetId, { params, updateParams }) => {
    // Dockview serializes params, so both the live buffer and saved baseline
    // must be carried through a Folder Workspace layout switch.
    const initialMode = typeof params.mode === 'string' ? params.mode : 'viewer';
    const hasSnapshot = typeof params.value === 'string';
    const initialValue = hasSnapshot ? params.value as string : '';
    const initialSavedValue = typeof params.savedValue === 'string' ? params.savedValue : initialValue;
    const view = new TextEditorView({
      value: initialValue,
      savedValue: initialSavedValue,
      language: detectLanguage(targetId),
      readOnly: initialMode === 'viewer' || params.loadError === true,
    });
    const pushContentParams = () => updateParams({ value: view.getValue(), savedValue: view.getSavedValue() });
    const unsubscribeContent = view.onDidChangeContent(pushContentParams);
    let disposed = false;
    let loading = !hasSnapshot;
    let loadFailed = params.loadError === true;
    let currentMode = initialMode;
    if (!hasSnapshot) {
      view.setReadOnly(true);
      void readTextFile(targetId).then((contents) => {
        if (disposed) return;
        view.setValue(contents, true);
        view.markSaved();
        loading = false;
        view.setReadOnly(currentMode === 'viewer');
        updateParams({ loadError: false });
        pushContentParams();
      }).catch((error) => {
        if (disposed) return;
        view.setValue(`Unable to open ${targetId}: ${String(error)}`, true);
        loading = false;
        loadFailed = true;
        view.setReadOnly(true);
        updateParams({ loadError: true });
      });
    }
    return {
      element: view.element,
      dispose: () => {
        disposed = true;
        unsubscribeContent();
        view.dispose();
      },
      onDirtyChange: (cb: (dirty: boolean) => void) => view.onDidChangeDirty(cb),
      save: async () => {
        if (loading || loadFailed) return false;
        const contents = view.getValue();
        try {
          if (!(await writeTextFile(targetId, contents))) return false;
        } catch {
          return false;
        }
        view.markSaved(contents);
        pushContentParams();
        // An edit made while the write was in progress is still unsaved.
        return !view.isDirty();
      },
      setMode: (newMode: string) => {
        currentMode = newMode;
        view.setReadOnly(loading || loadFailed || newMode === 'viewer');
        updateParams({ mode: newMode });
      },
      getContentForTest: () => view.getValue(),
      appendContentForTest: (text: string) => view.appendTextForTest(text),
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
