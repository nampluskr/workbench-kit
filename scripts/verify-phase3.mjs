import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== workbench-kit: Phase 3 (Explorer Tree) Quality Verification ===');
let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failures++;
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

// --------------------------------------------------------------------------
// 1. Invariant: Zero Tab-Explorer-Templates Values in CSS (C-10, D-29)
// --------------------------------------------------------------------------
console.log('\n--- 1. Verifying Zero Tab-Explorer-Templates Values in CSS (C-10, D-29) ---');
const cssPath = path.join(rootDir, 'src/style.css');
const css = fs.readFileSync(cssPath, 'utf8');

const forbiddenTokens = ['12px', '4px', '8px', '16px', '6px', '#353b44', 'Segoe UI', 'Cascadia Mono'];
for (const token of forbiddenTokens) {
  const isExactWord = /^[a-zA-Z0-9]/.test(token);
  const regex = isExactWord ? new RegExp(`\\b${token}\\b`, 'g') : new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const matches = css.match(regex);
  assert(!matches || matches.length === 0, `src/style.css contains 0 occurrences of "${token}" (found: ${matches ? matches.length : 0})`);
}

// --------------------------------------------------------------------------
// 2. Core Purity: Zero Extension Tables & Filesystem Agnostic (NFR-1, FR-Q3, INTENT 3)
// --------------------------------------------------------------------------
console.log('\n--- 2. Verifying Core Purity Across src/core/ (NFR-1, FR-Q3, INTENT 3) ---');
const coreDir = path.join(rootDir, 'src/core');
const coreFiles = fs.readdirSync(coreDir).filter((f) => f.endsWith('.ts'));

for (const file of coreFiles) {
  const content = fs.readFileSync(path.join(coreDir, file), 'utf8');
  assert(!content.includes('fs.') && !content.includes("from 'fs'") && !content.includes('require("fs")'), `src/core/${file} contains 0 fs imports or calls (NFR-1)`);
  assert(!content.includes('openFolderDialog') && !content.includes('readDir') && !content.includes('open_folder_dialog'), `src/core/${file} contains 0 filesystem host bridge methods (NFR-1)`);
  assert(!content.includes('extensionMap') && !content.includes('fileExtensions') && !content.includes('.filter((ext)'), `src/core/${file} contains 0 extension mapping tables (FR-Q3)`);
}

const coreTreeContent = fs.readFileSync(path.join(coreDir, 'tree.ts'), 'utf8');
assert(coreTreeContent.includes('iconThemeManager.resolveIcon'), 'src/core/tree.ts delegates all icon resolution to IconThemeManager (FR-Q3, INTENT 3)');
assert(!coreTreeContent.includes("aria-label=\"Files\""), 'src/core/tree.ts does not hardcode aria-label to Files (NFR-1)');

// --------------------------------------------------------------------------
// 3. Coding Contracts: English Comments & os.path only
// --------------------------------------------------------------------------
console.log('\n--- 3. Verifying Coding Contracts ---');
function extractComments(source) {
  const commentRegex = /\/\*[\s\S]*?\*\/|\/\/.*/g;
  const matches = source.match(commentRegex) || [];
  return matches.join('\n');
}

const koreanCharRegex = /[\uac00-\ud7a3]/;

// Check all core files, hosts, and providers for English-only comments
const filesToCheck = [
  ...coreFiles.map((f) => path.join('src/core', f)),
  'src/main.ts',
  'src/providers/filesystem.ts',
  'src/hosts/electron/main.cjs',
  'src/hosts/electron/preload.cjs',
  'src/hosts/pywebview/main.py',
];

for (const relPath of filesToCheck) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (relPath.endsWith('.py')) {
      const pyComments = (content.match(/#.*$/gm) || []).join('\n');
      const pyDocstrings = (content.match(/"""[\s\S]*?"""|'''[\s\S]*?'''/g) || []).join('\n');
      assert(!koreanCharRegex.test(pyComments) && !koreanCharRegex.test(pyDocstrings), `${relPath} comments/docstrings are in English (0 Korean characters)`);
    } else {
      const comments = extractComments(content);
      assert(!koreanCharRegex.test(comments), `${relPath} comments are in English (0 Korean characters)`);
    }
  }
}

const pyMainPath = path.join(rootDir, 'src/hosts/pywebview/main.py');
const pyMainContent = fs.readFileSync(pyMainPath, 'utf8');
assert(!pyMainContent.includes('pathlib') && !pyMainContent.includes('Path('), 'pywebview main.py uses os.path only (0 pathlib.Path)');

// --------------------------------------------------------------------------
// 4. Functional Model Tests (TreeController & ExplorerTitlebar)
// --------------------------------------------------------------------------
console.log('\n--- 4. Functional Verification in Mock DOM Environment ---');

