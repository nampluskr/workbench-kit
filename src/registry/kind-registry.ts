import type { IContentRenderer, GroupPanelPartInitParameters } from 'dockview-core';
import type { EditorComponentFactory, EditorController } from '../core/editor';

// NOT part of the common core (src/core/**). This module is free to know
// about resource kinds; the shell it plugs into never imports it (FR-I1,
// NFR-1, INTENT 3, D-4).

export type KindRendererFactory = (targetId: string) => {
  element: HTMLElement;
  dispose?: () => void;
  /** Optional: report changed/saved state for the ● indicator (FR-L1, FR-P7). */
  onDirtyChange?: (cb: (dirty: boolean) => void) => () => void;
  /** Optional: what "Save" does for this view. Returns whether it succeeded (FR-L3, FR-P7). */
  save?: () => Promise<boolean> | boolean;
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

  public register(kind: string, factory: KindRendererFactory): void {
    this.factories.set(kind, factory);
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
   * canonical place that owns the ● title mutation) — it is not otherwise
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
    this.params = merged;
    if (identityChanged) {
      this.renderForCurrentParams();
    }
  }

  private renderForCurrentParams(): void {
    this.unsubscribeDirty?.();
    this.unsubscribeDirty = null;
    if (this.panelId) {
      this.registry.unregisterSaveable(this.panelId);
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

    this.inner = factory(targetId);
    this.element.appendChild(this.inner.element);

    if (this.inner.onDirtyChange && this.panelId) {
      const panelId = this.panelId;
      this.unsubscribeDirty = this.inner.onDirtyChange((dirty) => {
        this.controller.setTabDirty(panelId, dirty);
      });
    }
    if (this.inner.save && this.panelId) {
      this.registry.registerSaveable(this.panelId, this.inner.save);
    }
  }

  public dispose(): void {
    this.unsubscribeDirty?.();
    this.unsubscribeDirty = null;
    if (this.panelId) {
      this.registry.unregisterSaveable(this.panelId);
    }
    this.inner?.dispose?.();
    this.inner = null;
    this.element.innerHTML = '';
  }
}
