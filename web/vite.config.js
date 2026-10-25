import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// 把 `*.wasm?inline` 的导入在构建期转成 base64 data URL 模块。
// 背景：GitHub Pages CDN 对 .wasm 响应体会卡流（不报错、不结束，
// 重试也救不回），且主 bundle 内联 base64 会膨胀 857KB。
// 故 wasm 数据经 src/local/wasm-data.js 这个独立模块动态 import，
// Rollup 将其拆为独立 .js chunk 并行下载（.js 不受卡流影响）。
// Vite 5 的 asset 插件不认 .wasm 的 `?inline`，故自建此插件。
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

// 构建后把 dist/assets 里的 wasm-data-*.js chunk 以 <link rel="modulepreload">
// 注入 index.html：HTML 解析时即开始并行下载，与主 bundle 时间重叠，
// 不必等主 JS 执行到动态 import 才发起。
function wasmPreloadPlugin() {
  let resolvedConfig = null
  return {
    name: 'eunoia:wasm-preload',
    configResolved(c) { resolvedConfig = c },
    closeBundle() {
      const distDir = fileURLToPath(new URL('./dist', import.meta.url))
      const assetsDir = join(distDir, 'assets')
      let wasmChunk = null
      try {
        wasmChunk = readdirSync(assetsDir).find((f) => /^wasm-data-.*\.js$/.test(f))
      } catch (_) {
        return
      }
      if (!wasmChunk) return
      const htmlPath = join(distDir, 'index.html')
      let html = readFileSync(htmlPath, 'utf8')
      if (html.includes('wasm-data-')) return
      /* 必须用 base 拼绝对路径：GitHub Pages 用 404.html 做 SPA 回退，
         回退页在 /子路径/ 下被打开时，相对路径会解析到 /子路径/assets/… 而 404，
         表现为「深链接刷新后卡在启动屏」。 */
      const base = ((resolvedConfig && resolvedConfig.base) || '/').replace(/\/*$/, '/')
      const link = `<link rel="modulepreload" href="${base}assets/${wasmChunk}">`
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
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue(), wasmInlinePlugin(), wasmPreloadPlugin()],
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
