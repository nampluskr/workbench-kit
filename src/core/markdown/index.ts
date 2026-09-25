import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import katex from 'katex';
import markdownItKatex from '@vscode/markdown-it-katex';
import hljs from 'highlight.js';
import 'katex/dist/katex.min.css';
import type { ResourceKindRegistry } from '../../registry/kind-registry';
import type { IconThemeManager } from '../icontheme';
import { readLegacyTextFile, readTextFile, writeTextFile, readLocalImage, openExternalUrl } from '../../providers/filesystem';

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
type ImageEntry = { source: string; alt: string };
type MathEnvironment = { math: MathEntry[]; images: ImageEntry[]; nonce: string };

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
parser.renderer.rules.image = (tokens, index, _options, environment) => {
  const env = environment as MathEnvironment;
  const token = tokens[index];
  const id = env.images.push({ source: String(token.attrGet('src') || ''), alt: token.content }) - 1;
  return `<span data-md-image="${env.nonce}-${id}"></span>`;
};

const forbiddenElements = [
  'form', 'button', 'input', 'select', 'option', 'textarea', 'map', 'area', 'style',
  'img', 'picture', 'audio', 'video', 'source', 'track', 'object', 'embed', 'svg', 'math',
];

function renderMarkdownParts(source: string): { html: string; images: ImageEntry[] } {
  if (!DOMPurify.isSupported) throw new Error('HTML sanitization is unavailable');
  const env: MathEnvironment = { math: [], images: [], nonce: crypto.randomUUID() };
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
  for (const placeholder of container.querySelectorAll('[data-md-image]')) {
    const value = placeholder.getAttribute('data-md-image');
    if (!value?.startsWith(`${env.nonce}-`)) continue;
    const id = Number(value.slice(env.nonce.length + 1));
    const entry = Number.isInteger(id) ? env.images[id] : undefined;
    if (!entry) continue;
    const img = document.createElement('img');
    img.dataset.mdImage = String(id);
    img.alt = entry.alt;
    placeholder.replaceWith(img);
  }
  const seen = new Map<string, number>();
  for (const heading of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const slug = (heading.textContent || '').trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
    const count = seen.get(slug) || 0;
    seen.set(slug, count + 1);
    heading.id = `md-${slug}${count ? `-${count}` : ''}`;
  }
  return { html: container.innerHTML, images: env.images };
}

export function renderMarkdown(source: string): string {
  return renderMarkdownParts(source).html;
}

function resolveRelativeLink(sourcePath: string, href: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(href); } catch { return null; }
  if (!decoded || decoded.startsWith('/') || decoded.startsWith('\\') || /^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.includes('?') || decoded.includes('#')) return null;
  const source = sourcePath.replace(/\\/g, '/');
  const parts = source.slice(0, source.lastIndexOf('/')).split('/');
  for (const part of decoded.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length <= 1) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

export function registerMarkdownRenderer(
  registry: ResourceKindRegistry, iconTheme: IconThemeManager,
  openLocal: (path: string) => void,
): void {
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
    let imageUrls: string[] = [];

    const handleNavigation = (event: Event) => {
      const link = (event.target as Element | null)?.closest?.('a');
      if (!link || !element.contains(link)) return;
      event.preventDefault();
      if (event.type !== 'click') return;
      if (event.type === 'click' && event instanceof MouseEvent && event.button !== 0) return;
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#')) {
        let anchor: string;
        try { anchor = decodeURIComponent(href.slice(1)); } catch { return; }
        const target = [...element.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((heading) =>
          heading.id === `md-${anchor}` || heading.id === anchor || heading.textContent?.trim().toLowerCase() === anchor.toLowerCase());
        target?.scrollIntoView({ block: 'start' });
      } else if (/^https?:\/\//i.test(href)) {
        void openExternalUrl(href);
      } else {
        const path = resolveRelativeLink(targetId, href);
        if (path) openLocal(path);
      }
    };
    element.addEventListener('click', handleNavigation);
    element.addEventListener('auxclick', handleNavigation);
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
        if (!disposed && generation === refreshGeneration) {
          const rendered = renderMarkdownParts(source);
          imageUrls.forEach((url) => URL.revokeObjectURL(url));
          imageUrls = [];
          element.innerHTML = rendered.html;
          for (const img of element.querySelectorAll<HTMLImageElement>('img[data-md-image]')) {
            const entry = rendered.images[Number(img.dataset.mdImage)];
            if (!entry || !entry.source || /^(?:[a-z][a-z\d+.-]*:|\/|\\|#)/i.test(entry.source)) continue;
            void (async () => {
              try {
                const data = await readLocalImage(targetId, decodeURIComponent(entry.source));
                if (disposed || generation !== refreshGeneration) return;
                const bytes = Uint8Array.from(atob(data.base64), (char) => char.charCodeAt(0));
                const url = URL.createObjectURL(new Blob([bytes], { type: data.mime }));
                imageUrls.push(url);
                img.src = url;
              } catch { /* Invalid or unavailable images keep their alt text. */ }
            })();
          }
        }
      } catch (error) {
        if (!disposed && generation === refreshGeneration) element.textContent = `Unable to open ${targetId}: ${String(error)}`;
      }
    };
    void refresh();

    return {
      element,
      dispose: () => { disposed = true; imageUrls.forEach((url) => URL.revokeObjectURL(url)); },
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
