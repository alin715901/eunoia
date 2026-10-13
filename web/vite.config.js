import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// 把 `*.wasm?inline` 的导入在构建期转成 base64 data URL 模块。
// 背景：GitHub Pages CDN 对 sql.js 的 .wasm 响应体会间歇性卡流
// （不报错、不结束，fetch/instantiateStreaming/XHR 全中招，重试也救不回），
// 导致线上白屏。Vite 5 的 asset 插件不认 .wasm 的 `?inline`，故自建此插件，
// 让 wasm 打进 JS bundle，运行时零网络请求。
function wasmInlinePlugin() {
  return {
    name: 'eunoia:wasm-inline',
    enforce: 'pre',
    load(id) {
      const qi = id.indexOf('?')
      if (qi < 0) return null
      const query = id.slice(qi)
      if (!/(?:\?|&)inline(?:&|$)/.test(query)) return null
      let file = id.slice(0, qi)
      if (file.startsWith('/@fs/')) file = file.slice(4) // dev 模式下 node_modules 的 id 前缀
      if (!file.endsWith('.wasm')) return null
      const buf = readFileSync(file)
      return `export default ${JSON.stringify('data:application/wasm;base64,' + buf.toString('base64'))}`
    }
  }
}

// 本地版（local-first）：纯静态应用，无后端。
// 数据跑在浏览器里的 sql.js（WASM SQLite）中，持久化到 IndexedDB。
// GitHub Pages 部署在 /<仓库名>/ 子路径下，由 CI 传入 BASE_PATH（见 .github/workflows/deploy.yml）；
// 本地 dev/preview 不带该变量，base 为 '/'。
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue(), wasmInlinePlugin()],
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
