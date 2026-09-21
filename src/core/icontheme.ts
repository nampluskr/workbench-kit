export type FileIconThemeId = 'seti' | 'vscode-icons' | 'simple';
export type ColorThemeId = 'dark' | 'light' | 'gray';

export interface IconDescriptor {
  theme: FileIconThemeId;
  kind: 'codicon' | 'font' | 'svg';
  cssClass?: string;
  svgData?: string;
  char?: string;
  color?: string;
  iconName?: string;
  iconPath?: string;
}

export interface FileIconResolver {
  resolve(name: string, isFolder: boolean, isOpen?: boolean, colorTheme?: ColorThemeId): IconDescriptor;
  setColorTheme?(theme: ColorThemeId): void;
}

export class IconThemeManager {
  private activeTheme: FileIconThemeId = 'seti';
  private activeColorTheme: ColorThemeId = 'dark';
  private resolvers: Map<FileIconThemeId, FileIconResolver> = new Map();
  private onThemeChangeCallbacks: ((theme: FileIconThemeId) => void)[] = [];
  /**
   * Separate from `onThemeChangeCallbacks` on purpose (Codex A22 R1,
   * Major): `TreeController`'s Explorer subscribes to file-icon-theme
   * changes only and gets its OWN dedicated colour-only refresh
   * (`WorkbenchApp`'s `this.tree?.refreshThemeColors()`, called from
   * `ThemeManager.onThemeChange` directly) — a full `tree.render()` on
   * every colour-theme flip would drop an open inline-rename row (A14
   * R1-3). Folding colour-theme changes into `onThemeChangeCallbacks`
   * here would silently give the Explorer tree an extra full re-render
   * it was deliberately spared. `RowListController` has no inline-rename
   * state to lose, so it can just re-`render()` on this event.
   */
  private onColorThemeChangeCallbacks: ((theme: ColorThemeId) => void)[] = [];

  constructor(initialTheme: FileIconThemeId = 'seti', initialColorTheme: ColorThemeId = 'dark') {
    this.setTheme(initialTheme);
    this.activeColorTheme = initialColorTheme;
  }

  public setColorTheme(colorTheme: ColorThemeId): void {
    this.activeColorTheme = colorTheme;
    for (const resolver of this.resolvers.values()) {
      if (resolver.setColorTheme) {
        resolver.setColorTheme(colorTheme);
      }
    }
    this.onColorThemeChangeCallbacks.forEach((cb) => cb(colorTheme));
  }

  public onColorThemeChange(cb: (theme: ColorThemeId) => void): () => void {
    this.onColorThemeChangeCallbacks.push(cb);
    return () => {
      this.onColorThemeChangeCallbacks = this.onColorThemeChangeCallbacks.filter((c) => c !== cb);
    };
  }

  public getColorTheme(): ColorThemeId {
    return this.activeColorTheme;
  }

  public registerResolver(theme: FileIconThemeId, resolver: FileIconResolver): void {
    if (resolver.setColorTheme) {
      resolver.setColorTheme(this.activeColorTheme);
    }
    this.resolvers.set(theme, resolver);
  }

  public getTheme(): FileIconThemeId {
    return this.activeTheme;
  }

  public setTheme(theme: FileIconThemeId): void {
    this.activeTheme = theme;
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.iconTheme = theme;
      if (document.body) {
        document.body.dataset.iconTheme = theme;
      }
    }
    this.onThemeChangeCallbacks.forEach((cb) => cb(theme));
  }

  public toggleTheme(): FileIconThemeId {
    const nextTheme: FileIconThemeId = this.activeTheme === 'seti' ? 'vscode-icons' : 'seti';
    this.setTheme(nextTheme);
    return nextTheme;
  }

  public onThemeChange(cb: (theme: FileIconThemeId) => void): () => void {
    this.onThemeChangeCallbacks.push(cb);
    return () => {
      this.onThemeChangeCallbacks = this.onThemeChangeCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Shell is oblivious to file extensions (FR-Q3, INTENT 3).
   * It only passes row name and folder open state, receiving an IconDescriptor.
   * Common core maintains zero extension-to-icon mapping tables.
   */
  public resolveIcon(
    name: string,
    isFolder: boolean,
    isOpen?: boolean,
    colorTheme?: ColorThemeId
  ): IconDescriptor {
    const resolver = this.resolvers.get(this.activeTheme);
    const themeToUse = colorTheme || this.activeColorTheme;
    if (resolver) {
      return resolver.resolve(name, isFolder, isOpen, themeToUse);
    }
    return {
      theme: this.activeTheme,
      kind: 'codicon',
      cssClass: isFolder ? (isOpen ? 'codicon-folder-opened' : 'codicon-folder') : 'codicon-file',
      color: themeToUse === 'light' ? '#333333' : '#cccccc',
    };
  }
}
