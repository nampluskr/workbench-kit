"""Restore native window management behaviors for frameless windows on Windows.

pywebview creates frameless windows using WinForms FormBorderStyle.None.
This removes WS_THICKFRAME and WS_MAXIMIZEBOX styles, disabling Aero Snap
(Win+arrows, screen edge drag) and causing maximize/restore inconsistencies.

This module restores both window styles and handles WM_NCCALCSIZE by returning 0
to eliminate the non-client area. This maintains the frameless visual style while
restoring native snap and maximize window management behaviors.

Edge-drag resize is NOT handled here. WS_THICKFRAME's usual resize-by-edge relies
on Windows' own hit-testing against the non-client area this module zeroes out,
and even patching WM_NCHITTEST to recompute it does not help: the WebView2 child
control covers the window pixel-for-pixel, so real mouse input at the edge is
resolved to that child (a separate hwnd, possibly a separate process) and never
reaches this Form's window procedure at all (confirmed by simulating an actual
OS-level mouse drag — the hit-test patch worked when a message was sent directly
to this hwnd, but did nothing for a real drag). Resize is instead driven from
JS mouse coordinates calling window.resize()/window.move() directly (see
WindowApi.get_window_bounds/set_window_bounds in main.py, and the resize-grip
elements + core/window.ts on the frontend) — entirely inside the same renderer
that already owns real mouse capture, rather than fighting across the child
window boundary for it.

This code interacts directly with Windows and WinForms APIs, residing strictly
in host-specific code (D-20).
"""
import ctypes
from ctypes import wintypes


_GWL_STYLE = -16
_GWLP_WNDPROC = -4
_WS_THICKFRAME = 0x00040000
_WS_MAXIMIZEBOX = 0x00010000
_WM_NCCALCSIZE = 0x0083
# SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_FRAMECHANGED
_SWP_FLAGS = 0x0001 | 0x0002 | 0x0004 | 0x0020

_LRESULT = ctypes.c_ssize_t
_WNDPROC = ctypes.WINFUNCTYPE(
    _LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM
)

# Hold subclass callback references to prevent garbage collection and procedure corruption.
_installed = {}


def _prepare(user32):
    user32.GetWindowLongPtrW.restype = ctypes.c_void_p
    user32.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.SetWindowLongPtrW.restype = ctypes.c_void_p
    user32.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
    user32.CallWindowProcW.restype = _LRESULT
    user32.CallWindowProcW.argtypes = [
        ctypes.c_void_p, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM
    ]
    user32.SetWindowPos.argtypes = [
        wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, wintypes.UINT
    ]


def patch_drag_move():
    """Work around pywebview 6.2.1 WinForms move() ctypes argument error.

    When dragging a frameless window, pywebview calls SetWindowPos with None
    for width and height, causing a ctypes.ArgumentError with SWP_NOSIZE.
    This patch replaces move() to pass integer 0 instead.
    """
    try:
        from webview.platforms import winforms
    except Exception:
        return

    form = winforms.BrowserView.BrowserForm
    if getattr(form, "_drag_move_patched", False):
        return

    _SWP_NOSIZE_NOZORDER_SHOW = 0x0001 | 0x0004 | 0x0040

    def move(self, x, y):
        scale = self._scale
        ctypes.windll.user32.SetWindowPos(
            self.Handle.ToInt32(), None,
            int(x * scale), int(y * scale), 0, 0,
            _SWP_NOSIZE_NOZORDER_SHOW,
        )

    form.move = move
    form._drag_move_patched = True


def enable_native_window_management(hwnd):
    """Restore native snap, maximize, and restore window styles while hiding titlebar."""
    hwnd = int(hwnd)
    if hwnd in _installed:
        return

    user32 = ctypes.windll.user32
    _prepare(user32)

    style = user32.GetWindowLongPtrW(wintypes.HWND(hwnd), _GWL_STYLE)
    user32.SetWindowLongPtrW(
        wintypes.HWND(hwnd), _GWL_STYLE, style | _WS_THICKFRAME | _WS_MAXIMIZEBOX
    )

    original = user32.GetWindowLongPtrW(wintypes.HWND(hwnd), _GWLP_WNDPROC)

    def _wndproc(window, message, wparam, lparam):
        if message == _WM_NCCALCSIZE and wparam:
            return 0  # No non-client area -> keeps frameless appearance without restoring titlebar/borders
        return user32.CallWindowProcW(original, window, message, wparam, lparam)

    proc = _WNDPROC(_wndproc)
    _installed[hwnd] = (proc, original)
    user32.SetWindowLongPtrW(
        wintypes.HWND(hwnd), _GWLP_WNDPROC, ctypes.cast(proc, ctypes.c_void_p)
    )
    user32.SetWindowPos(wintypes.HWND(hwnd), None, 0, 0, 0, 0, _SWP_FLAGS)