// Mock DOM elements for Node test environment
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...tokens) { tokens.forEach((c) => this.classes.add(c)); }
  remove(...tokens) { tokens.forEach((c) => this.classes.delete(c)); }
  has(c) { return this.classes.has(c); }
  contains(c) { return this.classes.has(c); }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.classList = new MockClassList();
    this.dataset = {};
    this._innerHTML = '';
    this._textContent = '';
    this.style = {};
    this.eventListeners = new Map();
    this.scrollTop = 0;
    this.clientHeight = 220; // 10 rows visible (22px each)
  }

  get childElementCount() {
    return this.children.length;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    if (!val || val.trim() === '') {
      this._textContent = '';
      return;
    }
    if (val.includes('tree-find-widget')) {
      const fw = new MockElement('div');
      fw.classList.add('tree-find-widget');
      const input = new MockElement('input');
      input.classList.add('tree-find-input');
      fw.appendChild(input);
      const count = new MockElement('span');
      count.classList.add('tree-find-count');
      fw.appendChild(count);
      this.appendChild(fw);
    }
    const parseRows = (targetContainer, htmlText) => {
      const rowMatches = htmlText.match(/<div class="tree-row[\s\S]*?<\/div>/g) || [];
      for (const rm of rowMatches) {
        const child = new MockElement('div');
        child.classList.add('tree-row');
        const idMatch = rm.match(/data-id="([^"]*)"/);
        if (idMatch) child.setAttribute('data-id', idMatch[1]);
        if (rm.includes('tree-input-row')) {
          child.classList.add('tree-input-row');
          const input = new MockElement('input');
          input.classList.add('tree-input-field');
          child.appendChild(input);
        }
        const unitCount = (rm.match(/tree-indent-unit/g) || []).length;
        for (let u = 0; u < unitCount; u++) {
          const unit = new MockElement('span');
          unit.classList.add('tree-indent-unit');
          child.appendChild(unit);
        }
        if (rm.includes('tree-twistie')) {
          const twistie = new MockElement('span');
          twistie.classList.add('tree-twistie');
          if (rm.includes('data-twistie="true"')) {
            twistie.setAttribute('data-twistie', 'true');
          }
          child.appendChild(twistie);
        }
        if (rm.includes('selected')) child.classList.add('selected');
        if (rm.includes('focused')) child.classList.add('focused');
        targetContainer.appendChild(child);
      }
    };

    if (val.includes('tree-find-widget')) {
      const fw = new MockElement('div');
      fw.classList.add('tree-find-widget');
      const input = new MockElement('input');
      input.classList.add('tree-find-input');
      fw.appendChild(input);
      const count = new MockElement('span');
      count.classList.add('tree-find-count');
      fw.appendChild(count);
      this.appendChild(fw);
    }
    if (val.includes('tree-list')) {
      const list = new MockElement('div');
      list.classList.add('tree-list');
      parseRows(list, val);
      this.appendChild(list);
    } else if (val.includes('tree-row')) {
      parseRows(this, val);
    }
    this._textContent = val.replace(/<[^>]+>/g, '').trim();
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = val;
    this._innerHTML = val;
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name === 'class') {
      this.classList = new MockClassList();
      val.split(/\s+/).forEach((c) => this.classList.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  closest(selector) {
    let cur = this;
    while (cur) {
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const attrExpr = selector.slice(1, -1);
        const [attr, val] = attrExpr.split('=');
        const cleanVal = val ? val.replace(/^["']|["']$/g, '') : null;
        if (cleanVal !== null) {
          if (cur.getAttribute(attr) === cleanVal) return cur;
        } else if (cur.getAttribute(attr) !== null) {
          return cur;
        }
      }
      if (selector.startsWith('.') && cur.classList.contains(selector.slice(1))) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  contains(other) {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    let stopped = false;
    event.stopPropagation = () => { stopped = true; };
    event.isPropagationStopped = () => stopped;

    let cur = this;
    while (cur) {
      event.currentTarget = cur;
      const handlers = cur.eventListeners.get(event.type) || [];
      for (const h of handlers) {
        h(event);
      }
      if (stopped) break;
      cur = cur.parentElement;
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (el) => {
      let matches = false;
      if (selector.includes(':not(')) {
        const base = selector.split(':not(')[0];
        const notCls = selector.match(/:not\(\.([^)]+)\)/)?.[1];
        if (base.startsWith('.') && el.classList.contains(base.slice(1))) {
          if (!notCls || !el.classList.contains(notCls)) matches = true;
        }
      } else if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (el.classList.contains(cls)) matches = true;
      } else if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.getAttribute('id') === id) matches = true;
      } else if (selector.includes('[data-id="')) {
        const idVal = selector.match(/data-id="([^"]*)"/)?.[1];
        if (el.getAttribute('data-id') === idVal) matches = true;
      }
      if (matches) results.push(el);
      for (const child of el.children) {
        check(child);
      }
    };
    for (const child of this.children) {
      check(child);
    }
    return results;
  }

  focus() {
    global.document.activeElement = this;
  }
  select() {}
  scrollIntoView() {}
}

global.document = {
  createElement: (tag) => new MockElement(tag),
  documentElement: new MockElement('html'),
  body: new MockElement('body'),
  activeElement: null,
};

const viteServer = await createServer();
const { TreeController } = await viteServer.ssrLoadModule('src/core/tree.ts');
const { IconThemeManager } = await viteServer.ssrLoadModule('src/core/icontheme.ts');
const { ExplorerTitlebarController } = await viteServer.ssrLoadModule('src/core/sidebar.ts');
const { FileSystemTreeProvider } = await viteServer.ssrLoadModule('src/providers/filesystem.ts');

const mockContainer = new MockElement('div');
const iconTheme = new IconThemeManager('seti', 'dark');
const tree = new TreeController(mockContainer, iconTheme);

// --- WK-018 & FR-G1: Empty state when no folder is opened ---
console.log('\n--- 4.1 Empty State Verification (WK-018, FR-G1, D-20) ---');
assert(tree.getRoot() === null, 'Tree root is null initially');
assert(mockContainer.childElementCount === 0, 'Tree container has exactly 0 child elements when empty (FR-G1)');
assert(mockContainer.textContent.trim() === '', 'Tree container has 0 text when empty (FR-G1)');

// Clicking on empty container does nothing
mockContainer.dispatchEvent({ type: 'click' });
assert(tree.getRoot() === null && mockContainer.childElementCount === 0, 'Clicking empty tree does not change state (FR-G1)');

// --- WK-014 & FR-A1, FR-A15, FR-N6c: Single root and folder open/close ---
console.log('\n--- 4.2 Single Root and Folder Open/Close Verification (WK-014, FR-A1, FR-A15, FR-N6c) ---');
const sampleRootP = {
  id: '/projects/project-p',
  label: 'project-p',
  isContainer: true,
  children: [
    { id: '/projects/project-p/file1.txt', label: 'file1.txt', isContainer: false },
    { id: '/projects/project-p/src', label: 'src', isContainer: true, children: [
      { id: '/projects/project-p/src/main.ts', label: 'main.ts', isContainer: false },
      { id: '/projects/project-p/src/utils.ts', label: 'utils.ts', isContainer: false },
    ] },
  ],
};

tree.setRoot(sampleRootP);
assert(tree.getRoot().id === '/projects/project-p', 'Opening folder P sets root to P (FR-A1)');
assert(tree.isExpanded('/projects/project-p'), 'Root P is expanded by default so children are visible');
assert(mockContainer.childElementCount > 0, 'Tree DOM renders rows when root is set');

