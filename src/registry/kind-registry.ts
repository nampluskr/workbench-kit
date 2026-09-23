import type { IContentRenderer, GroupPanelPartInitParameters } from 'dockview-core';
import type { EditorComponentFactory, EditorController, TabDecoration, TabDecorator } from '../core/editor';

// NOT part of the common core (src/core/**). This module is free to know
// about resource kinds; the shell it plugs into never imports it (FR-I1,
// NFR-1, INTENT 3, D-4).

export interface KindRendererContext {
  /**
   * This panel's own dockview params, as of creation/re-dispatch. A preset
   * that round-trips through `EditorController.getApi().toJSON()`/
   * `fromJSON()` (v0.3 D-7/D-8, Folder Workspace mode) reads its own
   * previously-written fields back out of here — dockview's serialization
   * only ever carries `params`, nothing else, so any state a preset wants to
   * survive that round-trip has to live here, written via `updateParams`.
   */
  params: Record<string, unknown>;
  /**
   * Merges `patch` into this panel's own dockview params (survives
   * `toJSON()`/`fromJSON()`). Kind-agnostic — it is just dockview panel
   * params — so this does not violate the common-core resource-kind rule;
   * only presets (this file's callers) decide what goes in `patch`.
   */
  updateParams: (patch: Record<string, unknown>) => void;
}

/**
 * `targetId` stays the first, positional argument — not folded into `ctx` —
 * because `KindRendererFactory` is a public extension contract (FR-I1: any
 * kind registers with zero core changes) that pre-dates `ctx`. A kind
 * registered the old way, as `(targetId) => {...}`, must keep working
 * unmodified; JS callers that only take one parameter simply never see the
 * second one. Folding `targetId` into `ctx` broke exactly that (round-1
 * adversarial review follow-up: v0.1 Phase 5/6/7's own FR-I1 test kinds,
 * which register `(targetId) => {...}` and use `targetId` as a plain string
 * key, silently received the whole `ctx` object instead once this shipped
 * as a single-argument change — `dirtySetters.get(targetId)` no longer found
 * anything, since the map had been keyed by object identity, not the id).
 */
export type KindRendererFactory = (targetId: string, ctx: KindRendererContext) => {
  element: HTMLElement;
  dispose?: () => void;
  /** Optional: report changed/saved state for the ● indicator (FR-L1, FR-P7). */
  onDirtyChange?: (cb: (dirty: boolean) => void) => () => void;
  /** Optional: what "Save" does for this view. Returns whether it succeeded (FR-L3, FR-P7). */
  save?: () => Promise<boolean> | boolean;
  /** Optional: set or switch the active mode of this view. */
  setMode?: (mode: string) => void;
  /** Optional: request keyboard focus into this view. */
  focus?: () => void;
  /** Optional: re-read this view's own backing data from scratch (WK-117). */
  refresh?: () => void;
  /** Test-support only: reads this view's current live content, when it has any. */
  getContentForTest?: () => string;
  /** Test-support only: current Monaco language and registration status. */
  getLanguageForTest?: () => { id: string; registered: boolean };
  /** Test-support only: drives a real content edit, when this view has any. */
  appendContentForTest?: (text: string) => void;
  /** Test-support only: drives a real undo through this view's own undo stack, when it has one. */
  undoForTest?: () => void;
  /** Test-support only: this view's own live dirty computation, independent of the panel's serialized `params.isDirty`. */
  isDirtyForTest?: () => boolean;
};

/**
 * Resource kind registration slot (WK-025, FR-I1). Registering a new kind
 * here never touches src/core/*.ts: the shell only ever calls
 * `createComponentFactory()` once, and every future kind is added by calling
 * `register()` again.
 */
export class ResourceKindRegistry {
  private factories = new Map<string, KindRendererFactory>();
  private saveables = new Map<string, () => Promise<boolean> | boolean>();
  private modeHandlers = new Map<string, (mode: string) => void>();
  private focusHandlers = new Map<string, () => void>();
  private refreshHandlers = new Map<string, () => void>();
  private tabDecorators = new Map<string, TabDecorator>();
  /** Test-support only: the live inner view per panel, so a test script can drive/read real content without reaching into dockview internals. */
  private innerForTest = new Map<string, ReturnType<KindRendererFactory>>();

