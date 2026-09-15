import { ColorThemeId, FileIconResolver, IconDescriptor } from '../core/icontheme';

/**
 * Ported from the sibling markdown-viewer project's own `Simple` theme
 * (shared/design/icons.svg #icon-folder / #icon-folder-open / #icon-file) —
 * same author, no third-party asset, so none of the FR-Q4 license paperwork
 * seti/vscode-icons carry applies here.
 */
const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
  '<path d="M1.5 12.5v-9h4v2h7v7z" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-linejoin="round"/>' +
  '</svg>';

const FILE_SVG =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
  '<path d="M3.5 2.5h6l3 3v8h-9zM9.5 2.5v3h3" fill="none" stroke="currentColor" stroke-linejoin="round"/>' +
  '</svg>';

let maskIdCounter = 0;

/**
 * The open-folder glyph masks its own rear panel behind the front flap
 * (source SVG's `folder-open-rear-mask`). A tree can show several open
 * folders at once, each getting its own inline <svg> — a fixed mask id would
 * collide across them and every instance after the first would resolve
 * `url(#id)` to the first one's mask instead of its own.
 */
function folderOpenSvg(): string {
  const maskId = `simple-folder-open-mask-${maskIdCounter++}`;
  return (
    '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">` +
    '<rect width="16" height="16" fill="white"/>' +
    '<path d="M2.5 12.5 4.5 7.5h10l-2 5z" fill="black" stroke="black"/>' +
    '</mask>' +
    `<path d="M1.5 12.5v-9h4v2h7v7z" fill="none" stroke="currentColor" stroke-linejoin="miter" mask="url(#${maskId})"/>` +
    '<path d="M2.5 12.5 4.5 7.5h10l-2 5z" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-linejoin="miter"/>' +
    '</svg>'
  );
}

export class SimpleResolver implements FileIconResolver {
  private activeColorTheme: ColorThemeId = 'dark';

  public setColorTheme(theme: ColorThemeId): void {
    this.activeColorTheme = theme;
  }

  /**
   * No per-extension distinction (INTENT 7's minimal example, mirrored here
   * for the theme itself) — every row draws the same stroke-only outline, so
   * one colour rule covers folder and file alike. It is the exact formula
   * VS Code Built-in (seti.ts) already uses for ITS OWN folder glyph (user
   * request, 2026-09-15: match that, not invent a new one).
   */
  public resolve(
    _name: string,
    isFolder: boolean,
    isOpen?: boolean,
    colorTheme?: ColorThemeId
  ): IconDescriptor {
    const theme = colorTheme || this.activeColorTheme;
    const color = theme === 'light' ? '#333333' : theme === 'gray' ? '#1f1f1f' : '#cccccc';

    if (isFolder) {
      return {
        theme: 'simple',
        kind: 'svg',
        svgData: isOpen ? folderOpenSvg() : FOLDER_SVG,
        color,
      };
    }
    return {
      theme: 'simple',
      kind: 'svg',
      svgData: FILE_SVG,
      color,
    };
  }
}
