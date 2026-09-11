import { ColorThemeId, FileIconResolver, IconDescriptor } from '../core/icontheme';
import vsiTheme from './data/vscode-icons.json';
import { LANGUAGE_BY_EXTENSION } from './language-map';

const rawSvgModules: Record<string, string> = import.meta.glob('./assets/vscode-icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Most vendor SVGs carry their colours in a CSP-hostile place: ~75% in an
 * inline `style="fill:…"` attribute, a few in a `<style>` block with class
 * selectors. This app's CSP (`style-src 'self'`) strips both, so the icon
 * would render with no fill (.claude/rules/dockview-css.md). Rewrite both to
 * the equivalent presentation ATTRIBUTES (`fill`, `stroke`, `opacity`, …),
 * which the CSP does not touch. The glyph and its reference colours are
 * unchanged (v0.2 FR-X13).
 */
function declsToAttrs(decls: string): string[] {
  return decls
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const idx = d.indexOf(':');
      if (idx < 0) return '';
      const prop = d.slice(0, idx).trim();
      const val = d.slice(idx + 1).trim().replace(/\s*!important$/i, '');
      // Only plain presentation properties (no url(), no transform-origin, …).
      if (!/^[a-z-]+$/.test(prop) || /[<>"]/.test(val)) return '';
      return `${prop}="${val}"`;
    })
    .filter(Boolean);
}

function inlineStyleToAttrs(svg: string): string {
  let out = svg;

  // 1. `<style> .cls { fill:… } </style>` → attributes on class="cls" elements.
  out = out.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_full, cssText: string) => {
    const ruleRe = /\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(cssText)) !== null) {
      const cls = m[1];
      const attrs = declsToAttrs(m[2]);
      if (!attrs.length) continue;
      // Add the attributes to every element carrying this class (unless it
      // already sets that attribute explicitly).
      out = out.replace(
        new RegExp(`<([a-z]+)([^>]*\\sclass="[^"]*\\b${cls}\\b[^"]*")([^>]*)>`, 'g'),
        (elFull, tag, pre, post) => {
          const existing = elFull;
          const add = attrs.filter((a) => {
            const name = a.slice(0, a.indexOf('='));
            return !new RegExp(`\\s${name}=`).test(existing);
          });
          return add.length ? `<${tag}${pre}${post} ${add.join(' ')}>` : elFull;
        }
      );
    }
    return ''; // drop the (blocked) <style> block
  });

  // 2. inline `style="fill:…"` → presentation attributes.
  out = out.replace(/\sstyle="([^"]*)"/g, (_full, decls: string) => {
    const attrs = declsToAttrs(decls);
    return attrs.length ? ' ' + attrs.join(' ') : '';
  });

  return out;
}

const svgModules: Record<string, string> = Object.fromEntries(
  Object.entries(rawSvgModules).map(([k, v]) => [k, inlineStyleToAttrs(v)])
);

export class VscodeIconsResolver implements FileIconResolver {
  private activeColorTheme: ColorThemeId = 'dark';

  public setColorTheme(theme: ColorThemeId): void {
    this.activeColorTheme = theme;
  }

  public resolve(
    name: string,
    isFolder: boolean,
    isOpen?: boolean,
    colorTheme?: ColorThemeId
  ): IconDescriptor {
    const theme = colorTheme || this.activeColorTheme;
    const lower = (name || '').toLowerCase();
    const lightTheme = (vsiTheme as any).light;
    const checkLight = theme === 'light';

    let key: string;

    if (isFolder) {
      if (isOpen) {
        key =
          (checkLight && lightTheme?.folderNamesExpanded?.[lower]) ||
          ((vsiTheme.folderNamesExpanded as Record<string, string>)?.[lower]) ||
          (checkLight && lightTheme?.folderExpanded) ||
          (vsiTheme as any).folderExpanded ||
          '_folder_open';
      } else {
        key =
          (checkLight && lightTheme?.folderNames?.[lower]) ||
          ((vsiTheme.folderNames as Record<string, string>)?.[lower]) ||
          (checkLight && lightTheme?.folder) ||
          (vsiTheme as any).folder ||
          '_folder';
      }
    } else {
      key =
        this.lookupKey(lower, theme) ||
        (checkLight && lightTheme?.file) ||
        (vsiTheme as any).file ||
        '_file';
    }

    const defs = vsiTheme.iconDefinitions as Record<string, { iconPath?: string }>;
    let def = defs[key];
    // If def has no iconPath (e.g. _file_light / _folder_light had empty paths), fallback to base
    if (!def || !def.iconPath) {
      if (isFolder) {
        key = isOpen ? ((vsiTheme as any).folderExpanded || '_folder_open') : ((vsiTheme as any).folder || '_folder');
      } else {
        key = (vsiTheme as any).file || '_file';
      }
      def = defs[key];
    }

    const themeColor = theme === 'light' ? '#1f1f1f' : (theme === 'gray' ? '#7e7e7e' : '#cccccc');

    if (def && def.iconPath) {
      const fileName = def.iconPath.replace(/^(\.\.\/)+/, '').replace(/^icons\//, '');
      const assetKey = './assets/vscode-icons/' + fileName;
      const svgData = svgModules[assetKey];
      const iconName = fileName.replace(/\.svg$/, '');

      return {
        theme: 'vscode-icons',
        kind: 'svg',
        iconName,
        iconPath: 'icons/' + fileName,
        svgData,
        color: themeColor,
      };
    }

    const codiconColor =
      theme === 'light'
        ? (isFolder ? '#b8860b' : '#005fb8')
        : (theme === 'gray' ? (isFolder ? '#d49b0b' : '#2278c9') : (isFolder ? '#e5a50a' : '#42a5f5'));

    return {
      theme: 'vscode-icons',
      kind: 'codicon',
      cssClass: isFolder ? (isOpen ? 'codicon-folder-active' : 'codicon-folder') : 'codicon-file',
      color: codiconColor,
    };
  }

  private lookupKey(lowerName: string, colorTheme: ColorThemeId = 'dark'): string | null {
    const lightTheme = (vsiTheme as any).light;
    const checkLight = colorTheme === 'light';

    if (checkLight && lightTheme?.fileNames && lightTheme.fileNames[lowerName]) {
      return lightTheme.fileNames[lowerName];
    }
    if (vsiTheme.fileNames && (vsiTheme.fileNames as Record<string, string>)[lowerName]) {
      return (vsiTheme.fileNames as Record<string, string>)[lowerName];
    }

    const parts = lowerName.split('.');
    if (parts.length < 2) return null;

    // Check compound extensions from longest to shortest (e.g. buf.gen.yml -> gen.yml -> yml)
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join('.');
      if (checkLight && lightTheme?.fileExtensions && lightTheme.fileExtensions[ext]) {
        return lightTheme.fileExtensions[ext];
      }
      if (vsiTheme.fileExtensions && (vsiTheme.fileExtensions as Record<string, string>)[ext]) {
        return (vsiTheme.fileExtensions as Record<string, string>)[ext];
      }
    }

    // Check languageIds
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join('.');
      const language = LANGUAGE_BY_EXTENSION[ext];
      if (language) {
        if (checkLight && lightTheme?.languageIds && lightTheme.languageIds[language]) {
          return lightTheme.languageIds[language];
        }
        if (vsiTheme.languageIds && (vsiTheme.languageIds as Record<string, string>)[language]) {
          return (vsiTheme.languageIds as Record<string, string>)[language];
        }
      }
    }

    return null;
  }
}
