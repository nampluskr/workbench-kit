import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import type { ResourceKindRegistry } from '../../registry/kind-registry';
import type { IconThemeManager } from '../icontheme';
import { readLegacyTextFile, readTextFile, writeTextFile } from '../../providers/filesystem';

export const MARKDOWN_KIND = 'markdown';
export const RENDERED_MODE = 'rendered';
const TOGGLE_STORAGE_KEY = 'workbench:markdown-rendering';
const iconSources = import.meta.glob('./icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const toggleListeners = new Set<() => void>();

function loadToggle(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(TOGGLE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let markdownRenderingEnabled = loadToggle();

export function isMarkdownFile(filePath: string): boolean {
  return /\.md$/i.test(filePath);
}

export function getMarkdownRenderingEnabled(): boolean {
  return markdownRenderingEnabled;
}

export function setMarkdownRenderingEnabled(enabled: boolean): void {
  markdownRenderingEnabled = enabled;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TOGGLE_STORAGE_KEY, String(enabled));
  } catch {
    // Storage failures leave the setting active for this session.
  }
  toggleListeners.forEach((listener) => listener());
}

export function onMarkdownRenderingChanged(listener: () => void): () => void {
  toggleListeners.add(listener);
  return () => toggleListeners.delete(listener);
}

export function createMarkdownToggleIcon(enabled: boolean): SVGElement {
  const source = iconSources[enabled ? './icons/on.svg' : './icons/off.svg'];
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  if (!(svg instanceof SVGElement)) throw new Error('Markdown toggle icon is invalid');
  return svg;
}

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

  registry.register(MARKDOWN_KIND, (targetId, { params, updateParams }) => {
    const element = document.createElement('div');
    element.className = 'markdown-rendered';
    element.setAttribute('data-rendered-path', targetId);
    let disposed = false;
    let refreshGeneration = 0;
    let dirtyListener: ((dirty: boolean) => void) | null = null;

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
      onDirtyChange: (listener: (dirty: boolean) => void) => {
        dirtyListener = listener;
        return () => { if (dirtyListener === listener) dirtyListener = null; };
      },
      save: async () => {
        if (params.isDirty !== true || typeof params.value !== 'string') return false;
        try {
          if (!(await writeTextFile(targetId, params.value))) return false;
          updateParams({ savedValue: params.value, isDirty: false });
          dirtyListener?.(false);
          void refresh();
          return true;
        } catch {
          return false;
        }
      },
      getContentForTest: () => element.innerHTML,
    };
  });
}
