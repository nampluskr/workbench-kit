import base64
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import webbrowser

import webview

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.hosts.pywebview.main import WindowApi, install_app_navigation_guard


def main():
    fixture = tempfile.mkdtemp(prefix="wb-v04-p4-py-")
    sample = os.path.join(fixture, "sample.md")
    linked = os.path.join(fixture, "linked.md")
    with open(linked, "w", encoding="utf-8") as file:
        file.write("# Linked")
    with open(os.path.join(fixture, "pixel.png"), "wb") as file:
        file.write(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=="))
    with open(sample, "w", encoding="utf-8") as file:
        file.write("# Top\n\n[local](./linked.md) [external](https://example.com/path) [anchor](#bottom) [bad](file:///C:/Windows/win.ini)\n\n![local](./pixel.png) ![remote](https://example.com/x.png) ![escape](../outside.png)\n\n" + "paragraph\n\n" * 80 + "# Bottom")
    api = WindowApi()
    class FakeEvent:
        def __iadd__(self, callback):
            self.callback = callback
            return self

    class FakeWindow:
        def __init__(self):
            self.events = type("Events", (), {"loaded": FakeEvent()})()
            self.native = None
            self.destroyed = False

        def get_current_url(self):
            return "http://127.0.0.1:47823/index.html"

        def destroy(self):
            self.destroyed = True

    fake = FakeWindow()
    install_app_navigation_guard(fake)
    fake.events.loaded.callback()
    fail_closed = fake.destroyed
    popup_calls = []
    original_browser_open = webbrowser.open
    webbrowser.open = lambda url: popup_calls.append(url) or False
    url_guard = all(api.open_external_url(url) is False for url in (
        "file:///C:/Windows/win.ini", "javascript:alert(1)", "https://example.com\\@attacker.test"))
    calls = []
    api.open_external_url = lambda url: calls.append(url) or True
    direct = {}
    for name, source in (("parent", "../outside.png"), ("scheme", "file:///C:/Windows/win.ini"), ("remote", "//attacker/share.png")):
        try:
            api.read_local_image(sample, source)
            direct[name] = False
        except (ValueError, FileNotFoundError):
            direct[name] = True
    direct["valid"] = api.read_local_image(sample, "./pixel.png")["mime"] == "image/png"
    dist_index = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist", "index.html"))
    window = webview.create_window("Phase 4", dist_index, js_api=api, width=1200, height=800)
    api.set_window(window)
    install_app_navigation_guard(window)
    result = {"error": "test did not finish"}

    def inspect():
        nonlocal result
        try:
            script = """
              window.__v04Phase4Result = null;
              (async () => {
                const wait = ms => new Promise(r => setTimeout(r, ms));
                await window.__workbenchApp.openRenderedMarkdown(SAMPLE_PATH);
                const app = window.__workbenchApp;
                const renderedPanel = app.editor.getActivePanel();
                const rendered = app.editor.getContentRenderer(renderedPanel.id).element.querySelector('.markdown-rendered');
                for (let i = 0; i < 40 && !rendered?.querySelector('img[src^="blob:"]'); i++) await wait(100);
                const image = rendered.querySelector('img[alt="local"]');
                await image.decode();
                const imageOk = image.src.startsWith('blob:') && image.getBoundingClientRect().width > 0 && image.naturalWidth > 0;
                const blocked = !rendered.querySelector('img[alt="remote"]').getAttribute('src') && !rendered.querySelector('img[alt="escape"]').getAttribute('src');
                rendered.querySelector('a[href="#bottom"]').click();
                const anchor = rendered.scrollTop > 0;
                rendered.querySelector('a[href^="https:"]').click();
                rendered.querySelector('a[href^="file:"]')?.click();
                await wait(150);
                const editor = app.editor.openItem(SAMPLE_PATH, 'sample.md', {mode: 'pinned', forceNew: true, meta: {kind: 'file', mode: 'editor'}});
                await wait(250);
                app.kindRegistry.getInnerForTest(editor.id).appendContentForTest('\\nSaved change');
                const beforeSave = !rendered.textContent.includes('Saved change');
                const saved = await app.kindRegistry.save(editor.id);
                for (let i = 0; i < 30 && !rendered.textContent.includes('Saved change'); i++) await wait(100);
                const afterSave = rendered.textContent.includes('Saved change');
                renderedPanel.api.setActive();
                document.querySelector('[data-item-id="activity:markdown-rendering"]')?.click();
                rendered.querySelector('a[href="./linked.md"]').click();
                await wait(350);
                window.__v04Phase4Result = {
                  csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("img-src 'self' blob:"),
                  image: imageOk, remoteBlocked: blocked, anchor, beforeSave, saved, afterSave,
                  localLink: app.editor.getActivePanel()?.params?.targetId?.toLowerCase().replaceAll('\\\\', '/') === LINKED_PATH.toLowerCase().replaceAll('\\\\', '/') && app.editor.getActivePanel()?.params?.mode === 'rendered'
                };
              })().catch(error => { window.__v04Phase4Result = {error: String(error)}; });
            """.replace("SAMPLE_PATH", json.dumps(sample)).replace("LINKED_PATH", json.dumps(linked))
            window.evaluate_js(script)
            for _ in range(100):
                value = window.evaluate_js("JSON.stringify(window.__v04Phase4Result)")
                if value and value != "null":
                    result = json.loads(value)
                    break
                time.sleep(0.1)
            original_url = window.get_current_url()
            window.evaluate_js("location.href = 'https://example.com/escape'")
            time.sleep(0.4)
            result["navigationGuard"] = window.get_current_url() == original_url
            window.evaluate_js("window.open('file:///C:/Windows/win.ini', '_blank')")
            window.evaluate_js("window.open('https://example.com/popup', '_blank')")
            time.sleep(0.4)
            page_url = window.evaluate_js("location.href")
            result["popupGuard"] = page_url == original_url and not popup_calls
            if not result["popupGuard"]:
                result["popupDetails"] = {"original": original_url, "current": window.get_current_url(), "page": page_url, "calls": list(popup_calls)}
        except Exception as error:
            result = {"error": str(error)}
        finally:
            window.destroy()

    started = False

    def on_loaded():
        nonlocal started
        if started:
            return
        started = True
        threading.Thread(target=inspect, daemon=True).start()

    window.events.loaded += on_loaded
    try:
        webview.start(storage_path=os.path.join(fixture, "profile"), private_mode=True)
        result.update({"external": calls == ["https://example.com/path"], "bridgeGuard": all(direct.values()), "urlGuard": url_guard, "guardFailClosed": fail_closed})
        if not result["external"]:
            result["externalCalls"] = calls
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result and all(value is True for value in result.values()) else 1
    finally:
        webbrowser.open = original_browser_open
        resolved = os.path.abspath(fixture)
        if resolved.startswith(os.path.abspath(tempfile.gettempdir()) + os.sep) and os.path.basename(resolved).startswith("wb-v04-p4-py-"):
            shutil.rmtree(resolved, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
