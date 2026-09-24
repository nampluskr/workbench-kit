// Import the bare editor API (no language registrations) plus a small,
// fixed set of language contributions the shell curates — not the full
// `monaco-editor` entry point, which registers all ~80 bundled languages
// and would balloon dist/ with chunks nothing ever loads (D-24, C-4).
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/css/register';
import 'monaco-editor/languages/definitions/shell/register';
import 'monaco-editor/languages/definitions/bat/register';
import 'monaco-editor/languages/definitions/powershell/register';
import 'monaco-editor/languages/definitions/yaml/register';
import 'monaco-editor/languages/definitions/xml/register';
import 'monaco-editor/languages/definitions/sql/register';
import 'monaco-editor/languages/definitions/cpp/register';
import 'monaco-editor/languages/definitions/csharp/register';
import 'monaco-editor/languages/definitions/java/register';
import 'monaco-editor/languages/definitions/rust/register';
import 'monaco-editor/languages/definitions/go/register';

// Lightweight Monarch tokenizer for JSON without worker chunk overhead
monaco.languages.register({ id: 'json', extensions: ['.json'] });
monaco.languages.setMonarchTokensProvider('json', {
  tokenizer: {
    root: [
      [/".*?"(?=\s*:)/, 'type.identifier'],
      [/"(\\.|[^"\\])*"/, 'string'],
      [/\b(true|false|null)\b/, 'keyword'],
      [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
      [/[{}[\],:]/, 'delimiter'],
    ],
  },
});
// Editor contributions are opt-in when importing the bare API instead of
// editor.main.js (which would also re-import all ~80 languages). Only the
// ones D-18 turns on are pulled in individually. Comment, clipboard and
// multi-cursor back the Edit menu (D-13, user request 2026-09-24): the
// clipboard contribution is what lets a menu row cut/copy/paste once the
// click has taken focus away from the editor.
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/comment/browser/comment';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor';

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
 * Line numbers, as a single shell-wide setting (View > Show Line Numbers,
 * user request, 2026-09-17) — off by default. Unlike the colour theme
 * above, monaco has no global switch for this; it is a per-editor
 * construction option. `liveTextViews` is this module's own registry of
 * every currently open `TextEditorView` (kind-agnostic — just "every text
 * view on screen", no resource-kind knowledge, so this stays in `src/core/`
 * per D-4) so `setLineNumbersVisible()` can apply the new value to all of
 * them at once, the same instant a NEW view picks it up as its own initial
 * option.
 */
let lineNumbersVisible = false;
const liveTextViews = new Set<TextEditorView>();
/**
 * The live text view inside `root` — how the Edit menu finds its target in
 * the active tab's content without knowing what kind of tab it is (D-4).
 */
export function findTextViewWithin(root: Element): TextEditorView | null {
  for (const view of liveTextViews) {
    if (root.contains(view.element)) return view;
  }
  return null;
}

/**
 * Edit menu commands (D-13). `write` ones change the text, so a read-only
 * view refuses them; the rest only move the cursor or selection, or open
 * the find widget.
 */
export type EditCommandId =
  | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'find' | 'replace'
  | 'commentLine' | 'blockComment' | 'selectAll'
  | 'addNextOccurrence' | 'cursorAbove' | 'cursorBelow';

const EDIT_COMMANDS: Record<EditCommandId, { action: string; write: boolean }> = {
  undo: { action: 'undo', write: true },
  redo: { action: 'redo', write: true },
  cut: { action: 'editor.action.clipboardCutAction', write: true },
  copy: { action: 'editor.action.clipboardCopyAction', write: false },
  paste: { action: 'editor.action.clipboardPasteAction', write: true },
  find: { action: 'actions.find', write: false },
  replace: { action: 'editor.action.startFindReplaceAction', write: true },
  commentLine: { action: 'editor.action.commentLine', write: true },
  blockComment: { action: 'editor.action.blockComment', write: true },
  selectAll: { action: 'editor.action.selectAll', write: false },
  addNextOccurrence: { action: 'editor.action.addSelectionToNextFindMatch', write: false },
  cursorAbove: { action: 'editor.action.insertCursorAbove', write: false },
  cursorBelow: { action: 'editor.action.insertCursorBelow', write: false },
};

export function getLineNumbersVisible(): boolean {
  return lineNumbersVisible;
}

export function setLineNumbersVisible(visible: boolean): void {
  lineNumbersVisible = visible;
  for (const view of liveTextViews) {
    view.applyLineNumbersOption(visible);
  }
}

/**
 * Reusable monaco-backed text/code view (D-18, FR-P1 ~ FR-P6). The shell
 * carries monaco as a default part; any preset may use this instead of
 * importing monaco itself (FR-P6). Turned on: syntax colorization, find/
 * replace, undo/redo, read-only mode, comment toggling and multi-cursor
 * (off under X-12 until D-13 turned it back on). Turned off: quick
 * suggestions, hover/definition (language service), minimap (X-12, FR-P5),
 * and —
 * unless View > Show Line Numbers is checked — line numbers themselves
 * (off by default, user request, 2026-09-17).
 */
