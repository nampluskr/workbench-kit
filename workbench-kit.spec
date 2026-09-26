# PyInstaller spec for the pywebview host (user request, 2026-09-25 — exe
# packaging alongside the Electron branch's electron-builder config in
# package.json). Builds a one-folder distribution, not one-file: onefile's
# runtime self-extraction adds startup lag and is a second place native
# DLLs (winpty, WebView2's pythonnet/clr_loader bridge) can go missing.
#
# Build with (from the project root, WinPython or any Python with the
# project's requirements.txt installed):
#   npm run build          # dist/ must exist — this bundles it, doesn't build it
#   pyinstaller workbench-kit.spec --noconfirm
# Output: dist-py/workbench-kit/workbench-kit.exe
#
# collect_all() is used for winpty and webview rather than plain
# hiddenimports: both ship native binaries (winpty's *.dll/*.exe/*.pyd,
# webview's platform GUI backend files) as package data that PyInstaller's
# import-graph analysis does not follow on its own.
from PyInstaller.utils.hooks import collect_all

block_cipher = None

datas = [('dist', 'dist')]
binaries = []
hiddenimports = ['winpty', 'clr_loader', 'clr']

for pkg in ('winpty', 'webview', 'clr_loader'):
    pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hiddenimports

a = Analysis(
    ['src/hosts/pywebview/main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='workbench-kit',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='workbench-kit',
)
