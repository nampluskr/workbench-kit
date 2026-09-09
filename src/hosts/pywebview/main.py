import os
import sys
import json
import hashlib
import webview
import time
import threading

is_smoke_test = "--smoke-test" in sys.argv
is_phase4_test = "--phase4-test" in sys.argv
is_phase5_test = "--phase5-test" in sys.argv
loaded_called = False

INSPECTION_EXPRESSION = """
JSON.stringify({
  href: window.location.href,
  title: document.title,
  statusbarText: document.getElementById('statusbar-message') ? document.getElementById('statusbar-message').textContent.trim() : (document.getElementById('statusbar') ? document.getElementById('statusbar').textContent.trim() : null),
  domAssets: Array.from(document.querySelectorAll('script[src], link[href]')).map(function(el) { return el.getAttribute('src') || el.getAttribute('href'); }),
  styleSheetsCount: document.styleSheets.length,
  styleSheetRulesCount: document.styleSheets.length > 0 && document.styleSheets[0].cssRules ? document.styleSheets[0].cssRules.length : 0,
  computedBg: window.getComputedStyle ? window.getComputedStyle(document.body).backgroundColor : null
})
""".strip()


def hash_file(file_path: str) -> str:
    with open(file_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def compute_digest_map(dist_dir: str, dom_assets: list) -> dict:
    digest_map = {}
    index_path = os.path.join(dist_dir, "index.html")
    digest_map["index.html"] = hash_file(index_path)

    for raw in dom_assets:
        if not raw:
            continue
        clean = raw.lstrip("./").lstrip("/")
        asset_path = os.path.join(dist_dir, clean)
        if os.path.exists(asset_path):
            rel_key = os.path.relpath(asset_path, dist_dir).replace("\\", "/")
            digest_map[rel_key] = hash_file(asset_path)

    return digest_map


class WindowApi:
    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def minimize(self):
        if self._window:
            self._window.minimize()

    def maximize(self):
        if self._window:
            if getattr(self._window, "is_maximized", False):
                self._window.restore()
                self._window.is_maximized = False
            else:
                self._window.maximize()
                self._window.is_maximized = True

    def close(self):
        if self._window:
            self._window.destroy()

    def open_folder_dialog(self):
        if self._window:
            result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
            if result and len(result) > 0:
                return result[0]
        return None

    def read_dir(self, dir_path):
        if not os.path.exists(dir_path) or not os.path.isdir(dir_path):
            raise RuntimeError(f"Directory not found or not accessible: {dir_path}")
        try:
            entries = []
            for name in os.listdir(dir_path):
                full_path = os.path.join(dir_path, name)
                entries.append({
                    "name": name,
                    "path": full_path,
                    "isContainer": os.path.isdir(full_path),
                })
            return entries
        except Exception as e:
            raise RuntimeError(f"Failed to read directory {dir_path}: {e}")


WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 800

try:
    from .window_chrome import patch_drag_move, enable_native_window_management
    patch_drag_move()
except Exception:
    enable_native_window_management = None


def main():
    global loaded_called

    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    dist_dir = os.path.abspath(os.path.join(root_dir, "dist"))
    dist_index = os.path.abspath(os.path.join(dist_dir, "index.html"))

    if not os.path.exists(dist_index):
        sys.stderr.write(f"[pywebview] Error: Dist index not found at {dist_index}\n")
        sys.stderr.flush()
        os._exit(1)

    api = WindowApi()
    window = webview.create_window(
        title="workbench-kit",
        url=dist_index,
        frameless=True,
        easy_drag=False,
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        js_api=api,
    )
    api.set_window(window)

    def on_shown():
        # Re-apply window dimensions on shown to prevent WinForms FormBorderStyle.None size collapse
        window.resize(WINDOW_WIDTH, WINDOW_HEIGHT)
        if enable_native_window_management:
            native = getattr(window, "native", None)
            handle = getattr(native, "Handle", None)
            if handle is not None:
                try:
                    enable_native_window_management(handle.ToInt32())
                except Exception:
                    pass

    window.events.shown += on_shown

    def on_loaded():
        global loaded_called
        if loaded_called:
            return
        loaded_called = True

        if is_smoke_test:
            try:
                current_url = window.get_current_url()
                inspection_json = window.evaluate_js(INSPECTION_EXPRESSION)
                inspection = json.loads(inspection_json)
                digest_map = compute_digest_map(dist_dir, inspection.get("domAssets") or [])

                sys.stdout.write(f"[pywebview] Local Path: {dist_index}\n")
                sys.stdout.write(f"[pywebview] Loaded URL: {current_url}\n")
                sys.stdout.write(f"[pywebview] Digest Map: {json.dumps(digest_map, sort_keys=True)}\n")
                sys.stdout.write(f"[pywebview] DOM Inspection: {inspection_json}\n")
                sys.stdout.flush()
                window.destroy()
                os._exit(0)
            except Exception as e:
                sys.stderr.write(f"[pywebview] Error inspecting loaded DOM: {e}\n")
                sys.stderr.flush()
                os._exit(1)

        if is_phase4_test:
            def run_phase4():
                try:
                    time.sleep(0.3)
                    suite_path = os.path.join(root_dir, "scripts", "phase4-suite.js")
                    with open(suite_path, "r", encoding="utf-8") as f:
                        suite_code = f.read()
                    window.evaluate_js(suite_code)
                    window.evaluate_js("""
                        (async () => {
                            try {
                                const res = await window.__runPhase4TestSuite();
                                window.__phase4Results = JSON.stringify(res);
                            } catch (e) {
                                window.__phase4Results = JSON.stringify({ success: false, results: [{ id: 'RUNNER_ERR', pass: false, msg: String(e) }] });
                            }
                        })();
                    """)
                    for _ in range(100):
                        time.sleep(0.1)
                        res = window.evaluate_js("window.__phase4Results")
                        if res:
                            sys.stdout.write(f"[pywebview] Phase 4 Results: {res}\n")
                            sys.stdout.flush()
                            window.destroy()
                            os._exit(0)
                            return
                    sys.stderr.write("[pywebview] Error: Phase 4 test timed out waiting for results\n")
                    sys.stderr.flush()
                    window.destroy()
                    os._exit(1)
                except Exception as e:
                    sys.stderr.write(f"[pywebview] Error executing Phase 4 test: {e}\n")
                    sys.stderr.flush()
                    window.destroy()
                    os._exit(1)

            t = threading.Thread(target=run_phase4, daemon=True)
            t.start()
            return

        if is_phase5_test:
            def run_phase5():
                try:
                    time.sleep(0.3)
                    suite_path = os.path.join(root_dir, "scripts", "phase5-suite.js")
                    with open(suite_path, "r", encoding="utf-8") as f:
                        suite_code = f.read()
                    window.evaluate_js(suite_code)
                    window.evaluate_js("""
                        (async () => {
                            try {
                                const res = await window.__runPhase5TestSuite();
                                window.__phase5Results = JSON.stringify(res);
                            } catch (e) {
                                window.__phase5Results = JSON.stringify({ success: false, results: [{ id: 'RUNNER_ERR', pass: false, msg: String(e) }] });
                            }
                        })();
                    """)
                    for _ in range(100):
                        time.sleep(0.1)
                        res = window.evaluate_js("window.__phase5Results")
                        if res:
                            sys.stdout.write(f"[pywebview] Phase 5 Results: {res}\n")
                            sys.stdout.flush()
                            window.destroy()
                            os._exit(0)
                            return
                    sys.stderr.write("[pywebview] Error: Phase 5 test timed out waiting for results\n")
                    sys.stderr.flush()
                    window.destroy()
                    os._exit(1)
                except Exception as e:
                    sys.stderr.write(f"[pywebview] Error executing Phase 5 test: {e}\n")
                    sys.stderr.flush()
                    window.destroy()
                    os._exit(1)

            t = threading.Thread(target=run_phase5, daemon=True)
            t.start()
            return

    window.events.loaded += on_loaded

    webview.start()


if __name__ == "__main__":
    main()
