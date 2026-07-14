# MdEditor — Lightweight Local Markdown Editor

> **English** | [简体中文](./README.zh-CN.md)

A lightweight local Markdown viewer & editor for Windows, built with **Tauri 2 + vanilla JS + Vite**.
The packaged exe is only ~11MB — double-click to run, no installation or runtime required.

## ✨ Features

- ✏️ **Edit + live preview (split view)**: edit on the left, rendered preview on the right
- 📂 **Open / save local files**: supports `.md` / `.markdown` / `.txt`
- 📄 **Three modes**: edit only / split / view only (read-only)
- 🎨 **Code highlighting**: highlight.js, supporting dozens of languages
- 🔤 **Auto encoding detection**: UTF-8 / UTF-16 / GBK — no garbled text for Chinese files
- 📎 **Open via double-click**: set as the default `.md` handler, double-click a file to open it (single-instance supported)
- ↗️ **Export to HTML / PDF**
- ⌨️ Shortcuts: `Ctrl+O` open, `Ctrl+S` save

## 🚀 Usage

### Development
```bash
npx tauri dev      # dev mode with hot reload
```

### Build a portable exe
```bash
npx tauri build --no-bundle
# Output: src-tauri/target/release/app.exe (~11MB)
```

The built exe can be copied to any Windows 10 (1903+) / Windows 11 machine and run by double-clicking — no Rust / Node / .NET required.

### Set as the default `.md` handler
Right-click a `.md` file → *Open with* → *Choose another app* → select `MdEditor.exe` → check *Always use this app*.

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | Tauri 2.11 |
| Backend | Rust |
| Frontend | Vanilla JS + Vite |
| Markdown parser | marked 18 |
| Code highlighting | highlight.js 11 |
| File dialogs | @tauri-apps/plugin-dialog |
| File I/O | @tauri-apps/plugin-fs |

## 📁 Project Structure

```
md-editor/
├── index.html              # App shell (toolbar + split edit/preview panes)
├── vite.config.js          # Vite config
├── src/
│   ├── main.js             # Core logic: rendering, file I/O, mode switching, export
│   └── style.css           # Toolbar + split layout + Markdown styles + print styles
└── src-tauri/
    ├── Cargo.toml          # Rust dependencies
    ├── src/lib.rs          # Backend: plugin registration, CLI file args, single-instance
    ├── capabilities/       # Tauri permissions
    └── tauri.conf.json     # App config
```

## ⚠️ Development Notes & Gotchas

> Real issues encountered and solved during development, documented here to save others time.

### 1. Cargo downloads stuck/slow in mainland China
Connecting to crates.io directly is extremely slow or times out. Fixed by configuring `~/.cargo/config.toml` to use the rsproxy.cn mirror.

### 2. Vite watching `src-tauri/` causes an EBUSY crash
The Vite dev server watches the whole project directory by default, but `src-tauri/target/` contains locked DLLs.
**Fix**: add `**/src-tauri/**` to `server.watch.ignored` in `vite.config.js`.

### 3. marked v18 removed the `highlight` option
The `setOptions({ highlight })` API was deprecated in marked v5+ and silently does nothing.
**Fix**: implement highlighting via a custom `renderer.code`.

### 4. Garbled text when opening `.md` files via double-click
`readFile` returns raw bytes unless an encoding is specified, and the frontend must decode them itself.
**Fix**: read as `Uint8Array` + smart `TextDecoder` detection (BOM → strict UTF-8 → GBK fallback).

### 5. ⭐ `forbidden path` error when opening a file via double-click (the trickiest one)
The core challenge when implementing "open associated files by double-clicking", which took a long time to track down:

**The complete chain (every step is required)**:
1. **Read the arg**: `std::env::args().skip(1)` in Rust to get the file path from the command line
2. **Pass it to the frontend**: inject `window.__openedFiles` via `window.eval()` in `setup`
   - ⚠️ Don't use events/emit/invoke — they fail due to timing races
   - ⚠️ Don't use `getCurrentWindow().argv()` — that API doesn't exist in Tauri 2
3. **fs scope authorization** (critical!): `app.fs_scope().allow_file(path)` to add the path to the allowlist
   - ⚠️ Files opened via the dialog are auto-added to the scope, but files passed via the command line / double-click are not
   - Without this step you get `forbidden path` and the frontend `readFile` is rejected
4. **Single instance**: `tauri-plugin-single-instance` prevents duplicate windows; a second double-click calls `window.__openExternal()` via `eval`

Reference: [Tauri official file-associations example](https://github.com/tauri-apps/tauri/blob/dev/examples/file-associations/src-tauri/src/main.rs)

## 📄 License

MIT
