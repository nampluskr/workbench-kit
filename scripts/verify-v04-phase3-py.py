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
    fixture = tempfile.mkdtemp(prefix="wb-v04-p3-py-")
    sample = os.path.join(fixture, "sample.md")
    with open(sample, "w", encoding="utf-8") as file:
        file.write('$x^2+y^2$\n\n$$\\frac{a}{b}$$\n\n```js\nconst safe = "ok";\n<img src=x onerror="window.__attack=1">\n```\n\n$\\htmlClass{evil}{x}$ $\\href{javascript:window.__attack=3}{x}$ $\\htmlStyle{position:fixed}{x}$\n\n![remote](//attacker.example/share/a.png)\n<video src="//attacker.example/share/a.png"></video>\n<span style="position:fixed" onclick="window.__attack=2">raw</span>')
    dist_index = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist", "index.html"))
    api = WindowApi()
    window = webview.create_window("Phase 3", dist_index, js_api=api, width=1200, height=800)
    api.set_window(window)
    result = {"error": "test did not finish"}

    def inspect():
        nonlocal result
        try:
            script = """
              window.__v04Phase3Result = null;
              (async () => {
                await window.__workbenchApp.openRenderedMarkdown(SAMPLE_PATH);
                const panel = window.__workbenchApp.editor.getActivePanel();
                const root = window.__workbenchApp.editor.getContentRenderer(panel.id).element;
                const rendered = root.querySelector('.markdown-rendered');
                for (let i = 0; i < 40 && !rendered?.querySelector('.katex'); i++) await new Promise(r => setTimeout(r, 100));
                await document.fonts.ready;
                const formulas = rendered.querySelectorAll('.katex');
                const code = rendered.querySelector('pre code.hljs');
                const keyword = code?.querySelector('.hljs-keyword');
                const colors = {};
                for (const theme of ['dark', 'light', 'gray']) {
                  document.documentElement.dataset.theme = theme;
                  colors[theme] = Boolean(keyword && getComputedStyle(keyword).color !== getComputedStyle(rendered).color);
                }
                window.__v04Phase3Result = {
                  math: formulas.length >= 2 && [...formulas].every(e => e.getBoundingClientRect().width > 0),
                  font: [...document.fonts].some(f => f.family.includes('KaTeX') && f.status === 'loaded'),
                  css: [...document.styleSheets].some(s => s.href && s.href.includes('/assets/') && [...s.cssRules].some(r => r.cssText.includes('.katex'))) && getComputedStyle(formulas[0]).fontFamily.includes('KaTeX'),
                  highlight: Boolean(keyword && code.textContent.includes('const safe')),
                  colors: Object.values(colors).every(Boolean),
                  safe: !rendered.querySelector('script, img, video, audio, svg, [onclick], [onerror], .evil, [href^="javascript:"]') && !rendered.querySelector('span[style*="fixed"]') && window.__attack === undefined
                };
              })().catch(error => { window.__v04Phase3Result = {error: String(error)}; });
            """.replace("SAMPLE_PATH", json.dumps(sample))
            window.evaluate_js(script)
            for _ in range(100):
                value = window.evaluate_js("JSON.stringify(window.__v04Phase3Result)")
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
        webview.start(storage_path=os.path.join(fixture, "profile"), private_mode=True)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result and all(value is True for value in result.values()) else 1
    finally:
        resolved = os.path.abspath(fixture)
        if resolved.startswith(os.path.abspath(tempfile.gettempdir()) + os.sep) and os.path.basename(resolved).startswith("wb-v04-p3-py-"):
            shutil.rmtree(resolved, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
