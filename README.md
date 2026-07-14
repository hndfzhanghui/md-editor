# MdEditor — 轻量级本地 Markdown 编辑器

一个用 **Tauri 2 + 原生 JS + Vite** 打造的轻量级 Windows 本地 Markdown 查看编辑器。
打包后仅 ~11MB，双击即用，无需安装任何运行时。

## ✨ 功能

- ✏️ **编辑 + 实时预览分屏**：左侧编辑，右侧实时渲染
- 📂 **打开/保存本地文件**：支持 `.md` / `.markdown` / `.txt`
- 📄 **三种模式**：纯编辑 / 分屏 / 纯查看（只读）
- 🎨 **代码高亮**：highlight.js，支持几十种语言
- 🔤 **编码自动检测**：UTF-8 / UTF-16 / GBK 自动识别，中文文件不乱码
- 📎 **双击打开**：设为默认程序后，双击 .md 文件直接打开（含单实例）
- ↗️ **导出 HTML / PDF**
- ⌨️ 快捷键：`Ctrl+O` 打开、`Ctrl+S` 保存

## 🚀 使用

### 开发模式
```bash
cd C:\Users\Admin\Projects\md-editor
npx tauri dev      # 开发模式，支持热更新
```

### 打包绿色版 exe
```bash
npx tauri build --no-bundle
# 产物：src-tauri/target/release/app.exe (~11MB)
```

打包后的 exe 拷到任意 Win10/Win11 电脑双击即用（无需 Rust / Node / .NET）。

### 设为默认程序
右键 .md 文件 → 打开方式 → 选择其他应用 → 选 `MdEditor.exe` → 勾选"始终使用此应用"。

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2.11 |
| 后端 | Rust |
| 前端 | 原生 JS + Vite |
| Markdown 解析 | marked 18 |
| 代码高亮 | highlight.js 11 |
| 文件对话框 | @tauri-apps/plugin-dialog |
| 文件读写 | @tauri-apps/plugin-fs |

## 📁 项目结构

```
md-editor/
├── index.html              # 应用骨架（工具栏 + 编辑/预览分屏）
├── vite.config.js          # Vite 配置
├── src/
│   ├── main.js             # 核心逻辑：渲染、文件读写、模式切换、导出
│   └── style.css           # 工具栏 + 分屏 + Markdown 渲染 + 打印样式
└── src-tauri/
    ├── Cargo.toml          # Rust 依赖
    ├── src/lib.rs          # 后端：插件注册、双击文件参数处理、单实例
    ├── capabilities/       # Tauri 权限配置
    └── tauri.conf.json     # 应用配置
```

## ⚠️ 开发踩坑记录

> 这些是实际开发中遇到并解决的问题，记录在此避免重复踩坑。

### 1. 国内 cargo 下载卡死
直连 crates.io 极慢/超时。已配置 `~/.cargo/config.toml` 使用 rsproxy.cn 镜像。

### 2. Vite 监听 src-tauri 导致 EBUSY 崩溃
Vite dev server 默认监听整个项目目录，但 `src-tauri/target/` 里的 dll 被锁。
**解决**：`vite.config.js` 中 `server.watch.ignored` 排除 `**/src-tauri/**`。

### 3. marked v18 移除了 highlight 选项
marked v5+ 废弃了 `setOptions({ highlight })`，静默不生效。
**解决**：通过自定义 `renderer.code` 实现代码高亮。

### 4. 双击 .md 文件打开乱码
`readFile` 不传参数返回原始字节，需前端自行解码。
**解决**：读取 `Uint8Array` + `TextDecoder` 智能检测（BOM → UTF-8 严格 → GBK 兜底）。

### 5. ⭐ 双击文件打开时 readFile 报 forbidden path（最棘手）
这是实现"双击关联文件打开"时遇到的核心问题，排查了很久：

**完整链路**（缺一不可）：
1. **拿参数**：Rust 端 `std::env::args().skip(1)` 读取命令行文件路径
2. **传给前端**：在 setup 里用 `window.eval()` 注入 `window.__openedFiles` 全局变量
   - ⚠️ 不能用事件/emit/invoke——会因时序竞争失败
   - ⚠️ 不能用 `getCurrentWindow().argv()`——Tauri 2 没有这个 API
3. **fs scope 授权**（关键！）：`app.fs_scope().allow_file(path)` 把路径加入白名单
   - ⚠️ 对话框打开的文件会自动加 scope，但命令行/双击传入的路径不会
   - 不加这步会报 `forbidden path`，前端 readFile 被拒
4. **单实例**：`tauri-plugin-single-instance` 避免重复开窗口，第二次双击通过 `eval` 调用 `window.__openExternal()`

参考：[Tauri 官方 file-associations 示例](https://github.com/tauri-apps/tauri/blob/dev/examples/file-associations/src-tauri/src/main.rs)

## 📄 License

MIT
