// Import the bare editor API (no language registrations) plus a small,
// fixed set of language contributions the shell curates — not the full
// `monaco-editor` entry point, which registers all ~80 bundled languages
// and would balloon dist/ with chunks nothing ever loads (D-24, C-4).
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/javascript/register';
// Editor contributions are opt-in when importing the bare API instead of
// editor.main.js (which would also re-import all ~80 languages). Only the
// ones D-18 turns on are pulled in individually.
import 'monaco-editor/editor/contrib/find/browser/findController';

import type { ColorThemeId } from './icontheme';

export interface TextViewOptions {
  value: string;
  language?: string;
  readOnly?: boolean;
  /**
   * The baseline `isDirty()` compares against — defaults to `value` (a
   * freshly opened view starts clean). A caller reconstructing a view whose
   * content was already dirty (e.g. a preset restoring `value` from a saved
   * snapshot, v0.3 D-7/D-8) passes the ORIGINAL last-saved text here, not
   * `value` itself — otherwise the new view treats its own restored (still
   * unsaved) content as the saved baseline, which silently clears dirty the
   * next time an edit happens to land back on that same text (round-2
   * adversarial review, Critical #2: undo-to-the-restored-text incorrectly
   * read as "back to saved").
   */
  savedValue?: string;
}

/**
 * Points monaco's own theme at the app's colour theme (D-19). The COLOURS do
 * not travel this way: monaco publishes a theme's colours through a
 * <style class="monaco-colors"> element it injects at runtime, which this
 * app's CSP blocks — the --vscode-* block in style.css carries them instead.
 * What this call still decides is the editor root's theme class, which
 * monaco's bundled stylesheet scopes a handful of rules by (the find
 * widget's dark variants). Gray takes the light base: its editor background
 * is the light end of this app's palette.
 *
 * The shell owns this so an app gets a themed editor without wiring monaco
 * itself (FR-P6).
 */
export function setEditorColorTheme(theme: ColorThemeId): void {
  monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
}

/**
 * Reusable monaco-backed text/code view (D-18, FR-P1 ~ FR-P6). The shell
 * carries monaco as a default part; any preset may use this instead of
 * importing monaco itself (FR-P6). Turned on: syntax colorization, line
 * numbers, find/replace, undo/redo, read-only mode. Turned off: quick
 * suggestions, hover/definition (language service), minimap, multi-cursor
 * (X-12, FR-P5).
 */
export class TextEditorView {
  public readonly element: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private model: monaco.editor.ITextModel;
  private savedValue: string;
  private dirtyChangeCallbacks: ((dirty: boolean) => void)[] = [];
  private contentChangeCallbacks: (() => void)[] = [];
  private isCollapsingSelection = false;

  constructor(options: TextViewOptions) {
    this.element = document.createElement('div');
    this.element.className = 'text-editor-view';
    this.savedValue = options.savedValue ?? options.value;

    this.model = monaco.editor.createModel(options.value, options.language || 'plaintext');

    this.editor = monaco.editor.create(this.element, {
      model: this.model,
      readOnly: Boolean(options.readOnly),
      automaticLayout: true,
      lineNumbers: 'on',
      // Autocomplete / language service off (X-12, FR-P5)
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: 'off' as const,
      parameterHints: { enabled: false },
      hover: { enabled: 'off' },
      // Minimap off (X-12, FR-P5)
      minimap: { enabled: false },
      contextmenu: false,
      // Matches the 5px tab-row / explorer scrollbars in style.css.
      scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
    });

    // Multi-cursor off (X-12, FR-P5): collapse any secondary cursor back to
    // one, regardless of which monaco command or mouse gesture created it.
    this.editor.onDidChangeCursorSelection(() => {
      if (this.isCollapsingSelection) return;
      const selections = this.editor.getSelections();
      if (selections && selections.length > 1) {
        this.isCollapsingSelection = true;
        this.editor.setSelections([selections[0]]);
        this.isCollapsingSelection = false;
      }
    });

    this.model.onDidChangeContent(() => {
      const isDirty = this.model.getValue() !== this.savedValue;
      this.dirtyChangeCallbacks.forEach((cb) => cb(isDirty));
      this.contentChangeCallbacks.forEach((cb) => cb());
    });
  }