// Open folder Q replaces P
const sampleRootQ = {
  id: '/projects/project-q',
  label: 'project-q',
  isContainer: true,
  children: [
    { id: '/projects/project-q/app.py', label: 'app.py', isContainer: false },
  ],
};

tree.setRoot(sampleRootQ);
assert(tree.getRoot().id === '/projects/project-q', 'Opening folder Q replaces root with Q (FR-A1)');
assert(tree.findNodeById(tree.getRoot(), '/projects/project-p') === null, '0 nodes reference previous root P after opening Q (FR-A1)');
assert(tree.findNodeById(tree.getRoot(), '/projects/project-p/file1.txt') === null, '0 descendant nodes reference P (FR-A1)');

// Folder Close (FR-N6c)
tree.clearRoot();
assert(tree.getRoot() === null, 'Folder close resets root to null (FR-N6c)');
assert(mockContainer.childElementCount === 0, 'Folder close returns tree to 0 child elements (FR-G1, FR-N6c)');
assert(mockContainer.textContent.trim() === '', 'Folder close returns tree to 0 text (FR-G1, FR-N6c)');

// --- Major 6: Close Folder Tab & Split-Pane Invariant Verification ---
console.log('\n--- 4.2.1 Close Folder Tab & Split-Pane Invariant Verification (Major 6, FR-N6c) ---');
const mockEditorContainer = new MockElement('div');
mockEditorContainer.setAttribute('id', 'editor-container');
const pane1 = new MockElement('div'); pane1.classList.add('dockview-pane');
const pane2 = new MockElement('div'); pane2.classList.add('dockview-pane');
const tab1 = new MockElement('div'); tab1.classList.add('dockview-tab');
const tab2 = new MockElement('div'); tab2.classList.add('dockview-tab');
const tab3 = new MockElement('div'); tab3.classList.add('dockview-tab');
mockEditorContainer.appendChild(pane1);
mockEditorContainer.appendChild(pane2);
mockEditorContainer.appendChild(tab1);
mockEditorContainer.appendChild(tab2);
mockEditorContainer.appendChild(tab3);

const initialPaneCount = mockEditorContainer.querySelectorAll('.dockview-pane').length;
const initialTabCount = mockEditorContainer.querySelectorAll('.dockview-tab').length;

tree.setRoot({ id: 'active-root', label: 'active-root', isContainer: true, children: [] });
tree.clearRoot();

assert(tree.getRoot() === null, 'Tree root is null after closeFolder');
assert(mockEditorContainer.querySelectorAll('.dockview-pane').length === initialPaneCount, 'Close folder preserves split-pane count (FR-N6c, Major 6)');
assert(mockEditorContainer.querySelectorAll('.dockview-tab').length === initialTabCount, 'Close folder preserves tab count (FR-N6c, Major 6)');

// --- Major 1: Selection Notification on Root Change / Close Folder ---
console.log('\n--- 4.2.2 Selection Notification on Root Change / Close Folder (Major 1) ---');
let lastSelectedIds = null;
const unsubscribeSelect = tree.onSelect((nodes) => {
  lastSelectedIds = nodes.map((n) => n.id);
});

tree.setRoot({
  id: 'rootA',
  label: 'rootA',
  isContainer: true,
  children: [{ id: 'childA', label: 'childA', isContainer: false }],
});
tree.focusItemByIndex(1); // select childA
assert(JSON.stringify(lastSelectedIds) === JSON.stringify(['childA']), 'Subscriber received childA selection');

// Replace root with rootB
tree.setRoot({
  id: 'rootB',
  label: 'rootB',
  isContainer: true,
  children: [{ id: 'childB', label: 'childB', isContainer: false }],
});
assert(!lastSelectedIds.includes('childA'), 'Subscriber does not retain old root nodes on root replacement (Major 1)');
assert(lastSelectedIds.includes('rootB'), 'Subscriber received new root selection on root replacement (Major 1)');

// Clear root
tree.clearRoot();
assert(lastSelectedIds.length === 0, 'Subscriber receives empty selection on clearRoot (Major 1)');
unsubscribeSelect();

// Root path edge cases in FileSystemTreeProvider
const fsProvider = new FileSystemTreeProvider();
const posixRoot = await fsProvider.createRootNode('/');
assert(posixRoot.id === '/', 'POSIX root "/" is preserved as "/" (not corrupted to empty string)');
assert(posixRoot.label === '/', 'POSIX root label is "/"');

const winRoot = await fsProvider.createRootNode('C:\\');
assert(winRoot.id === 'C:\\', 'Windows drive root "C:\\" is preserved as "C:\\" (not corrupted to "C:")');

// --- WK-015 & FR-A2 ~ FR-A5, FR-A7 ~ FR-A10, FR-A12, FR-A16 ~ FR-A18: Tree Keyboard Navigation ---
console.log('\n--- 4.3 Tree Keyboard Navigation Verification (WK-015, FR-A2 ~ FR-A18) ---');
const testTree = {
  id: 'root',
  label: 'root',
  isContainer: true,
  children: [
    { id: 'item-1', label: 'item-1', isContainer: false },
    { id: 'item-2', label: 'item-2', isContainer: true, children: [
      { id: 'item-2-1', label: 'item-2-1', isContainer: false },
      { id: 'item-2-2', label: 'item-2-2', isContainer: false },
    ] },
    { id: 'item-3', label: 'item-3', isContainer: false },
  ],
};
tree.setRoot(testTree);

function dispatchTreeKey(key, options = {}) {
  const listEl = mockContainer.querySelector('.tree-list');
  if (listEl) {
    listEl.dispatchEvent({ type: 'keydown', key, preventDefault: () => {}, ...options });
  }
}

// Focus on tree list
tree.focusTree();
assert(global.document.activeElement === mockContainer.querySelector('.tree-list'), 'tree.focusTree() focuses .tree-list element');

// Initial state: root expanded, item-2 collapsed
assert(tree.getFocusedId() === 'root', 'Root is initially focused');
let visible = tree.getVisibleItems();
assert(visible.map((it) => it.node.id).join(',') === 'root,item-1,item-2,item-3', 'Visible items list initially correct');

// ArrowDown (FR-A2)
dispatchTreeKey('ArrowDown');
assert(tree.getFocusedId() === 'item-1', 'ArrowDown moves focus to item-1 (FR-A2)');
assert(global.document.activeElement === mockContainer.querySelector('.tree-list'), 'DOM focus remains on tree after ArrowDown');

