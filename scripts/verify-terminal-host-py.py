import tempfile
import threading
import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.hosts.pywebview.main import WindowApi


class RecordingWindow:
    def __init__(self):
        self.calls = []
        self.lock = threading.Lock()

    def evaluate_js(self, script):
        with self.lock:
            self.calls.append(script)

    def saw(self, marker):
        with self.lock:
            return any(marker in script for script in self.calls)


def main():
    api = WindowApi()
    window = RecordingWindow()
    api.set_window(window)
    with tempfile.TemporaryDirectory(prefix='wb-terminal-host-py-') as cwd:
        terminal_id = api.terminal_start('cmd', cwd)
        time.sleep(1.5)
        initial = api.terminal_read(terminal_id)
        api.terminal_write(terminal_id, 'echo WB_HOST_PUSH_CHECK\r')
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not window.saw('WB_HOST_PUSH_CHECK'):
            time.sleep(0.05)
        pushed = window.saw('WB_HOST_PUSH_CHECK')
        no_buffered_duplicate = api.terminal_read(terminal_id)['output'] == ''
        api.terminal_close(terminal_id)
        closed = terminal_id not in api._terminals
        second_id = api.terminal_start('cmd', cwd)
        api.cleanup_terminals()
        cleanup = second_id not in api._terminals
    result = {
        'started': bool(terminal_id),
        'initialReadWorked': isinstance(initial['output'], str),
        'pushed': pushed,
        'noBufferedDuplicate': no_buffered_duplicate,
        'closed': closed,
        'cleanup': cleanup,
    }
    print(result)
    if not all(result.values()):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
