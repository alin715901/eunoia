import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// 构建后把 dist/assets 里的 sql-wasm-*.wasm 以 <link rel="preload"> 注入 index.html。
// 作用：HTML 解析时就开始并行下载 wasm，不必等主 JS 下载并执行后才发起，
// 首屏时间从「JS 下载 + wasm 下载」串行叠加缩短为两者取最大值。
// 注意：不能加 crossorigin 属性——运行时 fetch(wasmUrl) 是同源 same-origin
// 请求，加了会变成 CORS 模式导致预加载资源不匹配、双重下载。
function wasmPreloadPlugin() {
  return {
    name: 'eunoia:wasm-preload',
    closeBundle() {
      const distDir = fileURLToPath(new URL('./dist', import.meta.url))
      const assetsDir = join(distDir, 'assets')
      let wasmFile = null
      try {
        wasmFile = readdirSync(assetsDir).find((f) => /^sql-wasm-.*\.wasm$/.test(f))
      } catch (_) {
        return
      }
      if (!wasmFile) return
      const htmlPath = join(distDir, 'index.html')
      let html = readFileSync(htmlPath, 'utf8')
      if (html.includes('sql-wasm')) return
      const link = `<link rel="preload" href="./assets/${wasmFile}" as="fetch" type="application/wasm">`
      html = html.replace('</head>', `  ${link}\n  </head>`)
      writeFileSync(htmlPath, html)
      console.log('[wasm-preload] 已注入:', link)
    }
  }
}

// 本地版（local-first）：纯静态应用，无后端。
// 数据跑在浏览器里的 sql.js（WASM SQLite）中，持久化到 IndexedDB。
// GitHub Pages 部署在 /<仓库名>/ 子路径下，由 CI 传入 BASE_PATH（见 .github/workflows/deploy.yml）；
// 本地 dev/preview 不带该变量，base 为 '/'。
// sql.js 的 wasm 走独立文件 + preload（见 db.js loadSqlJs 的历史注释）。
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue(), wasmPreloadPlugin()],
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