  /** Test-support only. */
  public getInnerForTest(panelId: string): ReturnType<KindRendererFactory> | undefined {
    return this.innerForTest.get(panelId);
  }

  /** Test-support only. */
  public setInnerForTest(panelId: string, inner: ReturnType<KindRendererFactory>): void {
    this.innerForTest.set(panelId, inner);
  }

  /** Test-support only. */
  public deleteInnerForTest(panelId: string): void {
    this.innerForTest.delete(panelId);
  }

  public register(kind: string, factory: KindRendererFactory): void {
    this.factories.set(kind, factory);
  }

  /**
   * How a kind's tabs look beside their title — icon, close-button marker,
   * hover text (user request, 2026-09-23). Keyed by kind, and fed only the
   * panel's own params, so an inactive tab whose view was never rendered
   * still gets decorated.
   */
  public registerTabDecorator(kind: string, fn: TabDecorator): void {
    this.tabDecorators.set(kind, fn);
  }

  /** The single decorator `main.ts` hands to `editor.setTabDecorator()`; dispatches on `params.kind`. */
  public describeTab(params: Record<string, unknown>, title: string): TabDecoration | null {
    const kind = typeof params.kind === 'string' ? params.kind : undefined;
    const fn = kind ? this.tabDecorators.get(kind) : undefined;
    return fn ? fn(params, title) : null;
  }

  public has(kind: string): boolean {
    return this.factories.has(kind);
  }

  public getFactory(kind: string): KindRendererFactory | undefined {
    return this.factories.get(kind);
  }

  public registerSaveable(panelId: string, fn: () => Promise<boolean> | boolean): void {
    this.saveables.set(panelId, fn);
  }

  public unregisterSaveable(panelId: string): void {
    this.saveables.delete(panelId);
  }

  public registerModeHandler(panelId: string, fn: (mode: string) => void): void {
    this.modeHandlers.set(panelId, fn);
  }

  public unregisterModeHandler(panelId: string): void {
    this.modeHandlers.delete(panelId);
  }

  public setPanelMode(panelId: string, mode: string): void {
    this.modeHandlers.get(panelId)?.(mode);
  }

  public registerFocusHandler(panelId: string, fn: () => void): void {
    this.focusHandlers.set(panelId, fn);
  }

  public unregisterFocusHandler(panelId: string): void {
    this.focusHandlers.delete(panelId);
  }

  public focusPanel(panelId: string): void {
    this.focusHandlers.get(panelId)?.();
  }

  public registerRefreshHandler(panelId: string, fn: () => void): void {
    this.refreshHandlers.set(panelId, fn);
  }

  public unregisterRefreshHandler(panelId: string): void {
    this.refreshHandlers.delete(panelId);
  }

  public refreshPanel(panelId: string): void {
    this.refreshHandlers.get(panelId)?.();
  }

  /** The single save handler `main.ts` registers via `editor.setSaveHandler` (FR-P7). */
  public async save(panelId: string): Promise<boolean> {
    const fn = this.saveables.get(panelId);
    if (!fn) return false;
    return await fn();
  }

  /**
   * Returns a single EditorComponentFactory suitable for
   * `EditorController.setComponentFactory()`. The returned renderer defers
   * kind dispatch to `init()`, since dockview only supplies panel params at
   * that point, not at component-creation time. `controller` is used only
   * to forward the dirty flag to the shell's own `setTabDirty` (the single
   * canonical place that owns the ● indicator) — it is not otherwise
   * reachable from the rendered view.
   */
  public createComponentFactory(controller: EditorController): EditorComponentFactory {
    const registry = this;
    return () => new KindDispatchRenderer(registry, controller);
  }
}

class KindDispatchRenderer implements IContentRenderer {
  public readonly element: HTMLElement;
  private inner: ReturnType<KindRendererFactory> | null = null;
  private params: { kind?: string; targetId?: string } = {};
  private panelId: string | null = null;
  private unsubscribeDirty: (() => void) | null = null;

