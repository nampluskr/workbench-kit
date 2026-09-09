import { ColorThemeId, FileIconResolver, IconDescriptor } from '../core/icontheme';
import setiTheme from './data/seti.json';
import { LANGUAGE_BY_EXTENSION } from './language-map';

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const h = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function interpolateHex(hex1: string, hex2: string, ratio: number): string {
  try {
    const [r1, g1, b1] = parseHex(hex1);
    const [r2, g2, b2] = parseHex(hex2);
    return toHex(
      r1 + (r2 - r1) * ratio,
      g1 + (g2 - g1) * ratio,
      b1 + (b2 - b1) * ratio
    );
  } catch {
    return hex1;
  }
}

function darkenHex(hex: string, amount = 0.22): string {
  try {
    const [r, g, b] = parseHex(hex);
    return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  } catch {
    return hex;
  }
}

export class SetiResolver implements FileIconResolver {
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
    if (isFolder) {
      const folderColor = theme === 'light' ? '#333333' : (theme === 'gray' ? '#1f1f1f' : '#cccccc');
      return {
        theme: 'seti',
        kind: 'codicon',
        cssClass: isOpen ? 'codicon-folder-opened' : 'codicon-folder',
        color: folderColor,
      };
    }

    const lower = (name || '').toLowerCase();
    const key = this.lookupKey(lower, theme) || (setiTheme as any).file || '_default';
    const defs = setiTheme.iconDefinitions as Record<string, { fontCharacter?: string; fontColor?: string }>;

    let defDark: { fontCharacter?: string; fontColor?: string } | undefined;
    let defLight: { fontCharacter?: string; fontColor?: string } | undefined;

    if (key.endsWith('_light')) {
      defLight = defs[key];
      const darkKey = key.replace(/_light$/, '');
      defDark = defs[darkKey] || defs['_default'];
    } else {
      defDark = defs[key] || defs['_default'];
      defLight = defs[key + '_light'] || (key === '_default' ? defs['_default_light'] : undefined);
    }

    if (defDark && defDark.fontCharacter) {
      const charDef = (theme === 'light' && defLight?.fontCharacter) ? defLight : defDark;
      const code = parseInt(charDef.fontCharacter!.replace(/^\\/, ''), 16);
      if (!Number.isNaN(code)) {
        const darkColor = defDark.fontColor || '#d4d7d6';
        const lightColor = defLight?.fontColor || darkenHex(darkColor, 0.22);
        let activeColor = darkColor;
        if (theme === 'light') {
          activeColor = lightColor;
        } else if (theme === 'gray') {
          activeColor = interpolateHex(darkColor, lightColor, 0.450892857);
        }

        return {
          theme: 'seti',
          kind: 'font',
          char: String.fromCodePoint(code),
          color: activeColor,
          cssClass: 'seti-icon',
          iconName: key,
        };
      }
    }

    const fallbackColor = theme === 'light' ? '#444444' : (theme === 'gray' ? '#222222' : '#d4d7d6');
    return {
      theme: 'seti',
      kind: 'codicon',
      cssClass: 'codicon-file',
      color: fallbackColor,
    };
  }

  private lookupKey(lowerName: string, colorTheme: ColorThemeId = 'dark'): string | null {
    const lightTheme = (setiTheme as any).light;
    const checkLight = colorTheme === 'light';

    if (checkLight && lightTheme?.fileNames && lightTheme.fileNames[lowerName]) {
      return lightTheme.fileNames[lowerName];
    }
    if (setiTheme.fileNames && (setiTheme.fileNames as Record<string, string>)[lowerName]) {
      return (setiTheme.fileNames as Record<string, string>)[lowerName];
    }

    const parts = lowerName.split('.');
    if (parts.length < 2) return null;

    // Check compound extensions from longest to shortest (e.g. buf.gen.yml, gen.yml, yml)
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join('.');
      if (checkLight && lightTheme?.fileExtensions && lightTheme.fileExtensions[ext]) {
        return lightTheme.fileExtensions[ext];
      }
      if (setiTheme.fileExtensions && (setiTheme.fileExtensions as Record<string, string>)[ext]) {
        return (setiTheme.fileExtensions as Record<string, string>)[ext];
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
        if (setiTheme.languageIds && (setiTheme.languageIds as Record<string, string>)[language]) {
          return (setiTheme.languageIds as Record<string, string>)[language];
        }
      }
    }

    return null;
  }
}
