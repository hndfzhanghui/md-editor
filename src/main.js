import './style.css'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { listen } from '@tauri-apps/api/event'

// ---------------------------------------------------------------------------
// Markdown 渲染配置：marked + highlight.js 代码高亮
// marked v5+ 移除了 highlight 选项，需通过自定义 renderer.code 实现
// ---------------------------------------------------------------------------
const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
}
marked.setOptions({ breaks: true, gfm: true, renderer })

// ---------------------------------------------------------------------------
// 应用状态
// ---------------------------------------------------------------------------
const state = {
  filePath: null,   // 当前打开文件的绝对路径，null 表示未保存的新文件
  dirty: false,     // 是否有未保存修改
  mode: 'split',    // 'split' | 'view' | 'edit'
}

// ---------------------------------------------------------------------------
// DOM 引用
// ---------------------------------------------------------------------------
const $editor = document.getElementById('editor')
const $preview = document.getElementById('preview')
const $filename = document.getElementById('filename')
const $dirty = document.getElementById('dirty')
const $content = document.getElementById('content')
const $gutter = document.getElementById('gutter')
const $editorPane = document.querySelector('.editor-pane')

// ---------------------------------------------------------------------------
// 实时预览：把编辑器内容渲染到预览区
// ---------------------------------------------------------------------------
function renderPreview() {
  $preview.innerHTML = marked.parse($editor.value) || '<p class="placeholder">预览区</p>'
}

// ---------------------------------------------------------------------------
// 脏标记 & 标题更新
// ---------------------------------------------------------------------------
function setDirty(v) {
  state.dirty = v
  $dirty.classList.toggle('hidden', !v)
}
function updateTitle() {
  const name = state.filePath ? state.filePath.replace(/^.*[\\/]/, '') : '未命名.md'
  $filename.textContent = name
}

// ---------------------------------------------------------------------------
// 编码检测：从原始字节智能解码为字符串
// 顺序：BOM(UTF-8/UTF-16) -> UTF-8(严格校验) -> GBK 兜底
// 解决 Windows 中文系统下 GBK 编码的 md 文件被当 UTF-8 解析导致的乱码
// ---------------------------------------------------------------------------
function decodeBytes(bytes) {
  // 1) BOM 检测
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3)) // UTF-8 BOM
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2)) // UTF-16 LE BOM
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2)) // UTF-16 BE BOM
  }
  // 2) 尝试严格 UTF-8 解码，成功则采用
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // 3) 非 UTF-8，按 GBK（中文 Windows 常见编码）兜底
    return new TextDecoder('gbk').decode(bytes)
  }
}

// ---------------------------------------------------------------------------
// 打开文件
// ---------------------------------------------------------------------------
// 按指定路径加载文件（编码检测后填充编辑器）
// 被「打开按钮」和「双击文件启动」共用
// ---------------------------------------------------------------------------
async function loadPath(path) {
  try {
    const bytes = await readFile(path)
    $editor.value = decodeBytes(bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes))
    state.filePath = path
    setDirty(false)
    updateTitle()
    renderPreview()
  } catch (err) {
    alert(`无法打开文件：\n${path}\n\n${err?.message || err}`)
  }
}

// ---------------------------------------------------------------------------
async function openFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  })
  if (!selected) return
  await loadPath(selected)
}

