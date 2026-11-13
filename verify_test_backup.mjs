/* 全链路验证试验备份文件（用 App 真实依赖 pako + sql.js）：
 * 1) gzip 解码 → JSON 解析 → validateBackup 校验（复刻 App 校验逻辑）
 * 2) 导入去重（复刻 v2.6.1/v2.6.2 的 DEDUP 指纹逻辑）→ 验证掺入的重复行被清掉
 * 3) gzip 后大小报告（压缩收益） */
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire('/workspace/web/package.json')
const pako = require('pako')

const FILE = '/workspace/eunoia-test-100mb.json'
const FILEGZ = '/workspace/eunoia-test-100mb.json.gz'

/* ── 复刻 App 的 validateBackup ── */
function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return '文件不是有效的备份'
  if (obj.format !== 'eunoia-backup') return '不是本应用生成的备份文件'
  if (!obj.tables || typeof obj.tables !== 'object' || Array.isArray(obj.tables)) return '备份文件缺少数据表'
  for (const [t, rows] of Object.entries(obj.tables)) {
    if (!Array.isArray(rows)) return `备份文件损坏：表 ${t} 数据异常`
    if (rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return `备份文件损坏：表 ${t} 存在无效记录`
  }
  if (obj.version > 1) return '备份文件版本过新'
  return null
}

/* ── 与 backupCodec.decodeBackupBinary 相同的解码路径 ── */
function decode(buf) {
  const bytes = new Uint8Array(buf)
  if (bytes.length > 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
    return JSON.parse(pako.ungzip(bytes, { to: 'string' }))
  }
  return JSON.parse(new TextDecoder('utf-8').decode(bytes))
}

/* ── 复刻 DEDUP 指纹（与 backup.service.js 保持一致的关键列）── */
const DEDUP = {
  chat_messages: ['contact_id', 'sender', 'content_type', 'text', 'duration', 'author_member_id', 'is_proactive', 'recalled', 'quote_text', 'created_at'],
  cards: ['group_id', 'owner_contact_id', 'category', 'scope', 'content', 'asset_path', 'duration', 'weight'],
  photo_wall_elements: ['wall_id', 'type', 'x', 'y', 'scale', 'rotation', 'z', 'content', 'font', 'frame', 'created_at'],
  letters: ['contact_id', 'sender', 'opening', 'closing', 'sentences', 'created_at']
}
const fp = (row, cols) => cols.map((c) => (row[c] === null || row[c] === undefined ? '' : String(row[c]))).join('\u0001')

console.log('=== 1) 解压 + 校验 ===')
const t0 = Date.now()
const data = decode(fs.readFileSync(FILEGZ))
const err = validateBackup(data)
if (err) { console.error('FAIL:', err); process.exit(1) }
console.log(`PASS: 解压+解析耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，format=${data.format}`)

console.log('=== 2) 导入去重（DEDUP 指纹）===')
let removed = 0
for (const [t, cols] of Object.entries(DEDUP)) {
  const rows = data.tables[t] || []
  const seen = new Set()
  const kept = rows.filter((r) => { const k = fp(r, cols); if (seen.has(k)) return false; seen.add(k); return true })
  const dup = rows.length - kept.length
  removed += dup
  console.log(`  ${t}: ${rows.length} 行 → ${kept.length} 行（去掉重复 ${dup} 条）`)
}
console.log(`PASS: 共识别重复 ${removed} 条（掺入 30 条显式重复 + 字卡自然重复 ${removed - 30} 条，同组同内容按业务语义即重复）`)
if (removed < 30) { console.error('FAIL: 显式重复未被全部识别'); process.exit(1) }

console.log('=== 3) 压缩收益 ===')
const raw = fs.statSync(FILE).size
const gz = fs.statSync(FILEGZ).size
console.log(`  未压缩 ${(raw / 1048576).toFixed(1)}MB → gzip ${(gz / 1048576).toFixed(1)}MB（${((gz / raw) * 100).toFixed(1)}%）`)
console.log('ALL PASS ✅')