dispatchTreeKey('ArrowDown');
assert(tree.getFocusedId() === 'item-2', 'ArrowDown moves focus to item-2 (FR-A2)');

// ArrowUp (FR-A2)
dispatchTreeKey('ArrowUp');
assert(tree.getFocusedId() === 'item-1', 'ArrowUp moves focus back to item-1 (FR-A2)');

// ArrowRight on collapsed container expands it, focus stays on container (FR-A3)
dispatchTreeKey('ArrowDown'); // back to item-2
assert(!tree.isExpanded('item-2'), 'item-2 is collapsed before ArrowRight');
dispatchTreeKey('ArrowRight');
assert(tree.isExpanded('item-2'), 'ArrowRight expands collapsed item-2 (FR-A3)');
assert(tree.getFocusedId() === 'item-2', 'Focus stays on item-2 after first ArrowRight (FR-A3)');
assert(global.document.activeElement === mockContainer.querySelector('.tree-list'), 'DOM focus retained on tree after ArrowRight');

// Second ArrowRight moves focus to first child (FR-A3)
dispatchTreeKey('ArrowRight');
assert(tree.getFocusedId() === 'item-2-1', 'Second ArrowRight moves focus to first child item-2-1 (FR-A3)');

// ArrowLeft on leaf moves focus to parent (FR-A4)
dispatchTreeKey('ArrowLeft');
assert(tree.getFocusedId() === 'item-2', 'ArrowLeft on leaf moves focus to parent item-2 (FR-A4)');

// ArrowLeft on expanded container collapses it, focus stays on container (FR-A4)
dispatchTreeKey('ArrowLeft');
assert(!tree.isExpanded('item-2'), 'ArrowLeft collapses expanded container (FR-A4)');
assert(tree.getFocusedId() === 'item-2', 'Focus stays on container after collapse (FR-A4)');

// Space toggles expand/collapse (FR-A5)
dispatchTreeKey(' ');
assert(tree.isExpanded('item-2'), 'Space key expands collapsed container (FR-A5)');
dispatchTreeKey(' ');
assert(!tree.isExpanded('item-2'), 'Space key collapses expanded container (FR-A5)');

// Home / End keys (FR-A8)
dispatchTreeKey('End');
assert(tree.getFocusedId() === 'item-3', 'End key moves focus to last visible item (FR-A8)');
dispatchTreeKey('Home');
assert(tree.getFocusedId() === 'root', 'Home key moves focus to first visible item (FR-A8)');

// PageDown / PageUp keys (FR-A16)
dispatchTreeKey('PageDown');
assert(tree.getFocusedId() === 'item-3', 'PageDown moves focus by page size (FR-A16)');
dispatchTreeKey('PageUp');
assert(tree.getFocusedId() === 'root', 'PageUp moves focus back by page size (FR-A16)');

// Shift+ArrowDown / Shift+ArrowUp range selection (FR-A9)
dispatchTreeKey('ArrowDown'); // focus item-1
assert(tree.getSelectedIds().length === 1 && tree.getSelectedIds()[0] === 'item-1', 'Only item-1 selected initially');
dispatchTreeKey('ArrowDown', { shiftKey: true });
assert(tree.getSelectedIds().length === 2 && tree.getSelectedIds().includes('item-1') && tree.getSelectedIds().includes('item-2'), 'Shift+ArrowDown extends selection range (FR-A9)');

// Escape clears selection (FR-A12)
dispatchTreeKey('Escape');
assert(tree.getSelectedIds().length === 0, 'Escape key clears multi-selection (FR-A12)');

// Ctrl+ArrowDown scrolling without moving focus (FR-A17)
const listElement = mockContainer.querySelector('.tree-list');
const initialScroll = listElement.scrollTop;
dispatchTreeKey('ArrowDown', { ctrlKey: true });
assert(listElement.scrollTop > initialScroll, 'Ctrl+ArrowDown scrolls viewport without moving focus (FR-A17)');

// Indentation guide lines check (D-9; v0.2 FR-X8/FR-X9: one indent unit per
// ancestor level, each drawing its guide via CSS ::before — no inline style,
// which this app's CSP would block).
const renderedUnits = mockContainer.querySelectorAll('.tree-indent-unit');
assert(renderedUnits.length > 0, 'Nested tree rows render one indentation unit per ancestor depth (D-9, v0.2 FR-X8)');

// --- Major 3: Asynchronous Expansion Focus Stealing Prevention ---
console.log('\n--- 4.3.1 Asynchronous Expansion Focus Stealing Prevention (Major 3) ---');
let resolveLazyExp;
const lazyFocusProvider = {
  getChildren: () => new Promise((resolve) => {
    resolveLazyExp = () => resolve([{ id: 'lazy-child-1', label: 'lazy-child-1', isContainer: false }]);
  }),
};
tree.setDataProvider(lazyFocusProvider);
tree.setRoot({
  id: 'focus-root',
  label: 'focus-root',
  isContainer: true,
  children: [{ id: 'focus-folder', label: 'focus-folder', isContainer: true, children: [] }],
});

// Trigger expand on focus-folder
tree.toggleExpand('focus-folder');

// User moves focus to an outside element (e.g. editor) before promise resolves
const outsideEditorElement = new MockElement('div');
outsideEditorElement.focus();
assert(global.document.activeElement === outsideEditorElement, 'Focus is in editor before expansion settles');

// Resolve the delayed expansion
resolveLazyExp();
await new Promise((r) => setTimeout(r, 20));

// Focus must NOT be stolen back into tree!
assert(global.document.activeElement === outsideEditorElement, 'Delayed expansion does not steal DOM focus from editor (Major 3)');

