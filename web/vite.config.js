import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 本地版（local-first）：纯静态应用，无后端。
// 数据跑在浏览器里的 sql.js（WASM SQLite）中，持久化到 IndexedDB。
// GitHub Pages 部署在 /<仓库名>/ 子路径下，由 CI 传入 BASE_PATH（见 .github/workflows/deploy.yml）；
// 本地 dev/preview 不带该变量，base 为 '/'。
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    allowedHosts: true // 允许通过远程域名/隧道访问 dev server
  },
  preview: {
    port: 3000,
    allowedHosts: true // 允许通过远程域名/隧道访问 preview 服务
  }
})
