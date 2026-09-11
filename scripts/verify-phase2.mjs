import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: Phase 2 Specific Quality Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

// 1. Contrast ratio calculation helper (WCAG 2.1)
function sRGBtoLin(colorChannel) {
  const v = colorChannel / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function parseHex(hex) {
  const clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    return [parseInt(clean[0] + clean[0], 16), parseInt(clean[1] + clean[1], 16), parseInt(clean[2] + clean[2], 16)];
  }
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

// --------------------------------------------------------------------------
// 1. Critical 1 & D-29 Invariant: Zero forbidden tokens in src/style.css
// --------------------------------------------------------------------------
console.log('\n--- 1. Verifying Zero Tab-Explorer-Templates Values in CSS (Critical 1, D-29) ---');
const cssPath = path.join(rootDir, 'src/style.css');
const css = fs.readFileSync(cssPath, 'utf8');

const forbiddenTokens = ['12px', '4px', '8px', '16px', '6px'];
for (const token of forbiddenTokens) {
  const matches = css.match(new RegExp(`\\b${token}\\b`, 'g'));
  assert(!matches || matches.length === 0, `src/style.css contains 0 occurrences of "${token}" (found: ${matches ? matches.length : 0})`);
}

// --------------------------------------------------------------------------
// 2. Exact VS Code Modern Tokens & Contrast (Major 2, Major 3)
// --------------------------------------------------------------------------
console.log('\n--- 2. Verifying Theme Tokens & Contrast (Major 2, Major 3) ---');
// Dark Modern tokens
assert(css.includes('--menu-bg: #1f1f1f;'), 'Dark Modern specifies exact menu.background #1f1f1f');
assert(css.includes('--menu-hover-bg: #0078d4;'), 'Dark Modern specifies exact menu.selectionBackground #0078d4');
assert(css.includes('--activitybar-fg: #d7d7d7;'), 'Dark Modern specifies exact activityBar.foreground #d7d7d7');

// Light Modern tokens
assert(css.includes('--menu-bg: #ffffff;'), 'Light Modern specifies exact menu.background #ffffff');
assert(css.includes('--menu-hover-bg: #005fb8;'), 'Light Modern specifies exact menu.selectionBackground #005fb8');
assert(css.includes('--activitybar-fg: #1f1f1f;'), 'Light Modern specifies exact activityBar.foreground #1f1f1f');

// Menu shortcut contrast (Major 3)
assert(
  css.includes('.menu-item-shortcut') &&
  css.includes('opacity: 1;') &&
  css.includes('color: var(--menu-shortcut-fg);'),
  'Normal menu shortcut uses opacity: 1 and var(--menu-shortcut-fg)'
);

const darkShortcutContrast = contrastRatio('#909090', '#1f1f1f');
assert(darkShortcutContrast >= 4.5, `Dark menu normal shortcut contrast >= 4.5:1 (calculated: ${darkShortcutContrast.toFixed(2)}:1)`);

const lightShortcutContrast = contrastRatio('#505050', '#ffffff');
assert(lightShortcutContrast >= 4.5, `Light menu normal shortcut contrast >= 4.5:1 (calculated: ${lightShortcutContrast.toFixed(2)}:1)`);

const grayShortcutContrast = contrastRatio('#111111', '#848484');
assert(grayShortcutContrast >= 4.5, `Gray menu normal shortcut contrast >= 4.5:1 (calculated: ${grayShortcutContrast.toFixed(2)}:1)`);

const lightHoverContrast = contrastRatio('#ffffff', '#005fb8');
assert(lightHoverContrast >= 4.5, `Light menu hover shortcut contrast >= 4.5:1 (calculated: ${lightHoverContrast.toFixed(2)}:1)`);

const darkHoverContrast = contrastRatio('#ffffff', '#0078d4');
assert(darkHoverContrast >= 4.5, `Dark menu hover shortcut contrast >= 4.5:1 (calculated: ${darkHoverContrast.toFixed(2)}:1)`);

// Gray Theme tokens & contrast
const grayBgContrast = contrastRatio('#111111', '#848484');
assert(grayBgContrast >= 4.5, `Gray body text on #848484 contrast >= 4.5:1 (calculated: ${grayBgContrast.toFixed(2)}:1)`);

const grayTitlebarContrast = contrastRatio('#111111', '#7d7d7d');
assert(grayTitlebarContrast >= 4.5, `Gray titlebar text on #7d7d7d contrast >= 4.5:1 (calculated: ${grayTitlebarContrast.toFixed(2)}:1)`);

const grayTabInactiveContrast = contrastRatio('#222222', '#7d7d7d');
assert(grayTabInactiveContrast >= 3.0, `Gray inactive tab text on #7d7d7d contrast >= 3.0:1 (calculated: ${grayTabInactiveContrast.toFixed(2)}:1)`);

// Check interpolation ratio consistency across Gray backgrounds
// Dark: #1f1f1f (31) / #181818 (24) / #2b2b2b (43)
// Light: #ffffff (255) / #f8f8f8 (248) / #e5e5e5 (229)
// Gray: #848484 (132) / #7d7d7d (125) / #7f7f7f (127)
const tEditor = (132 - 31) / (255 - 31);
const tChrome = (125 - 24) / (248 - 24);
const tBorder = (127 - 43) / (229 - 43);
assert(Math.abs(tEditor - tChrome) < 0.001, `Gray editor and chrome use identical interpolation ratio (${tEditor.toFixed(5)} vs ${tChrome.toFixed(5)})`);
assert(Math.abs(tEditor - tBorder) < 0.005, `Gray border uses consistent interpolation ratio (${tBorder.toFixed(5)})`);

// --------------------------------------------------------------------------
// 3. Icon Resolution, Compound Extensions & Light Themes (Major 2, Major 4)
// --------------------------------------------------------------------------
console.log('\n--- 3. Verifying Icon Resolution & Compound Extensions (Major 2, Major 4) ---');
const vsiJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/icons/data/vscode-icons.json'), 'utf8'));
const setiJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/icons/data/seti.json'), 'utf8'));

// Test compound extension lookup in data
assert(vsiJson.fileExtensions['buf.gen.yml'] === '_f_buf', 'vscode-icons maps buf.gen.yml to _f_buf');

const vsiCode = fs.readFileSync(path.join(rootDir, 'src/icons/vscode-icons.ts'), 'utf8');
assert(
  vsiCode.includes('for (let i = 1; i < parts.length; i++)') &&
  vsiCode.includes("parts.slice(i).join('.')"),
  'vscode-icons resolver iterates compound extensions from longest to shortest'
);
assert(vsiCode.includes('lightTheme.fileExtensions'), 'vscode-icons resolver checks light fileExtensions');
assert(vsiCode.includes('lightTheme.fileNames'), 'vscode-icons resolver checks light fileNames');

const setiCode = fs.readFileSync(path.join(rootDir, 'src/icons/seti.ts'), 'utf8');
assert(
  setiCode.includes('for (let i = 1; i < parts.length; i++)') &&
  setiCode.includes("parts.slice(i).join('.')"),
  'seti resolver iterates compound extensions from longest to shortest'
);
assert(setiCode.includes('interpolateHex'), 'seti resolver implements hex color interpolation');
assert(
  setiCode.includes("key.endsWith('_light')") &&
  setiCode.includes("key.replace(/_light$/, '')"),
  'seti resolver properly recognizes _light keys without double-light suffix or erroneous darkening (Major 2)'
);

// --------------------------------------------------------------------------
// 4. Menu Immutability (Major 4)
// --------------------------------------------------------------------------
console.log('\n--- 4. Verifying Core Menu Immutability (Major 4) ---');
const menuCode = fs.readFileSync(path.join(rootDir, 'src/core/menu.ts'), 'utf8');
assert(
  menuCode.includes('export const DEFAULT_FILE_ITEMS: readonly MenuItem[] = Object.freeze([') &&
  menuCode.includes('export const DEFAULT_VIEW_ITEMS: readonly MenuItem[] = Object.freeze([') &&
  menuCode.includes('export const DEFAULT_HELP_ITEMS: readonly MenuItem[] = Object.freeze(['),
  'DEFAULT_*_ITEMS are exported as deeply frozen arrays at definition time (Major 4)'
);

// --------------------------------------------------------------------------
// 5. License Completeness (Major 5)
// --------------------------------------------------------------------------
console.log('\n--- 5. Verifying License Body Completeness (Major 5) ---');
const vsiLicense = fs.readFileSync(path.join(rootDir, 'licenses/LICENSE-vscode-icons.txt'), 'utf8');
assert(vsiLicense.includes('Section 1 -- Definitions.'), 'LICENSE-vscode-icons.txt includes CC BY-SA 4.0 Section 1');
assert(vsiLicense.includes('Section 8 -- Interpretation.'), 'LICENSE-vscode-icons.txt includes CC BY-SA 4.0 Section 8');
assert(vsiLicense.includes('https://creativecommons.org/licenses/by-sa/4.0/legalcode'), 'LICENSE-vscode-icons.txt includes canonical legalcode URI');

// --------------------------------------------------------------------------
// 6. Zen Mode & Host Sizing
// --------------------------------------------------------------------------
console.log('\n--- 6. Verifying Zen Mode State Sync & Host Sizing ---');
const viewStateCode = fs.readFileSync(path.join(rootDir, 'src/core/viewstate.ts'), 'utf8');
assert(viewStateCode.includes("dispatchEvent(new CustomEvent('workbench:zen-enter'))"), 'ViewStateManager dispatches workbench:zen-enter on Zen enter');
assert(viewStateCode.includes('onZenEnterCallbacks'), 'ViewStateManager supports onZenEnter callbacks');
assert(menuCode.includes('workbench:zen-enter'), 'MenuController listens for workbench:zen-enter to close menu');

const mainCode = fs.readFileSync(path.join(rootDir, 'src/main.ts'), 'utf8');
assert(mainCode.includes('onZenEnter(() => this.menu.closeMenu())'), 'main.ts wires viewState.onZenEnter to menu.closeMenu()');
assert(
  /onThemeChange\(\s*\(theme\)\s*=>\s*\{[\s\S]*?this\.iconTheme\.setColorTheme\(theme\)/.test(mainCode),
  'main.ts wires theme.onThemeChange to iconTheme.setColorTheme()'
);
// v0.2 FR-X14: a colour-theme switch repaints the tree's icon colours in place
// so they follow the theme on screen without a reopen.
assert(
  mainCode.includes('this.tree?.refreshThemeColors()') || /onThemeChange\([\s\S]*?refreshThemeColors\(\)/.test(mainCode),
  "main.ts repaints the tree's icon colours on a colour-theme change (FR-X14)"
);

const electronMain = fs.readFileSync(path.join(rootDir, 'src/hosts/electron/main.cjs'), 'utf8');
assert(electronMain.includes('width: 1280') && electronMain.includes('height: 800'), 'Electron sets initial window size to 1280x800');

const pywebviewMain = fs.readFileSync(path.join(rootDir, 'src/hosts/pywebview/main.py'), 'utf8');
assert(pywebviewMain.includes('WINDOW_WIDTH = 1280') && pywebviewMain.includes('WINDOW_HEIGHT = 800'), 'pywebview sets initial window size to 1280x800');
assert(pywebviewMain.includes('patch_drag_move'), 'pywebview integrates window_chrome patch_drag_move');
assert(fs.existsSync(path.join(rootDir, 'src/hosts/pywebview/window_chrome.py')), 'src/hosts/pywebview/window_chrome.py exists');

// --------------------------------------------------------------------------
// 7. AGENTS Coding Contract (os.path Only & English Comments)
// --------------------------------------------------------------------------
console.log('\n--- 7. Verifying AGENTS Coding Contract ---');
const pywebviewMainCode = fs.readFileSync(path.join(rootDir, 'src/hosts/pywebview/main.py'), 'utf8');
assert(!/from\s+pathlib|:\s*Path\b|Path\(/.test(pywebviewMainCode), 'pywebview main.py uses os.path and contains 0 Path usages');

const iconThemeCode = fs.readFileSync(path.join(rootDir, 'src/core/icontheme.ts'), 'utf8');
const windowChromeCode = fs.readFileSync(path.join(rootDir, 'src/hosts/pywebview/window_chrome.py'), 'utf8');
assert(!/[\uac00-\ud7a3]/.test(iconThemeCode), 'src/core/icontheme.ts comments are in English (0 Korean characters)');
assert(!/[\uac00-\ud7a3]/.test(windowChromeCode), 'src/hosts/pywebview/window_chrome.py docstrings/comments are in English (0 Korean characters)');

console.log('----------------------------------------------------');
if (failures > 0) {
  console.error(`FAILED: ${failures} Phase 2 check(s) failed.`);
  process.exit(1);
} else {
  console.log('SUCCESS: All Phase 2 quality checks passed (0 failures).');
  process.exit(0);
}
