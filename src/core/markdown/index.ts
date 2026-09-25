import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import katex from 'katex';
import markdownItKatex from '@vscode/markdown-it-katex';
import hljs from 'highlight.js';
import 'katex/dist/katex.min.css';
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

type MathEntry = { source: string; displayMode: boolean };
type MathEnvironment = { math: MathEntry[]; nonce: string };

const parser = new MarkdownIt({ html: true, linkify: false, typographer: false });
parser.use((markdownItKatex as unknown as { default: typeof markdownItKatex }).default, { throwOnError: false });
for (const rule of ['math_inline', 'math_inline_block', 'math_inline_bare_block', 'math_block']) {
  parser.renderer.rules[rule] = (tokens, index, _options, environment) => {
    const env = environment as MathEnvironment;
    const id = env.math.push({ source: tokens[index].content, displayMode: rule !== 'math_inline' }) - 1;
    const tag = rule === 'math_inline' ? 'span' : 'div';
    return `<${tag} data-md-math="${env.nonce}-${id}"></${tag}>`;
  };
}
parser.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0];
  const highlighted = language && hljs.getLanguage(language)
    ? hljs.highlight(token.content, { language, ignoreIllegals: true }).value
    : parser.utils.escapeHtml(token.content);
  return `<pre><code class="hljs">${highlighted}</code></pre>`;
};

const forbiddenElements = [
  'form', 'button', 'input', 'select', 'option', 'textarea', 'map', 'area', 'style',
  'img', 'picture', 'audio', 'video', 'source', 'track', 'object', 'embed', 'svg', 'math',
];

export function renderMarkdown(source: string): string {
  if (!DOMPurify.isSupported) throw new Error('HTML sanitization is unavailable');
  const env: MathEnvironment = { math: [], nonce: crypto.randomUUID() };
  const cleaned = DOMPurify.sanitize(parser.render(source, env), {
    FORBID_TAGS: forbiddenElements,
    FORBID_ATTR: ['style'],
    SANITIZE_NAMED_PROPS: true,
  });
  const container = document.createElement('div');
  container.innerHTML = cleaned;
  for (const placeholder of container.querySelectorAll('[data-md-math]')) {
    const value = placeholder.getAttribute('data-md-math');
    if (!value?.startsWith(`${env.nonce}-`)) continue;
    const id = Number(value.slice(env.nonce.length + 1));
    const entry = Number.isInteger(id) ? env.math[id] : undefined;
    if (!entry) continue;
    const html = katex.renderToString(entry.source, {
      displayMode: entry.displayMode, output: 'html', trust: false, throwOnError: false,
    });
    const safeMath = DOMPurify.sanitize(html, {
      FORBID_TAGS: forbiddenElements,
      SANITIZE_NAMED_PROPS: true,
    });
    const template = document.createElement('template');
    template.innerHTML = safeMath;
    placeholder.replaceWith(template.content);
  }
  return container.innerHTML;
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