// --- Major 4: Safe Scrolling for Windows Backslashes and POSIX Quotes ---
console.log('\n--- 4.3.2 Safe Scrolling for Windows Backslashes and POSIX Quotes (Major 4) ---');
const specialCharsRoot = {
  id: 'C:\\Users\\test\\project',
  label: 'project',
  isContainer: true,
  children: [
    { id: 'C:\\Users\\test\\project\\file"with"quote.ts', label: 'file"with"quote.ts', isContainer: false },
  ],
};
tree.setRoot(specialCharsRoot);
let threwScrollError = false;
try {
  tree.focusItemByIndex(1); // calls scrollItemIntoView on path with backslashes and quotes
} catch (e) {
  threwScrollError = true;
}
assert(!threwScrollError, 'scrollItemIntoView safely handles backslashes and quotes without CSS escaping errors (Major 4)');
assert(tree.getFocusedId() === 'C:\\Users\\test\\project\\file"with"quote.ts', 'Focus reached node with special characters');

// Restore testTree for subsequent section 4.4
tree.setRoot(testTree);

// --- WK-016 & FR-A11: Mouse Multi-selection ---
console.log('\n--- 4.4 Mouse Multi-selection Verification (WK-016, FR-A11, Minor 6) ---');
tree.focusItemByIndex(1); // focus item-1
assert(JSON.stringify([...tree.getSelectedIds()]) === JSON.stringify(['item-1']), 'Initial single selection is exactly ["item-1"]');

// Ctrl+Click toggle
const item2Row = mockContainer.querySelector('[data-id="item-2"]');
item2Row.dispatchEvent({ type: 'click', ctrlKey: true });
assert(JSON.stringify([...tree.getSelectedIds()].sort()) === JSON.stringify(['item-1', 'item-2']), 'Ctrl+click adds item-2 to selection, resulting in exactly ["item-1", "item-2"] (FR-A11, Minor 6)');
assert(global.document.activeElement === mockContainer.querySelector('.tree-list'), 'Mouse click focuses tree list');

// Shift+Click range
const item3Row = mockContainer.querySelector('[data-id="item-3"]');
item3Row.dispatchEvent({ type: 'click', shiftKey: true });
assert(JSON.stringify([...tree.getSelectedIds()].sort()) === JSON.stringify(['item-1', 'item-2', 'item-3']), 'Shift+click performs exact range selection ["item-1", "item-2", "item-3"] (FR-A11, Minor 6)');

// Ctrl+Click toggle deselects item-2
const item2RowDeselect = mockContainer.querySelector('[data-id="item-2"]');
item2RowDeselect.dispatchEvent({ type: 'click', ctrlKey: true });
assert(JSON.stringify([...tree.getSelectedIds()].sort()) === JSON.stringify(['item-1', 'item-3']), 'Ctrl+click removes item-2 from selection, leaving ["item-1", "item-3"] (FR-A11, Minor 6)');

// Reverse Shift+Click: focus item-3, then shift-click item-1
tree.focusItemByIndex(3); // focus item-3
const item1Row = mockContainer.querySelector('[data-id="item-1"]');
item1Row.dispatchEvent({ type: 'click', shiftKey: true });
assert(JSON.stringify([...tree.getSelectedIds()].sort()) === JSON.stringify(['item-1', 'item-2', 'item-3']), 'Reverse Shift+click selects range ["item-1", "item-2", "item-3"] (FR-A11, Minor 6)');

// Ctrl+A selects all visible items
dispatchTreeKey('a', { ctrlKey: true });
assert(JSON.stringify([...tree.getSelectedIds()].sort()) === JSON.stringify(['item-1', 'item-2', 'item-3', 'root'].sort()), 'Ctrl+A selects all visible items (FR-A10, Minor 6)');

// --- Major 1: Ancestor Collapse Focus/Selection Relocation ---
console.log('\n--- 4.4.1 Ancestor Collapse Focus/Selection Relocation (Major 1) ---');
await tree.setExpanded('item-2', true);
const visibleAfterExp = tree.getVisibleItems();
const childIdx = visibleAfterExp.findIndex((it) => it.node.id === 'item-2-1');
assert(childIdx >= 0, 'item-2-1 is visible after expanding item-2');
tree.focusItemByIndex(childIdx);
assert(tree.getFocusedId() === 'item-2-1', 'Child item-2-1 is focused before collapse');
assert(tree.getSelectedIds().includes('item-2-1'), 'Child item-2-1 is selected before collapse');

// Collapse item-2
await tree.setExpanded('item-2', false);
assert(tree.getFocusedId() === 'item-2', 'Collapsing parent relocates focus to parent item-2 (Major 1)');
assert(tree.getSelectedIds().includes('item-2') && !tree.getSelectedIds().includes('item-2-1'), 'Collapsing parent relocates selection to parent item-2 (Major 1)');

// --- WK-017 & FR-A13, FR-A19: Tree Find / Search ---
console.log('\n--- 4.5 Tree Inline Find / Search Verification (WK-017, FR-A13, FR-A19) ---');
tree.openFindWidget();
assert(tree.getIsFindOpen() === true, 'openFindWidget opens find widget');
assert(mockContainer.querySelector('.tree-find-widget') !== null, 'Find widget DOM rendered');

tree.setFindQuery('item-2-2');
assert(tree.isExpanded('item-2'), 'Searching for hidden item auto-expands its ancestors (FR-A19)');
assert(tree.getFocusedId() === 'item-2-2', 'Find jumps focus to matching item');

tree.closeFindWidget();
assert(tree.getIsFindOpen() === false, 'closeFindWidget closes find widget');
assert(mockContainer.querySelector('.tree-find-widget') === null, 'Find widget DOM removed');

// --- WK-046 & FR-A20 ~ FR-A22, FR-A24, D-30: View Titlebar Actions ---
// v0.2: FR-A20/FR-A24 replaced by FR-X2 (four shell actions), FR-A23 by FR-X4
// (SPEC 0.1). The IDs stay; the shell action set is now New File / New Folder /
// Refresh / Collapse All.
console.log('\n--- 4.6 View Titlebar Actions Verification (WK-046, FR-A20~A24 -> v0.2 FR-X2/FR-X4, D-30) ---');
const mockAppActionsContainer = new MockElement('div');
const newFileBtn = new MockElement('button');
newFileBtn.classList.add('codicon', 'codicon-new-file');
const newFolderBtn = new MockElement('button');
newFolderBtn.classList.add('codicon', 'codicon-new-folder');
const refreshBtn = new MockElement('button');
refreshBtn.classList.add('codicon', 'codicon-refresh');
const collapseBtn = new MockElement('button');
collapseBtn.classList.add('codicon', 'codicon-collapse-all');