// ---------------------------------------------------------------------------
// 保存文件（有路径则覆盖，无路径则另存为）
// ---------------------------------------------------------------------------
async function saveFile() {
  let path = state.filePath
  if (!path) {
    path = await save({
      defaultPath: '未命名.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (!path) return
  }
  await writeFile(path, $editor.value)
  state.filePath = path
  setDirty(false)
  updateTitle()
}

// ---------------------------------------------------------------------------
// 模式切换：分屏 / 纯查看 / 纯编辑（三选一，点哪个切哪个）
// ---------------------------------------------------------------------------
const $btnView = document.getElementById('btn-view')
const $btnSplit = document.getElementById('btn-split')
const $btnEdit = document.getElementById('btn-edit')
function applyMode() {
  $content.classList.remove('mode-split', 'mode-view', 'mode-edit')
  $content.classList.add('mode-' + state.mode)
  // 查看模式下编辑器只读
  $editor.readOnly = state.mode === 'view'
  // 高亮当前模式按钮
  $btnSplit.classList.toggle('active', state.mode === 'split')
  $btnView.classList.toggle('active', state.mode === 'view')
  $btnEdit.classList.toggle('active', state.mode === 'edit')
}
function setMode(mode) {
  state.mode = mode
  applyMode()
}

// ---------------------------------------------------------------------------
// 导出 HTML：把渲染后的 HTML 包装成独立可打开的文件
// ---------------------------------------------------------------------------
async function exportHtml() {
  const path = await save({
    defaultPath: (state.filePath || '未命名').replace(/\.(md|markdown|txt)$/, '') + '.html',
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })
  if (!path) return
  const css = getPreviewStyles()
  const bodyHtml = marked.parse($editor.value)
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${$filename.textContent}</title>
<style>${css}</style>
</head>
<body>
<article class="markdown-body">
${bodyHtml}
</article>
</body>
</html>`
  await writeFile(path, html)
}

// 抓取预览区当前生效的样式（内联代码高亮样式 + markdown-body 样式）
function getPreviewStyles() {
  let css = ''
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += rule.cssText + '\n'
    } catch {
      // 跨域样式表无法读取，跳过
    }
  }
  return css
}

// ---------------------------------------------------------------------------
// 导出 PDF：复用浏览器打印，弹窗后用户选"另存为 PDF"
// Tauri 的 webview 支持原生打印对话框
// ---------------------------------------------------------------------------
async function exportPdf() {
  // 临时把预览区全屏化以便打印，打印后还原
  const original = $content.className
  $content.className = 'content mode-print'
  window.print()
  $content.className = original
}

// ---------------------------------------------------------------------------
// 事件绑定
// ---------------------------------------------------------------------------
$editor.addEventListener('input', () => {
  setDirty(true)
  renderPreview()
})

document.getElementById('btn-open').addEventListener('click', openFile)
document.getElementById('btn-save').addEventListener('click', saveFile)
$btnSplit.addEventListener('click', () => setMode('split'))
$btnView.addEventListener('click', () => setMode('view'))
$btnEdit.addEventListener('click', () => setMode('edit'))
document.getElementById('btn-export-html').addEventListener('click', exportHtml)
document.getElementById('btn-export-pdf').addEventListener('click', exportPdf)

// 快捷键
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key === 's') { e.preventDefault(); saveFile() }
  else if (e.key === 'o') { e.preventDefault(); openFile() }
})

// ---------------------------------------------------------------------------
// 初始化：加载一份示例内容
// ---------------------------------------------------------------------------
function loadDemo() {
  $editor.value = `# Markdown 编辑器

一个用 **Tauri 2 + 原生 JS** 打造的轻量级本地 Markdown 查看编辑器。

## 功能

- 实时预览（左侧编辑 / 右侧渲染）
- 打开与保存本地 \`.md\` 文件
- 查看模式（只读）
- 代码高亮
- 导出 HTML / PDF

## 代码高亮示例

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`)
}
greet('World')
\`\`\`

## 表格

| 快捷键 | 功能 |
|--------|------|
| Ctrl+O | 打开 |
| Ctrl+S | 保存 |

> 点击工具栏按钮即可切换模式或导出。
`
  renderPreview()
}

// ---------------------------------------------------------------------------
// 启动流程：
// 1) Rust 端在窗口创建时通过 eval 注入 window.__openedFiles（双击文件启动）
// 2) 单实例场景下，Rust 通过 window.__openExternal() 回调通知前端打开新文件
// 没有启动文件则加载示例内容
// ---------------------------------------------------------------------------
async function bootstrap() {
  applyMode()
  updateTitle()

  // 暴露给 Rust 端单实例回调：程序已运行时再次双击文件
  window.__openExternal = (path) => {
    if (path) loadPath(path).catch(console.error)
  }

  // 读取 Rust 注入的启动文件路径
  const opened = window.__openedFiles
  if (Array.isArray(opened) && opened.length > 0) {
    // 调试：loadPath 失败时会把错误信息显示在编辑器
    loadPath(opened[0]).catch(() => {})
    return
  }
  loadDemo()
}

bootstrap()
