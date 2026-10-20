// 构建后处理：
// 1. 写入 dist/version.json：记录本次构建时间戳（前端轮询它发现新版本）；
// 2. 把同一个版本号注入 dist/index.html 的 <meta name="app-version">，
//    让每个页面文档自带「我是哪个构建」的标识。
// 为什么必须注入文档而不是用 localStorage 记录：旧 bundle + 文档 HTTP 缓存会
// 「半更新」（reload 前把新版本号写进 localStorage，reload 后仍旧代码），
// 导致页面永远认为自己是最新的，再也收不到后续部署（死锁）。
// meta 方案下，旧文档带的旧版本号与 version.json 永远对不上，必然触发刷新。
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = resolve(__dirname, '..', 'dist')
const payload = { v: String(Date.now()), ts: new Date().toISOString() }
if (!existsSync(dist)) mkdirSync(dist, { recursive: true })
writeFileSync(resolve(dist, 'version.json'), JSON.stringify(payload))

const htmlPath = resolve(dist, 'index.html')
if (existsSync(htmlPath)) {
  const meta = `<meta name="app-version" content="${payload.v}">`
  let html = readFileSync(htmlPath, 'utf8')
  if (html.includes('name="app-version"')) {
    html = html.replace(/<meta name="app-version" content="[^"]*"\s*\/?>/, meta)
  } else {
    html = html.replace('<head>', '<head>\n    ' + meta)
  }
  writeFileSync(htmlPath, html)
}
console.log('[version] wrote', payload.v)
