import type { IContentRenderer, GroupPanelPartInitParameters } from 'dockview-core';
import type { EditorComponentFactory } from '../core/editor';

// NOT part of the common core (src/core/**). This module is free to know
// about resource kinds; the shell it plugs into never imports it (FR-I1,
// NFR-1, INTENT 3, D-4).

export type KindRendererFactory = (targetId: string) => {
  element: HTMLElement;
  dispose?: () => void;
};

/**
 * Resource kind registration slot (WK-025, FR-I1). Registering a new kind
 * here never touches src/core/*.ts: the shell only ever calls
 * `createComponentFactory()` once, and every future kind is added by calling
 * `register()` again.
 */
export class ResourceKindRegistry {
  private factories = new Map<string, KindRendererFactory>();

  public register(kind: string, factory: KindRendererFactory): void {
    this.factories.set(kind, factory);
  }

  public has(kind: string): boolean {
    return this.factories.has(kind);
  }

  public getFactory(kind: string): KindRendererFactory | undefined {
    return this.factories.get(kind);
  }

  /**
   * Returns a single EditorComponentFactory suitable for
   * `EditorController.setComponentFactory()`. The returned renderer defers
   * kind dispatch to `init()`, since dockview only supplies panel params at
   * that point, not at component-creation time.
   */
  public createComponentFactory(): EditorComponentFactory {
    const registry = this;
    return () => new KindDispatchRenderer(registry);
  }
}

class KindDispatchRenderer implements IContentRenderer {
  public readonly element: HTMLElement;
  private inner: { element: HTMLElement; dispose?: () => void } | null = null;
  private params: { kind?: string; targetId?: string } = {};

  constructor(private registry: ResourceKindRegistry) {
    this.element = document.createElement('div');
    // Reuses the shell's editor-panel-content contract (D-20, FR-C2): an
    // unresolved/empty panel renders 0 children and 0 text, same as before
    // any kind was registered.
    this.element.className = 'editor-panel-content';
  }

  public init(parameters: GroupPanelPartInitParameters): void {
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
  }

  public dispose(): void {
    this.inner?.dispose?.();
    this.inner = null;
    this.element.innerHTML = '';
  }
}