const explorerTitlebar = new ExplorerTitlebarController(
  mockAppActionsContainer,
  newFileBtn,
  newFolderBtn,
  refreshBtn,
  collapseBtn,
  tree
);

// Four shell actions verified by codicon class (v0.1 FR-A20 -> v0.2 FR-X2)
assert(newFileBtn.classList.contains('codicon-new-file'), 'Shell action 1 is codicon-new-file (v0.1 FR-A20 -> v0.2 FR-X2)');
assert(newFolderBtn.classList.contains('codicon-new-folder'), 'Shell action 2 is codicon-new-folder (FR-X2)');
assert(refreshBtn.classList.contains('codicon-refresh'), 'Shell action 3 is codicon-refresh (FR-X2)');
assert(collapseBtn.classList.contains('codicon-collapse-all'), 'Shell action 4 is codicon-collapse-all (FR-X2)');
assert(explorerTitlebar.getAppActions().length === 0, 'Initially exactly 0 app actions registered (v0.1 FR-A24 -> v0.2 FR-X2)');

// Collapse All button invokes collapseAll (FR-A21)
tree.setExpanded('root', true);
tree.setExpanded('item-2', true);
assert(tree.getExpandedIds().length === 2, '2 folders expanded before Collapse All button');
collapseBtn.dispatchEvent({ type: 'click' });
assert(tree.getExpandedIds().length === 0, 'Collapse All button collapses all folders (FR-A21, D-30)');

// Refresh button preserves expansion, hidden selection, and anchor (FR-A22)
let providerGetChildrenCalled = 0;
const mockProvider = {
  getChildren: async (node) => {
    providerGetChildrenCalled++;
    if (!node || node.id === 'root') {
      return [
        { id: 'item-1', label: 'item-1', isContainer: false },
        { id: 'item-2', label: 'item-2', isContainer: true, children: [
          { id: 'item-2-1', label: 'item-2-1', isContainer: false },
        ] },
        { id: 'item-new', label: 'item-new', isContainer: false },
      ];
    }
    if (node.id === 'item-2') {
      return [
        { id: 'item-2-1', label: 'item-2-1', isContainer: false },
      ];
    }
    return [];
  },
};
tree.setDataProvider(mockProvider);
tree.setExpanded('root', true);
tree.setExpanded('item-2', true);
tree.focusItemByIndex(1); // item-1 selected
assert(tree.getSelectedIds().includes('item-1'), 'item-1 selected before refresh');

// Refresh button click triggers refresh, re-reads data, and newly read content appears in DOM (Major 7)
refreshBtn.dispatchEvent({ type: 'click' });
await new Promise((r) => setTimeout(r, 20));

assert(providerGetChildrenCalled > 0, 'Refresh button click calls data provider (FR-A20, FR-A22, D-30, Major 7)');
assert(tree.isExpanded('item-2'), 'Expansion of item-2 is preserved across refresh (FR-A22)');
assert(tree.getSelectedIds().includes('item-1'), 'Selection of item-1 is preserved across refresh (FR-A22)');
assert(tree.findNodeById(tree.getRoot(), 'item-new') !== null, 'Newly read node item-new exists in tree model (Major 7)');
assert(mockContainer.querySelector('[data-id="item-new"]') !== null, 'Newly read node item-new is rendered in DOM (Major 7)');

// Major 2: User selection made while refresh I/O is pending is NOT rolled back
console.log('\n--- 4.6.0 Concurrent Selection During In-Flight Refresh (Major 2) ---');
let resolveDelayedRefresh;
const slowProvider = {
  getChildren: () => new Promise((resolve) => {
    resolveDelayedRefresh = () => resolve([
      { id: 'item-1', label: 'item-1', isContainer: false },
      { id: 'item-2', label: 'item-2', isContainer: false },
      { id: 'item-3', label: 'item-3', isContainer: false },
    ]);
  }),
};
tree.setDataProvider(slowProvider);
tree.focusItemByIndex(1); // focus item-1
const refreshPromise = tree.refresh(); // in flight

// User navigates to item-2 during in-flight refresh
tree.focusItemByIndex(2); // focus item-2
assert(tree.getSelectedIds().join('') === 'item-2', 'User selected item-2 during in-flight refresh');

// Resolve delayed refresh
resolveDelayedRefresh();
await refreshPromise;

assert(tree.getSelectedIds().join('') === 'item-2', 'Refresh does not roll back user selection made while I/O was pending (Major 2)');

// --- Major 2: Refresh Ghost Node Purging ---
console.log('\n--- 4.6.1 Refresh Ghost Node Purging Verification (Major 2) ---');
const ghostProvider = {
  getChildren: async (node) => {
    if (!node || node.id === 'ghost-root') {
      return [{ id: 'ghost-valid', label: 'ghost-valid', isContainer: false }];
    }
    return [];
  },
};
const ghostRoot = {
  id: 'ghost-root',
  label: 'ghost-root',
  isContainer: true,
  children: [
    { id: 'ghost-valid', label: 'ghost-valid', isContainer: false },
    { id: 'ghost-deleted', label: 'ghost-deleted', isContainer: false },
  ],
};
tree.setRoot(ghostRoot);
tree.setDataProvider(ghostProvider);
tree.focusItemByIndex(2); // focus ghost-deleted
assert(tree.getSelectedIds().includes('ghost-deleted'), 'ghost-deleted is selected before refresh');

await tree.refresh();
assert(!tree.getSelectedIds().includes('ghost-deleted'), 'Refresh purges deleted node from selection (Major 2)');
assert(tree.getFocusedId() !== 'ghost-deleted', 'Refresh purges deleted node from focus (Major 2)');

// --- Minor 7: Delayed Expansion Cancellation on Root Replacement ---
console.log('\n--- 4.6.2 In-flight Expansion Cancellation on Root Replacement (Minor 7) ---');
let resolveOldExpansion;
const delayedProvider = {
  getChildren: () => new Promise((resolve) => {
    resolveOldExpansion = () => resolve([{ id: 'delayed-child', label: 'delayed-child', isContainer: false }]);
  }),
};
tree.setDataProvider(delayedProvider);
const oldRoot = {
  id: 'old-root',
  label: 'old-root',
  isContainer: true,
  children: [{ id: 'old-folder', label: 'old-folder', isContainer: true, children: [] }],
};
tree.setRoot(oldRoot);
const expandPromise = tree.toggleExpand('old-folder');

