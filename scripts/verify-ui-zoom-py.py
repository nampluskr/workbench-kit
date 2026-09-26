import os
import sys

import webview

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.hosts.pywebview.main import WindowApi


api = WindowApi()
window = webview.create_window('Zoom check', html='<html><body>Zoom check</body></html>', js_api=api)
api.set_window(window)
result = {'ok': False}


def on_loaded():
    try:
        values = [api.zoom(0), api.zoom(-1), api.zoom(1), api.zoom(1), api.zoom(0)]
        expected = [1.0, 0.9, 1.0, 1.1, 1.0]
        if any(value is None or abs(value - target) > 0.01 for value, target in zip(values, expected)):
            raise AssertionError(f'Unexpected zoom factors: {values}')
        print('PASS: pywebview ZoomFactor decreases, increases, and resets', flush=True)
        result['ok'] = True
    except Exception as error:
        print(f'FAIL: {error}', file=sys.stderr, flush=True)
    finally:
        window.destroy()


window.events.loaded += on_loaded
webview.start(private_mode=True)
sys.exit(0 if result['ok'] else 1)
