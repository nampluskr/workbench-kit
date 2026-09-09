import os
import sys
import json
import hashlib
import webview
import time
import threading
import tempfile
import shutil

# Windows consoles often default stdout/stderr to a legacy codepage (e.g.
# cp949) that cannot encode arbitrary Unicode punctuation appearing in test
# assertion messages or JSON results; force UTF-8 so a write never raises.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

is_smoke_test = "--smoke-test" in sys.argv
is_phase4_test = "--phase4-test" in sys.argv
is_phase5_test = "--phase5-test" in sys.argv
is_phase6_test = "--phase6-test" in sys.argv
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


def request_confirmed_close(window):
    """Asks the app (via confirmQuit(), FR-L6/D-28) before actually tearing
    the window down. Runs the JS round-trip on a background thread so a
    caller that must not block (events.closing, which runs synchronously
    on the GUI thread) can fire-and-forget this. Never calls window.destroy()
    directly from a title-bar/native close path — only from here, once
    confirmed.

    Round-2 adversarial finding (Critical): on Windows, window.destroy() itself
    calls the native form's Close(), which re-fires events.closing. Marking
    window._wb_close_confirmed before destroy() lets on_closing() recognize
    this re-entrant firing and NOT veto it again — an unconditional veto there
    would loop forever, so the window could never actually close.

    Round-3 adversarial finding (Critical): a confirm-dialog timeout, a
    rejected save handler, and any exception during this round-trip were all
    treated as implicit consent to close (fail-open), silently discarding
    unsaved content. None of them destroy the window now — only an explicit
    'yes' result does. The window simply stays open; the user can retry the
    close once whatever blocked the answer (a stuck dialog, a failing save)
    is resolved."""
    def check_and_maybe_close():
        try:
            window.evaluate_js("""
                (async () => {
                    try {
                        const ok = window.__workbenchApp
                            ? await window.__workbenchApp.editor.confirmQuit()
                            : true;
                        window.__closeConfirmResult = ok ? 'yes' : 'no';
                    } catch (e) {
                        window.__closeConfirmResult = 'no';
                    }
                })();
            """)
            for _ in range(200):
                time.sleep(0.05)
                res = window.evaluate_js("window.__closeConfirmResult")
                if res:
                    window.evaluate_js("window.__closeConfirmResult = null;")
                    if res == "yes":
                        window._wb_close_confirmed = True
                        window.destroy()
                    return
            sys.stderr.write("[pywebview] Close confirmation timed out; window stays open.\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[pywebview] Close confirmation failed; window stays open: {e}\n")
            sys.stderr.flush()

    threading.Thread(target=check_and_maybe_close, daemon=True).start()


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
            request_confirmed_close(self._window)

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

    def on_closing():
        # events.closing runs synchronously on the calling (GUI) thread and
        # can veto the close by returning False (webview/event.py). Blocking
        # it here to await a JS confirm dialog would freeze the GUI thread
        # the dialog's own button needs in order to be clickable — so every
        # native close request is vetoed immediately, and
        # request_confirmed_close() decides asynchronously whether to
        # actually tear down (FR-L6, D-28: same confirmation as File > Exit).
        #
        # The one exception: request_confirmed_close()'s own window.destroy()
        # re-fires this same event on Windows. window._wb_close_confirmed
        # marks that re-entrant firing so it is let through instead of
        # starting an unvetoable infinite confirm loop (round-2 finding).
        if getattr(window, '_wb_close_confirmed', False):
            return True
        request_confirmed_close(window)
        return False

    window.events.closing += on_closing

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

        if is_phase6_test:
            def run_phase6():
                test_tmp_dir = tempfile.mkdtemp(prefix="wb-phase6-testdir-")
                test_tmp_dir2 = tempfile.mkdtemp(prefix="wb-phase6-testdir2-")
                try:
                    time.sleep(0.3)
                    suite_path = os.path.join(root_dir, "scripts", "phase6-suite.js")
                    with open(suite_path, "r", encoding="utf-8") as f:
                        suite_code = f.read()
                    window.evaluate_js("window.__testTmpDir = " + json.dumps(test_tmp_dir) + ";")
                    window.evaluate_js("window.__testTmpDir2 = " + json.dumps(test_tmp_dir2) + ";")
                    window.evaluate_js(suite_code)
                    window.evaluate_js("""
                        (async () => {
                            try {
                                const res = await window.__runPhase6TestSuite();
                                window.__phase6Results = JSON.stringify(res);
                            } catch (e) {
                                window.__phase6Results = JSON.stringify({ success: false, results: [{ id: 'RUNNER_ERR', pass: false, msg: String(e) }] });
                            }
                        })();
                    """)
                    for _ in range(150):
                        time.sleep(0.1)
                        res = window.evaluate_js("window.__phase6Results")
                        if res:
                            sys.stdout.write(f"[pywebview] Phase 6 Results: {res}\n")
                            sys.stdout.flush()
                            window.destroy()
                            shutil.rmtree(test_tmp_dir, ignore_errors=True)
                            shutil.rmtree(test_tmp_dir2, ignore_errors=True)
                            os._exit(0)
                            return
                    sys.stderr.write("[pywebview] Error: Phase 6 test timed out waiting for results\n")
                    sys.stderr.flush()
                    window.destroy()
                    shutil.rmtree(test_tmp_dir, ignore_errors=True)
                    shutil.rmtree(test_tmp_dir2, ignore_errors=True)
                    os._exit(1)
                except Exception as e:
                    sys.stderr.write(f"[pywebview] Error executing Phase 6 test: {e}\n")
                    sys.stderr.flush()
                    window.destroy()
                    os._exit(1)
                finally:
                    shutil.rmtree(test_tmp_dir, ignore_errors=True)
                    shutil.rmtree(test_tmp_dir2, ignore_errors=True)

            t = threading.Thread(target=run_phase6, daemon=True)
            t.start()
            return

    window.events.loaded += on_loaded

    webview.start()


if __name__ == "__main__":
    main()
