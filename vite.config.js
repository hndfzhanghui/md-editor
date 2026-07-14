import { defineConfig } from 'vite'

export default defineConfig({
  // Tauri 使用固定端口，明确指定避免冲突
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // 忽略 Rust 编译产物目录，避免 target 里的 dll 被锁导致监听崩溃
      ignored: ['**/src-tauri/**'],
    },
  },
})
