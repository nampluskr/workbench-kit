import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import type { ResourceKindRegistry } from '../../registry/kind-registry';
import type { IconThemeManager } from '../icontheme';
import { readLegacyTextFile, readTextFile } from '../../providers/filesystem';

export const MARKDOWN_KIND = 'markdown';
export const RENDERED_MODE = 'rendered';

const parser = new MarkdownIt({ html: true, linkify: false, typographer: false });

export function renderMarkdown(source: string): string {
  if (!DOMPurify.isSupported) throw new Error('HTML sanitization is unavailable');
  return DOMPurify.sanitize(parser.render(source), {
    FORBID_TAGS: ['form', 'button', 'input', 'select', 'option', 'textarea', 'map', 'area', 'style'],
    FORBID_ATTR: ['style'],
    SANITIZE_NAMED_PROPS: true,
  });
}

export function registerMarkdownRenderer(registry: ResourceKindRegistry, iconTheme: IconThemeManager): void {
  registry.registerTabDecorator(MARKDOWN_KIND, (params, title) => {
    const targetId = typeof params.targetId === 'string' ? params.targetId : title;
    return {
      icon: iconTheme.resolveIcon(title || targetId, false),
      tooltip: `${targetId} — Rendered`,
    };
  });

  registry.register(MARKDOWN_KIND, (targetId) => {
    const element = document.createElement('div');
    element.className = 'markdown-rendered';
    element.setAttribute('data-rendered-path', targetId);
    let disposed = false;
    let refreshGeneration = 0;

    // Link handling is installed with the host bridge in Phase 4.
    const blockNavigation = (event: Event) => {
      if ((event.target as Element | null)?.closest?.('a, area')) event.preventDefault();
    };
    element.addEventListener('click', blockNavigation);
    element.addEventListener('auxclick', blockNavigation);
    element.addEventListener('submit', (event) => event.preventDefault());

    const refresh = async (): Promise<void> => {
      const generation = ++refreshGeneration;
      try {
        let source: string;
        try {
          source = await readTextFile(targetId);
        } catch {
          source = await readLegacyTextFile(targetId);
        }
        if (!disposed && generation === refreshGeneration) element.innerHTML = renderMarkdown(source);
      } catch (error) {
        if (!disposed && generation === refreshGeneration) element.textContent = `Unable to open ${targetId}: ${String(error)}`;
      }
    };
    void refresh();

    return {
      element,
      dispose: () => { disposed = true; },
      refresh: () => { void refresh(); },
      getContentForTest: () => element.innerHTML,
    };
  });
}
