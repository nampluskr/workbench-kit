import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time

import webview

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.hosts.pywebview.main import WindowApi


def launch(stage, fixture, profile, port):
    markdown = os.path.join(fixture, "sample.md")
    dist_index = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist", "index.html"))
    api = WindowApi()
    window = webview.create_window("Phase 2", dist_index, js_api=api, width=1200, height=800)
    api.set_window(window)
    result = {"error": "test did not finish"}

    def inspect():
        nonlocal result
        try:
            if stage == "first":
                script = """
                  window.__v04Phase2Result = null;
                  (async () => {
                    const a = window.__workbenchApp;
                    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                    const button = document.querySelector('[data-item-id="activity:markdown-rendering"]');
                    const key = (target, k) => target.dispatchEvent(new KeyboardEvent('keydown', {key:k,bubbles:true,cancelable:true}));
                    const r = {};
                    r.initialOff = localStorage.getItem('workbench:markdown-rendering') !== 'true' && !!button?.querySelector('svg rect[stroke="currentColor"]');
                    r.placementAndLabel = button?.previousElementSibling?.getAttribute('data-item-id') === 'activity:file-filter' &&
                      button?.getAttribute('title') === 'Markdown Rendering' && button?.getAttribute('aria-label') === 'Markdown Rendering';
                    const offColors = [];
                    for (const theme of ['dark', 'light', 'gray']) {
                      a.theme.setTheme(theme);
                      const stroke = getComputedStyle(button.querySelector('svg rect[stroke]')).stroke;
                      offColors.push(stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)' ? stroke : '');
                    }
                    r.offIconColors = offColors.every(Boolean) && new Set(offColors).size === 3;
                    a.theme.setTheme('dark');
                    await a.handleOpenFolderDialog(FOLDER);
                    await wait(300);
                    const row = document.querySelector('.tree-row[data-id="' + CSS.escape(MARKDOWN) + '"]');
                    row.click(); await wait(350);
                    r.offBehavior = a.editor.getActivePanel()?.params?.kind === 'file' && a.editor.getActivePanel()?.params?.mode === 'viewer';
                    a.editor.clear();
                    button.click();
                    r.toggleOn = localStorage.getItem('workbench:markdown-rendering') === 'true' && !!button.querySelector('svg mask');
                    const themeColors = [];
                    for (const theme of ['dark', 'light', 'gray']) {
                      a.theme.setTheme(theme);
                      const svg = button.querySelector('svg');
                      const fill = getComputedStyle(svg?.querySelector('rect[mask]')).fill;
                      themeColors.push(svg?.getBoundingClientRect().width > 0 && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)' ? fill : '');
                    }
                    r.themeColors = themeColors.every(Boolean) && new Set(themeColors).size === 3;
                    a.theme.setTheme('dark');
                    row.click(); await wait(350);
                    const panel = a.editor.getActivePanel();
                    r.clickRendered = panel?.params?.kind === 'markdown' && panel?.params?.mode === 'rendered';
                    key(a.editor.getContentRenderer(panel.id).element, 'F4'); await wait(250);
                    r.f4Editor = panel.params.kind === 'file' && panel.params.mode === 'editor';
                    key(a.editor.getContentRenderer(panel.id).element, 'F3'); await wait(250);
                    r.f3Rendered = panel.params.kind === 'markdown' && panel.params.mode === 'rendered';
                    button.click();
                    r.noRetroactiveSwitch = panel.params.mode === 'rendered';
                    button.click();
                    a.editor.clear(); a.setDefaultFileMode('editor'); row.click(); await wait(350);
                    r.overrideDefault = a.editor.getActivePanel()?.params?.mode === 'rendered';
                    a.editor.clear();
                    const textRow = document.querySelector('.tree-row[data-id="' + CSS.escape(TEXTFILE) + '"]');
                    textRow.click(); await wait(350);
                    r.otherFile = a.editor.getActivePanel()?.params?.kind === 'file';
                    a.editor.clear(); a.tree.focusItemById(MARKDOWN);
                    key(document.querySelector('.tree-list'), 'F3'); await wait(350);
                    r.treeF3 = a.editor.getActivePanel()?.params?.mode === 'rendered';
                    a.editor.clear(); a.tree.focusItemById(MARKDOWN);
                    key(document.querySelector('.tree-list'), 'F4'); await wait(350);
                    r.treeF4 = a.editor.getActivePanel()?.params?.mode === 'editor';
                    a.editor.clear(); a.tree.focusItemById(MARKDOWN);
                    key(document.querySelector('.tree-list'), 'Enter'); await wait(350);
                    r.treeEnter = a.editor.getActivePanel()?.params?.mode === 'rendered';
                    key(a.editor.getContentRenderer(a.editor.getActivePanel().id).element, 'F4'); await wait(200);
                    const edited = a.editor.getActivePanel();
                    a.kindRegistry.getInnerForTest(edited.id).appendContentForTest('dirty');
                    const before = a.kindRegistry.getInnerForTest(edited.id).getContentForTest();
                    row.click(); await wait(350);
                    r.dirtySameFileClick = a.editor.getActivePanel()?.id === edited.id && edited.params.mode === 'rendered';
                    key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
                    r.dirtySameFileRestored = a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before && edited.params.isDirty === true;
                    key(a.editor.getContentRenderer(edited.id).element, 'F3'); await wait(200);
                    key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
                    r.dirtyPreserved = edited.params.isDirty === true && a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before;
                    button.click(); a.setDefaultFileMode('viewer');
                    row.click(); await wait(350);
                    r.dirtySameFileOff = a.editor.getActivePanel()?.id === edited.id && edited.params.mode === 'viewer';
                    key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
                    r.offDirtyRestored = a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before && edited.params.isDirty === true;
                    button.click(); a.tree.focusItemById(MARKDOWN);
                    key(document.querySelector('.tree-list'), 'F3'); await wait(350);
                    r.dirtyTreeF3 = a.editor.getActivePanel()?.id === edited.id && edited.params.mode === 'rendered';
                    key(a.editor.getContentRenderer(edited.id).element, 'F4'); await wait(200);
                    r.treeF3DirtyRestored = a.kindRegistry.getInnerForTest(edited.id).getContentForTest() === before && edited.params.isDirty === true;
                    a.setDefaultFileMode('editor');
                    window.__v04Phase2Result = r;
                  })().catch(error => {window.__v04Phase2Result = {error:String(error)};});
                """.replace("FOLDER", json.dumps(fixture)).replace("MARKDOWN", json.dumps(markdown)).replace("TEXTFILE", json.dumps(os.path.join(fixture, "plain.txt")))
            else:
                script = """
                  window.__v04Phase2Result = {
                    restartOn: localStorage.getItem('workbench:markdown-rendering') === 'true' &&
                      !!document.querySelector('[data-item-id="activity:markdown-rendering"] svg mask'),
                    restartDefaultEditor: window.__workbenchApp.getDefaultFileMode() === 'editor'
                  };
                """
            window.evaluate_js(script)
            for _ in range(100):
                value = window.evaluate_js("JSON.stringify(window.__v04Phase2Result)")
                if value and value != "null":
                    result = json.loads(value)
                    break
                time.sleep(0.1)
        except Exception as error:
            result = {"error": str(error)}
        finally:
            window.destroy()

    window.events.loaded += lambda: threading.Thread(target=inspect, daemon=True).start()
    webview.start(storage_path=profile, private_mode=False, http_port=int(port))
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result and all(value is True for value in result.values()) else 1


def main():
    if len(sys.argv) == 6 and sys.argv[1] == "--launch":
        return launch(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])

    fixture = tempfile.mkdtemp(prefix="wb-v04-p2-py-")
    profile = os.path.join(fixture, "profile")
    with open(os.path.join(fixture, "sample.md"), "w", encoding="utf-8") as file:
        file.write("# Heading\n")
    with open(os.path.join(fixture, "plain.txt"), "w", encoding="utf-8") as file:
        file.write("plain\n")
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    try:
        for stage in ("first", "restart"):
            completed = subprocess.run(
                [sys.executable, __file__, "--launch", stage, fixture, profile, str(port)],
                text=True, capture_output=True, timeout=60,
            )
            print(completed.stdout, end="")
            if completed.returncode != 0:
                print(completed.stderr, file=sys.stderr)
                return 1
        return 0
    finally:
        resolved = os.path.abspath(fixture)
        temp_root = os.path.abspath(tempfile.gettempdir()) + os.sep
        if resolved.startswith(temp_root) and os.path.basename(resolved).startswith("wb-v04-p2-py-"):
            shutil.rmtree(resolved, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
