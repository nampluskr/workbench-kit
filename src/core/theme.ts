export type ColorTheme = 'light' | 'gray' | 'dark';

export const THEME_CYCLE: ColorTheme[] = ['light', 'gray', 'dark'];

export class ThemeManager {
  private currentTheme: ColorTheme = 'dark';
  private onThemeChangeCallbacks: ((theme: ColorTheme) => void)[] = [];

  constructor(initialTheme: ColorTheme = 'dark') {
    this.setTheme(initialTheme);
  }

  public getTheme(): ColorTheme {
    return this.currentTheme;
  }

  public setTheme(theme: ColorTheme): void {
    this.currentTheme = theme;
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
      if (document.body) {
        document.body.dataset.theme = theme;
      }
    }
    this.onThemeChangeCallbacks.forEach((cb) => cb(theme));
  }

  public cycleTheme(): ColorTheme {
    const nextIndex = (THEME_CYCLE.indexOf(this.currentTheme) + 1) % THEME_CYCLE.length;
    const nextTheme = THEME_CYCLE[nextIndex];
    this.setTheme(nextTheme);
    return nextTheme;
  }

  public onThemeChange(cb: (theme: ColorTheme) => void): () => void {
    this.onThemeChangeCallbacks.push(cb);
    return () => {
      this.onThemeChangeCallbacks = this.onThemeChangeCallbacks.filter((c) => c !== cb);
    };
  }
}
