import json
import os
import shutil
import sys
import tempfile
import threading
import time

import webview

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.hosts.pywebview.main import WindowApi


def main():
    fixture = tempfile.mkdtemp(prefix="wb-v04-p1-py-")
    profile = os.path.join(fixture, "profile")
    sample = os.path.join(fixture, "sample.md")
    with open(sample, "w", encoding="utf-8") as file:
        file.write(
            '# Heading\n\n- Item\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n'
            '<b>bold</b>\n\n<script>window.__markdownAttack=1</script>'
            '<img src=x onerror="window.__markdownAttack=2">'
            '<button onclick="window.__markdownAttack=4">press</button>'
            '<a href="javascript:window.__markdownAttack=3">bad</a>'
            '<form action="https://attacker.example"><input><button>submit</button></form>'
            '<map name="m"><area href="https://attacker.example"></map>'
            '<style>body { display: none }</style><div style="position:fixed">fake</div>'
        )
    dist_index = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist", "index.html"))
    api = WindowApi()
    window = webview.create_window("Phase 1", dist_index, js_api=api, width=1200, height=800)
    api.set_window(window)
    result = {"error": "test did not finish"}

    def inspect():
        nonlocal result
        try:
            script = """
              window.__v04Phase1Result = null;
              (async () => {
                await window.__workbenchApp.openRenderedMarkdown(SAMPLE_PATH);
                const app = window.__workbenchApp;
                const panel = app.editor.getActivePanel();
                const root = app.editor.getContentRenderer(panel.id).element;
                const rendered = root.querySelector('.markdown-rendered');
                for (let attempt = 0; attempt < 30 && !rendered?.querySelector('table'); attempt++) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
                const cell = rendered?.querySelector('td');
                const link = rendered?.querySelector('a');
                rendered?.querySelector('button')?.click();
                link?.click();
                window.__v04Phase1Result = {
                  mode: panel.params.mode === 'rendered' && panel.params.kind === 'markdown',
                  tooltip: document.querySelector('.dv-active-tab')?.getAttribute('title')?.endsWith('Rendered') === true,
                  content: rendered?.querySelector('h1')?.textContent === 'Heading' && rendered?.querySelector('li')?.textContent === 'Item',
                  table: Boolean(cell && cell.getBoundingClientRect().width > 0 && getComputedStyle(cell).borderTopColor !== 'rgba(0, 0, 0, 0)'),
                  rawHtml: rendered?.querySelector('b')?.textContent === 'bold',
                  sanitized: !rendered?.querySelector('script, form, input, button, map, area, style, [style], [onerror], [onclick]') && !link?.getAttribute('href')?.startsWith('javascript:'),
                  noExecution: window.__markdownAttack === undefined
                };
              })().catch(error => { window.__v04Phase1Result = { error: String(error) }; });
            """.replace("SAMPLE_PATH", json.dumps(sample))
            window.evaluate_js(script)
            for _ in range(100):
                value = window.evaluate_js("JSON.stringify(window.__v04Phase1Result)")
                if value and value != "null":
                    result = json.loads(value)
                    break
                time.sleep(0.1)
        except Exception as error:
            result = {"error": str(error)}
        finally:
            window.destroy()

    window.events.loaded += lambda: threading.Thread(target=inspect, daemon=True).start()
    try:
        webview.start(storage_path=profile, private_mode=True)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result and all(value is True for value in result.values()) else 1
    finally:
        resolved = os.path.abspath(fixture)
        temp_root = os.path.abspath(tempfile.gettempdir()) + os.sep
        if resolved.startswith(temp_root) and os.path.basename(resolved).startswith("wb-v04-p1-py-"):
            shutil.rmtree(resolved, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
