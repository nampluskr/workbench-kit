import type { ResourceKindRegistry } from '../registry/kind-registry';
import type { AppEditorSurface, EditorOpenOptions } from '../core/editor';
import { TextEditorView } from '../core/texteditor';
import { readLegacyTextFile, readTextFile, writeTextFile } from '../providers/filesystem';
import type { IconThemeManager } from '../core/icontheme';
import { extractExt } from '../providers/extension-filter';

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

/**
 * Text and document files — the ones View > Appearance > Word Wrap applies
 * to (user request, 2026-09-24). Code keeps its long lines on one line.
 * '' is a file without an extension (README).
 */
const WRAPPABLE_EXTENSIONS: ReadonlySet<string> = new Set(['', 'txt', 'text', 'md', 'markdown', 'log', 'csv', 'tsv', 'rst']);

export function isWrappableFile(filePath: string): boolean {
  const name = filePath.slice(Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')) + 1);
  return WRAPPABLE_EXTENSIONS.has(extractExt(name).toLowerCase());
}

export interface FilePresetDeps {
  iconTheme: IconThemeManager;
}

/**
 * A CP949 (not UTF-8) text file is shown read-only and never switches to
 * Editor: saving writes UTF-8, which would silently re-encode it (D-15).
 */
export function isLegacyEncoded(params: Record<string, unknown>): boolean {
  return params.encoding === 'cp949';
}

/** Same default the view itself applies below: a file tab without a mode opens read-only. */
function resolveFileMode(params: Record<string, unknown>): string {
  if (isLegacyEncoded(params)) return 'viewer';
  return typeof params.mode === 'string' ? params.mode : 'viewer';
}

/**
 * `deps` is optional so a caller registering the preset the old way, with
 * the registry alone, keeps working — its tabs just go undecorated.
 */
export function registerFilePreset(registry: ResourceKindRegistry, deps?: FilePresetDeps): void {
  // Tab look (user request, 2026-09-23): the file-type icon from the current
  // icon theme, as in the Explorer tree; a Viewer tab also shows a lock in
  // its close button's place until hovered.
  if (deps) {
    registry.registerTabDecorator(FILE_KIND, (params, title) => {
      const targetId = typeof params.targetId === 'string' ? params.targetId : title;
      const viewer = resolveFileMode(params) === 'viewer';
      return {
        icon: deps.iconTheme.resolveIcon(title || targetId, false),
        restIcon: viewer ? 'lock' : null,
        tooltip: `${targetId} — ${isLegacyEncoded(params) ? 'Viewer (read-only, CP949)' : viewer ? 'Viewer (read-only)' : 'Editor'}`,
      };
    });
  }
  registry.register(FILE_KIND, (targetId, { params, updateParams }) => {
    // Dockview serializes params, so both the live buffer and saved baseline
    // must be carried through a Folder Workspace layout switch.
    const initialMode = resolveFileMode(params);
    const hasSnapshot = typeof params.value === 'string';
    const initialValue = hasSnapshot ? params.value as string : '';
    const initialSavedValue = typeof params.savedValue === 'string' ? params.savedValue : initialValue;
    const view = new TextEditorView({
      value: initialValue,
      savedValue: initialSavedValue,
      language: detectLanguage(targetId),
      wrappable: isWrappableFile(targetId),
      readOnly: initialMode === 'viewer' || params.loadError === true,
    });
    const pushContentParams = () => updateParams({ value: view.getValue(), savedValue: view.getSavedValue() });
    const unsubscribeContent = view.onDidChangeContent(pushContentParams);
    let disposed = false;
    let loading = !hasSnapshot;
    let loadFailed = params.loadError === true;
    let currentMode = initialMode;
    let legacy = isLegacyEncoded(params);
    if (!hasSnapshot) {
      view.setReadOnly(true);
      // UTF-8 first; a file that is not UTF-8 is read again as CP949 and
      // stays read-only (D-15).
      const read = async (): Promise<string> => {
        if (legacy) return readLegacyTextFile(targetId);
        try {
          return await readTextFile(targetId);
        } catch (utf8Error) {
          let text: string;
          try {
            text = await readLegacyTextFile(targetId);
          } catch {
            throw utf8Error;
          }
          legacy = true;
          return text;
        }
      };
      void read().then((contents) => {
        if (disposed) return;
        if (legacy) {
          currentMode = 'viewer';
          updateParams({ encoding: 'cp949', mode: 'viewer' });
        }
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
    const save = async () => {
      // Never write a CP949 file: writeTextFile encodes UTF-8 (D-15). The view
      // is read-only, but a tab restored from edited params could still be
      // dirty (A24 #2).
      if (loading || loadFailed || legacy) return false;
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
    };
    // Ctrl+S is the app's key, not the shell's (reserved-keys.md §4, D-13).
    view.onSaveKey(() => {
      if (view.isDirty()) void save();
    });
    return {
      element: view.element,
      dispose: () => {
        disposed = true;
        unsubscribeContent();
        view.dispose();
      },
      onDirtyChange: (cb: (dirty: boolean) => void) => view.onDidChangeDirty(cb),
      save,
      setMode: (newMode: string) => {
        if (legacy && newMode !== 'viewer') return;
        currentMode = newMode;
        view.setReadOnly(loading || loadFailed || newMode === 'viewer');
        updateParams({ mode: newMode });
      },
      getContentForTest: () => view.getValue(),
      getLanguageForTest: () => view.getLanguageForTest(),
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
