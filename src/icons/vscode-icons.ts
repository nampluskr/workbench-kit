import { ColorThemeId, FileIconResolver, IconDescriptor } from '../core/icontheme';
import vsiTheme from './data/vscode-icons.json';
import { LANGUAGE_BY_EXTENSION } from './language-map';

const svgModules: Record<string, string> = import.meta.glob('./assets/vscode-icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

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