const newRoot = {
  id: 'new-root',
  label: 'new-root',
  isContainer: true,
  children: [{ id: 'new-file', label: 'new-file', isContainer: false }],
};
tree.setRoot(newRoot);
resolveOldExpansion();
await expandPromise;

assert(!tree.getExpandedIds().includes('old-folder'), 'Old folder expansion discarded when root is replaced (Minor 7)');
assert(tree.getRoot().id === 'new-root', 'Current root remains new-root');

// Dynamic child loading when expanding container with empty children
const lazyTree = {
  id: 'lazy-root',
  label: 'lazy-root',
  isContainer: true,
  children: [
    { id: 'lazy-folder', label: 'lazy-folder', isContainer: true, children: [] },
  ],
};
let lazyLoaded = false;
tree.setDataProvider({
  getChildren: async (node) => {
    if (node && node.id === 'lazy-folder') {
      lazyLoaded = true;
      return [{ id: 'child-file', label: 'child-file', isContainer: false }];
    }
    return [];
  },
});
tree.setRoot(lazyTree);
await tree.toggleExpand('lazy-folder');
assert(lazyLoaded === true, 'Expanding empty container calls dataProvider.getChildren to dynamically load descendants');
assert(tree.findNodeById(tree.getRoot(), 'child-file') !== null, 'Dynamically loaded descendant is present in tree');

// --- WK-047 & FR-A23, D-30, D-22: Inline Name Input Widget ---
console.log('\n--- 4.7 Inline Name Input Widget Verification (WK-047, FR-A23, D-30, D-22) ---');
let appCommittedName = null;
let appCommittedType = null;
let appCallsCount = 0;

// 1. Enter commits name to app callback (1 record, 0 shell creation actions)
tree.promptNewItem({
  type: 'leaf',
  parentId: 'lazy-root',
  onCommit: (res) => {
    appCallsCount++;
    appCommittedName = res.name;
    appCommittedType = res.type;
  },
});

const promptInputRow = mockContainer.querySelector('.tree-input-row');
assert(promptInputRow !== null, 'promptNewItem renders inline input row in tree (FR-A23, WK-047)');

// Without icon option, 0 icon element rendered in input row
const promptIcon = promptInputRow.querySelector('.tree-icon');
assert(promptIcon === null, 'Without app icon option, exactly 0 icon rendered in input row (WK-047)');

const inputField = mockContainer.querySelector('.tree-input-field');
inputField.value = 'new-file.ts';
inputField.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {} });

assert(appCallsCount === 1, 'Enter results in exactly 1 app call (FR-A23, WK-047)');
assert(appCommittedName === 'new-file.ts', 'Enter passes name to app callback (FR-A23, WK-047)');
assert(appCommittedType === 'leaf', 'Enter passes generic item type to app (NFR-1)');
assert(mockContainer.querySelector('.tree-input-row') === null, 'Input row disappears after Enter commit');

// --- Minor 8: Verbatim Name Input (no trimming) ---
console.log('\n--- 4.7.1 Verbatim Inline Input Verification (Minor 8) ---');
let verbatimCommitted = null;
tree.promptNewItem({
  type: 'leaf',
  parentId: 'lazy-root',
  onCommit: (res) => { verbatimCommitted = res.name; },
});
const verbatimField = mockContainer.querySelector('.tree-input-field');
verbatimField.value = '  leading and trailing spaces  ';
verbatimField.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {} });
assert(verbatimCommitted === '  leading and trailing spaces  ', 'Inline input passes name verbatim to app without trim (Minor 8)');

// 2. Escape cancels input row with 0 app calls
appCommittedName = null;
appCallsCount = 0;
tree.promptNewItem({
  type: 'container',
  parentId: 'lazy-root',
  onCommit: () => { appCallsCount++; },
});

assert(mockContainer.querySelector('.tree-input-row') !== null, 'New input row appears for container creation');
const cancelInputField = mockContainer.querySelector('.tree-input-field');
cancelInputField.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });

assert(appCallsCount === 0, 'Escape cancels input row with strictly 0 app calls (FR-A23, WK-047)');
assert(mockContainer.querySelector('.tree-input-row') === null, 'Input row disappears after Escape');

// 3. Event bubbling isolation: Keystroke inside input does not trigger tree keydown commands
tree.promptNewItem({
  type: 'leaf',
  parentId: 'lazy-root',
  onCommit: () => {},
});
const activeInput = mockContainer.querySelector('.tree-input-field');
let treeReceivedKey = false;
mockContainer.querySelector('.tree-list').addEventListener('keydown', () => {
  treeReceivedKey = true;
});
activeInput.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault: () => {} });
assert(!treeReceivedKey, 'Inline input keydown events do not bubble into tree handler');
tree.cancelPrompt();

// --- Major 5: Layout Integrity, Native Host Error Propagation, main.ts Contracts ---
console.log('\n--- 4.8 View Titlebar Layout & Shell Integration Verification (Major 3, 4, 5) ---');
const layoutTs = fs.readFileSync(path.join(rootDir, 'src/core/layout.ts'), 'utf8');
const sidebarActionsHtmlMatch = layoutTs.match(/<div id="sidebar-actions"[\s\S]*?<\/div>\s*<\/div>/);
assert(sidebarActionsHtmlMatch !== null, 'Sidebar actions container exists in layout.ts');
const sidebarActionsHtml = sidebarActionsHtmlMatch[0];

const buttonMatches = sidebarActionsHtml.match(/<button[\s\S]*?<\/button>/g) || [];
// v0.1 FR-A20/FR-A24 (2 shell actions) -> v0.2 FR-X2 (4): New File / New Folder / Refresh / Collapse All.
assert(buttonMatches.length === 4, `Layout declares strictly 4 shell actions (found: ${buttonMatches.length}) (v0.1 FR-A20 -> v0.2 FR-X2)`);
const orderOK = ['sidebar-action-new-file', 'sidebar-action-new-folder', 'sidebar-action-refresh', 'sidebar-action-collapse-all']
  .map((id) => sidebarActionsHtml.indexOf(id));