  constructor(
    private registry: ResourceKindRegistry,
    private controller: EditorController
  ) {
    this.element = document.createElement('div');
    // Reuses the shell's editor-panel-content contract (D-20, FR-C2): an
    // unresolved/empty panel renders 0 children and 0 text, same as before
    // any kind was registered.
    this.element.className = 'editor-panel-content';
  }

  public init(parameters: GroupPanelPartInitParameters): void {
    this.panelId = parameters.api.id;
    this.params = (parameters.params || {}) as { kind?: string; targetId?: string };
    this.renderForCurrentParams();
  }

  public update(event: { params?: Record<string, unknown> }): void {
    if (!event.params) return;
    const merged = { ...this.params, ...event.params } as { kind?: string; targetId?: string };
    // Only re-dispatch when kind or targetId actually change. Unrelated
    // metadata (e.g. isDirty from setTabDirty) must not tear down a live
    // view for the tab's lifetime (D-4, D-24).
    const identityChanged = merged.kind !== this.params.kind || merged.targetId !== this.params.targetId;
    // On an identity change the merge above is the wrong shape: whatever the
    // PREVIOUS resource wrote back through `updateParams` (a file's `value`/
    // `savedValue` snapshot, say) is still in `this.params` and would be
    // handed to the new resource's renderer as if it described the new
    // target. `openItem` does try to clear those keys by sending them as
    // `undefined`, but dockview drops undefined-valued keys when it merges,
    // so they never reach us — a preview tab browsing A then B rendered B's
    // title and language over A's content, never reading B from disk
    // (reported 2026-09-20). Identity changes therefore take the incoming
    // params alone; only same-identity updates merge.
    this.params = identityChanged ? ({ ...event.params } as { kind?: string; targetId?: string }) : merged;
    if (identityChanged) {
      this.renderForCurrentParams();
    }
  }

  private renderForCurrentParams(): void {
    this.unsubscribeDirty?.();
    this.unsubscribeDirty = null;
    if (this.panelId) {
      this.registry.unregisterSaveable(this.panelId);
      this.registry.deleteInnerForTest(this.panelId);
    }
    this.inner?.dispose?.();
    this.inner = null;
    this.element.innerHTML = '';

    const { kind, targetId } = this.params;
    if (!kind || !targetId) {
      return;
    }

    const factory = this.registry.getFactory(kind);
    if (!factory) {
      return;
    }

    const panelId = this.panelId;
    this.inner = factory(targetId, {
      params: this.params,
      updateParams: (patch) => {
        if (!panelId) return;
        this.controller.getApi().getPanel(panelId)?.update({ params: patch });
      },
    });
    this.element.appendChild(this.inner.element);
    if (panelId) {
      this.registry.setInnerForTest(panelId, this.inner);
    }

    if (this.inner.onDirtyChange && this.panelId) {
      const panelId = this.panelId;
      this.unsubscribeDirty = this.inner.onDirtyChange((dirty) => {
        this.controller.setTabDirty(panelId, dirty);
      });
    }
    if (this.inner.save && this.panelId) {
      this.registry.registerSaveable(this.panelId, this.inner.save);
    }
    if (this.inner.setMode && this.panelId) {
      this.registry.registerModeHandler(this.panelId, (m) => this.inner?.setMode?.(m));
    }
    if (this.inner.focus && this.panelId) {
      this.registry.registerFocusHandler(this.panelId, () => this.inner?.focus?.());
    }
    if (this.inner.refresh && this.panelId) {
      this.registry.registerRefreshHandler(this.panelId, () => this.inner?.refresh?.());
    }
  }

  public focus(): void {
    this.inner?.focus?.();
  }

  public dispose(): void {
    this.unsubscribeDirty?.();
    this.unsubscribeDirty = null;
    if (this.panelId) {
      this.registry.unregisterSaveable(this.panelId);
      this.registry.unregisterModeHandler(this.panelId);
      this.registry.unregisterFocusHandler(this.panelId);
      this.registry.unregisterRefreshHandler(this.panelId);
      this.registry.deleteInnerForTest(this.panelId);
    }
    this.inner?.dispose?.();
    this.inner = null;
    this.element.innerHTML = '';
  }
}
