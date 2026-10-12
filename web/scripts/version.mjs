// 构建后写入 dist/version.json：记录本次构建时间戳。
// 前端会定期拉取 /api/version，发现与上一次不同（说明部署了新版本）就自动刷新，
// 从而在微信等强缓存环境也能拿到最新代码，无需手动 ?v=N。
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = resolve(__dirname, '..', 'dist')
const payload = { v: String(Date.now()), ts: new Date().toISOString() }
if (!existsSync(dist)) mkdirSync(dist, { recursive: true })
writeFileSync(resolve(dist, 'version.json'), JSON.stringify(payload))
console.log('[version] wrote', payload.v)