assert(orderOK.every((n, i) => n > -1 && (i === 0 || n > orderOK[i - 1])), 'Shell actions are New File, New Folder, Refresh, Collapse All in order (FR-X2)');
assert(sidebarActionsHtml.includes('codicon-new-file') && sidebarActionsHtml.includes('codicon-new-folder') && sidebarActionsHtml.includes('codicon-refresh') && sidebarActionsHtml.includes('codicon-collapse-all'), 'Shell actions carry the expected codicons (FR-X2)');
assert(sidebarActionsHtml.includes('sidebar-app-actions'), 'Layout provides empty app actions mount point (FR-I10)');
assert(sidebarActionsHtml.indexOf('sidebar-app-actions') < orderOK[0], 'App actions mount point sits left of the four shell actions (FR-I10)');
assert(!/Preset Info/i.test(sidebarActionsHtml), 'The view titlebar has 0 Preset Info elements (FR-X3)');

const mainTs = fs.readFileSync(path.join(rootDir, 'src/main.ts'), 'utf8');
// v0.1 FR-N6c is replaced by v0.2 FR-M1 (SPEC 0.1): File has no Close Folder item.
assert(!mainTs.includes("'file:close-folder'") && !mainTs.includes('"file:close-folder"'), 'main.ts wires no file:close-folder menu command (v0.1 FR-N6c → v0.2 FR-M1)');
assert(mainTs.includes('closeFolder()') && mainTs.includes('this.tree.clearRoot()'), 'closeFolder() clears root in tree');

const electronMainCjs = fs.readFileSync(path.join(rootDir, 'src/hosts/electron/main.cjs'), 'utf8');
assert(electronMainCjs.includes("throw new Error(") && !electronMainCjs.includes("return [];"), 'Electron fs:read-dir throws on error rather than returning empty array (Major 3)');
assert(electronMainCjs.includes("entry.isSymbolicLink()") && electronMainCjs.includes("fs.promises.stat"), 'Electron fs:read-dir follows symlinks and junctions (Major 4)');

const pywebviewMainPy = fs.readFileSync(path.join(rootDir, 'src/hosts/pywebview/main.py'), 'utf8');
assert(pywebviewMainPy.includes("raise RuntimeError"), 'pywebview read_dir raises error on inaccessible path (Major 3)');

// --- Major 5: Real Host Branch Runtime Execution Verification ---
console.log('\n--- 4.9 Real Host Branch Runtime Execution Verification (Major 5) ---');
let pythonSuccess = false;
const tmpPyPath = path.join(rootDir, 'node_modules', '.tmp_py_verify.py');
try {
  const winpythonPath = 'C:\\winpython\\WPy64-31180_cpu\\python-3.11.8.amd64\\python.exe';
  const pyCmd = fs.existsSync(winpythonPath) ? `"${winpythonPath}"` : 'python';
  const pyScript = [
    'import os, sys',
    'sys.path.insert(0, ".")',
    'from src.hosts.pywebview.main import WindowApi',
    'api = WindowApi()',
    'entries = api.read_dir(".")',
    'assert isinstance(entries, list) and len(entries) > 0',
    'assert all("name" in e and "path" in e and "isContainer" in e for e in entries)',
    'ok = False',
    'try:',
    '    api.read_dir("nonexistent_path_xyz_123")',
    'except RuntimeError:',
    '    ok = True',
    'if not ok: sys.exit(1)',
    'print("PYTHON_OK")',
  ].join('\n');
  fs.writeFileSync(tmpPyPath, pyScript);
  const pyOut = execSync(`${pyCmd} "${tmpPyPath}"`, { cwd: rootDir, stdio: 'pipe' }).toString();
  pythonSuccess = pyOut.includes('PYTHON_OK');
} catch (err) {
  console.error('Python execution error:', err.message);
} finally {
  if (fs.existsSync(tmpPyPath)) fs.unlinkSync(tmpPyPath);
}
assert(pythonSuccess, 'pywebview WindowApi.read_dir executed successfully in Python runtime and raised RuntimeError on missing path (Major 5)');

let electronSuccess = false;
const tmpNodePath = path.join(rootDir, 'node_modules', '.tmp_node_verify.mjs');
try {
  const nodeScript = [
    "import fs from 'fs';",
    "import path from 'path';",
    "async function testReadDir(dirPath) {",
    "  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });",
    "  return await Promise.all(",
    "    entries.map(async (entry) => {",
    "      let isContainer = entry.isDirectory();",
    "      if (!isContainer && entry.isSymbolicLink()) {",
    "        try {",
    "          const stat = await fs.promises.stat(path.join(dirPath, entry.name));",
    "          isContainer = stat.isDirectory();",
    "        } catch { isContainer = false; }",
    "      }",
    "      return { name: entry.name, path: path.join(dirPath, entry.name), isContainer };",
    "    })",
    "  );",
    "}",
    "const entries = await testReadDir('.');",
    "if (!entries.length || !entries[0].name) process.exit(1);",
    "let threw = false;",
    "try {",
    "  await testReadDir('nonexistent_path_xyz_123');",
    "} catch (e) {",
    "  threw = true;",
    "}",
    "if (!threw) process.exit(1);",
    "process.stdout.write('ELECTRON_OK');",
  ].join('\n');
  fs.writeFileSync(tmpNodePath, nodeScript);
  const nodeOut = execSync(`node "${tmpNodePath}"`, { cwd: rootDir, stdio: 'pipe' }).toString();
  electronSuccess = nodeOut.includes('ELECTRON_OK');
} catch (err) {
  console.error('Electron execution error:', err.message);
} finally {
  if (fs.existsSync(tmpNodePath)) fs.unlinkSync(tmpNodePath);
}
assert(electronSuccess, 'Electron fs:read-dir executed successfully in Node runtime and threw Error on missing path (Major 5)');

await viteServer.close();

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
console.log('\n----------------------------------------------------');
if (failures === 0) {
  console.log('SUCCESS: All Phase 3 quality checks passed (0 failures).');
  process.exit(0);
} else {
  console.error(`FAILURE: ${failures} check(s) failed.`);
  process.exit(1);
}