  public getValue(): string {
    return this.model.getValue();
  }

  public isDirty(): boolean {
    return this.model.getValue() !== this.savedValue;
  }

  /** The current saved-baseline text `isDirty()`/edits compare against — see `TextViewOptions.savedValue`. */
  public getSavedValue(): string {
    return this.savedValue;
  }

  /**
   * Marks the current content as saved (FR-P7): the shell only flips its
   * own dirty bookkeeping here — actually persisting content is the app's
   * job, done before calling this.
   */
  public markSaved(): void {
    this.savedValue = this.model.getValue();
    this.dirtyChangeCallbacks.forEach((cb) => cb(false));
  }

  /** Test-support only: how many cursors/selections currently exist. */
  public getSelectionCount(): number {
    return this.editor.getSelections()?.length ?? 0;
  }

  /** Test-support only: fires a named monaco editor action/command. */
  public triggerCommand(commandId: string, payload?: unknown): void {
    this.editor.trigger('test', commandId, payload);
  }

  /** Test-support only: runs a registered monaco action by id (e.g. 'actions.find', 'undo', 'redo'). */
  public runActionForTest(actionId: string): void {
    void this.editor.getAction(actionId)?.run();
  }

  /** Test-support only: whether an action is registered at all (proves a contribution is/isn't loaded). */
  public hasActionForTest(actionId: string): boolean {
    return this.editor.getAction(actionId) != null;
  }

  /** Test-support only: FR-P5's literal "0 error markers" clause — the language-service worker is never imported, so this stays 0 even for syntactically invalid content. */
  public getMarkerCountForTest(): number {
    return monaco.editor.getModelMarkers({ resource: this.model.uri }).length;
  }

  /**
   * Test-support only: drives the find/replace contribution's own state and
   * model directly (rather than the find widget's DOM inputs, which are
   * timing-sensitive to type into from a script) to prove FR-P2 actually
   * finds a match and replaces it, not just that the widget element exists.
   */
  public async findAndReplaceForTest(searchString: string, replaceString: string): Promise<void> {
    const controller = this.editor.getContribution('editor.contrib.findController') as unknown as {
      start: (opts: Record<string, unknown>, newState: Record<string, unknown>) => Promise<void>;
      replaceAll: () => void;
    } | null;
    if (!controller) return;
    await controller.start({}, { searchString, replaceString, isRegex: false, matchCase: false, wholeWord: false });
    controller.replaceAll();
  }

  /**
   * Test-support only: appends text at the end through the editor's own
   * edit path (respects readOnly, pushes an undo-stack entry) rather than
   * relying on the finicky synthetic-keyboard "type" command.
   */
  public appendTextForTest(text: string): void {
    const endPos = this.model.getFullModelRange().getEndPosition();
    const range = new monaco.Range(endPos.lineNumber, endPos.column, endPos.lineNumber, endPos.column);
    this.editor.executeEdits('test', [{ range, text }]);
  }

  public onDidChangeDirty(cb: (dirty: boolean) => void): () => void {
    this.dirtyChangeCallbacks.push(cb);
    return () => {
      this.dirtyChangeCallbacks = this.dirtyChangeCallbacks.filter((c) => c !== cb);
    };
  }

  /** Fires on every content edit (not just dirty transitions) — lets a caller keep an external copy of the text in sync. */
  public onDidChangeContent(cb: () => void): () => void {
    this.contentChangeCallbacks.push(cb);
    return () => {
      this.contentChangeCallbacks = this.contentChangeCallbacks.filter((c) => c !== cb);
    };
  }

  public dispose(): void {
    this.editor.dispose();
    this.model.dispose();
  }
}