export class TextEditorView {
  public readonly element: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private model: monaco.editor.ITextModel;
  private savedValue: string;
  private dirtyChangeCallbacks: ((dirty: boolean) => void)[] = [];
  private contentChangeCallbacks: (() => void)[] = [];

  constructor(options: TextViewOptions) {
    this.element = document.createElement('div');
    this.element.className = 'text-editor-view';
    this.savedValue = options.savedValue ?? options.value;

    this.model = monaco.editor.createModel(options.value, options.language || 'plaintext');

    this.editor = monaco.editor.create(this.element, {
      model: this.model,
      readOnly: Boolean(options.readOnly),
      automaticLayout: true,
      // Not monaco's Windows default of `Consolas, 'Courier New', monospace`:
      // Consolas advances its ASCII 7.7px at 14px while a Hangul glyph takes
      // the full 14px cell, so a Hangul character is not exactly two ASCII
      // columns and mixed Korean/ASCII lines fall off the grid (user report,
      // 2026-09-20). D2Coding sizes both from one design, holding the 2:1
      // cell. The bare `monospace` keyword also holds 2:1 but resolves to
      // GulimChe here — a bitmap face with poor ASCII legibility — so it is
      // only the fallback for machines without D2Coding.
      fontFamily: "'D2Coding', monospace",
      lineNumbers: lineNumbersVisible ? 'on' : 'off',
      // Reserves width for 3 digits by default (monaco's own default is 5)
      // instead of growing/shrinking the gutter as the line count crosses
      // each power of ten (user request, 2026-09-17). Monaco still widens
      // it automatically past 999 lines — this only sets the floor.
      lineNumbersMinChars: 3,
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


    this.model.onDidChangeContent(() => {
      const isDirty = this.model.getValue() !== this.savedValue;
      this.dirtyChangeCallbacks.forEach((cb) => cb(isDirty));
      this.contentChangeCallbacks.forEach((cb) => cb());
    });

    liveTextViews.add(this);
  }

  /** Module-internal: applies a new global line-numbers setting to this one live view. */
  public applyLineNumbersOption(visible: boolean): void {
    this.editor.updateOptions({ lineNumbers: visible ? 'on' : 'off' });
  }

  public getValue(): string {
    return this.model.getValue();
  }

  /** Whether an Edit menu command can run here now (a read-only view refuses text changes). */
  public canRunEditCommand(id: EditCommandId): boolean {
    const command = EDIT_COMMANDS[id];
    if (command.write && this.isReadOnly()) return false;
    if (id === 'undo') return this.model.canUndo();
    if (id === 'redo') return this.model.canRedo();
    return true;
  }

  /**
   * Runs an Edit menu command. Focus goes back to the text first: the menu
   * click took it, and monaco's clipboard and find actions act on the
   * focused editor.
   */
  public runEditCommand(id: EditCommandId): void {
    if (!this.canRunEditCommand(id)) return;
    this.editor.focus();
    // trigger(), not getAction().run(): undo/redo/select-all are core
    // commands with no editor action behind them.
    this.editor.trigger('menu', EDIT_COMMANDS[id].action, null);
  }

  /** Binds Ctrl+S inside this view to `fn` — what saving means is the caller's (FR-P7). */
  public onSaveKey(fn: () => void): void {
    this.editor.addAction({
      id: 'workbench.save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => fn(),
    });
  }

  /** Test-support only: checks both the model ID and a registered grammar. */
  public getLanguageForTest(): { id: string; registered: boolean } {
    const id = this.model.getLanguageId();
    return { id, registered: monaco.languages.getLanguages().some((language) => language.id === id) };
  }

  public isDirty(): boolean {
    return this.model.getValue() !== this.savedValue;
  }

  /** The current saved-baseline text `isDirty()`/edits compare against — see `TextViewOptions.savedValue`. */
  public getSavedValue(): string {
    return this.savedValue;
  }

  public setValue(value: string, updateSavedBaseline = false): void {
    if (updateSavedBaseline) {
      this.savedValue = value;
    }
    this.model.setValue(value);
  }

  public setReadOnly(readOnly: boolean): void {
    this.editor.updateOptions({ readOnly });
  }

  public isReadOnly(): boolean {
    return this.editor.getOption(monaco.editor.EditorOption.readOnly);
  }

  /**
   * Marks the current content as saved (FR-P7): the shell only flips its
   * own dirty bookkeeping here — actually persisting content is the app's
   * job, done before calling this.
   */
  public markSaved(value = this.model.getValue()): void {
    this.savedValue = value;
    this.dirtyChangeCallbacks.forEach((cb) => cb(this.isDirty()));
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
    liveTextViews.delete(this);
    this.editor.dispose();
    this.model.dispose();
  }
}
