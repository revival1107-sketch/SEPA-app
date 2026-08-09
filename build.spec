# -*- mode: python ; coding: utf-8 -*-
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

datas = [("static", "static"), ("app/kr_listing.json", "app")]
datas += collect_data_files("curl_cffi")

hiddenimports = []
hiddenimports += collect_submodules("yfinance")
hiddenimports += collect_submodules("curl_cffi")
hiddenimports += collect_submodules("lxml")
hiddenimports += ["webview.platforms.winforms", "webview.platforms.edgechromium"]

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="미너비니종목발굴기",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
