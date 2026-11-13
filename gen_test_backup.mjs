/* 生成一份结构真实、约 100MB 的试验备份文件（eunoia-test-100mb.json）
 * 表结构直接从 schema.sql 解析（列名 + 外键），保证 validateBackup / importBackup 能识别。
 * 内容模拟真实膨胀场景：聊天图片/语音 base64 dataURL（不可压缩，与真实一致）、
 * 照片墙元素大图、字卡图片；并故意掺入少量完全重复的行，用于验证导入去重。 */
import fs from 'node:fs'
import crypto from 'node:crypto'

const schema = fs.readFileSync('/workspace/web/src/local/schema.sql', 'utf-8')
  + fs.readFileSync('/workspace/web/src/local/migrate.js', 'utf-8')

/* 解析 CREATE TABLE IF NOT EXISTS <name> ( ... ); */
function parseTables(sql) {
  const tables = {}
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\)\s*;?/g
  let m
  while ((m = re.exec(sql))) {
    const name = m[1]
    const body = m[2]
    const cols = []
    const fks = {}
    for (let line of body.split('\n')) {
      line = line.trim().replace(/--.*$/, '').trim().replace(/,$/, '').trim()
      if (!line) continue
      if (/^(FOREIGN KEY|PRIMARY KEY|UNIQUE|CHECK)\b/i.test(line)) {
        const fk = /FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s*(\w+)/i.exec(line)
        if (fk) fks[fk[1]] = fk[2]
        continue
      }
      const cm = /^(\w+)\s+(\w+[^,]*?)(\s+DEFAULT\s+([^,]+))?(\s+NULL)?$/.exec(line)
        || /^(\w+)\s+(\w+)/.exec(line)
      if (cm) cols.push({ name: cm[1], type: (cm[2] || '').toUpperCase() })
    }
    tables[name] = { cols, fks }
  }
  return tables
}

const T = parseTables(schema)
let seed = 42
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const ts0 = 1700000000000
let now = ts0
const tick = () => (now += 30000)

/* 生成一段不可压缩的 base64 dataURL（真实 JPEG 的 base64 就是「压缩过的字节再编码」，
 * gzip 只能把 base64 收回约 3/4，这里用 crypto 随机字节得到同样的不可再压特性） */
function dataURL(kb, mime) {
  const raw = Math.round(kb * 1024 * 3 / 4) // base64 后约 kb KB
  return `data:${mime};base64,${crypto.randomBytes(raw).toString('base64')}`
}
let loremIdx = 0
const LOREMS = [
  '今天也想你，特别是傍晚风起的时候，路边的灯一盏一盏亮起来，像慢慢靠近的心跳。',
  '记一下：明天记得带伞，天气预报说有雨，别再淋湿了，上次感冒拖了很久才好。',
  '我们把周末的计划定下来吧，早上八点起床吃早餐，然后去江边走一走，中午吃你喜欢的酸汤鱼。',
  '深夜写下的这句话，可能你明天才看到，但我想让你知道，无论多晚，我都在这里。',
  '字卡抽到的这句话很准，说的是我此刻的心情，所以立刻发给你，想看看你的反应。'
]
const lorem = () => LOREMS[(loremIdx++) % LOREMS.length]

/* 体积参数（可调） */
const P = {
  chats: 1600,        // 聊天消息总数
  chatImgKB: 60,      // 图片消息 dataURL 大小(KB)
  chatVoiceKB: 46,    // 语音消息大小(KB)
  quoteImgKB: 18,     // 引用缩略图大小(KB)
  imgPct: 0.40, voicePct: 0.30,
  elements: 220, elemKB: 52,  // 照片墙元素
  cards: 500, cardImgPct: 0.4, cardImgKB: 30,
  letters: 120, moments: 100, favorites: 200, songs: 60, divinations: 80
}

const tables = {}

function rowOf(t, i, ctx = {}) {
  const { cols, fks } = T[t]
  const r = {}
  for (const c of cols) {
    const n = c.name
    if (n === 'id') { r.id = i; continue }
    if (fks[n]) {
      const target = fks[n] === 'chat_messages' ? (ctx.selfId || i) : (ctx[fks[n]] !== undefined ? ctx[fks[n]] : 1)
      r[n] = c.type.includes('NULL') && rnd() < 0.3 ? null : target
      continue
    }
    if (/created_at|updated_at/.test(n)) { r[n] = tick(); continue }
    if (n === 'seq' || n === 'weight' || n === 'z') { r[n] = i % 100; continue }
    if (c.type.startsWith('REAL')) { r[n] = 1; continue }
    if (c.type.startsWith('INTEGER')) {
      if (n === 'duration') { r[n] = c.type.includes('NULL') ? 5 : 5; continue }
      r[n] = c.type.includes('NULL') ? (rnd() < 0.5 ? null : 1) : 1
      continue
    }
    /* TEXT */
    const isBlobField = (t === 'chat_messages' && (n === 'asset_path' || n === 'quote_image')) ||
      (t === 'photo_wall_elements' && n === 'content') ||
      (t === 'cards' && n === 'asset_path') ||
      (t === 'moments' && n === 'asset_path') ||
      (t === 'letters' && n === 'asset_path')
    if (isBlobField && rnd() < 0.8) { r[n] = dataURL(30, 'image/jpeg'); continue }
    if (n === 'sender') { r[n] = i % 2 ? 'me' : 'them'; continue }
    if (n === 'content_type') { r[n] = ctx.type || 'text'; continue }
    if (n === 'kind') { r[n] = 'person'; continue }
    if (n === 'name') { r[n] = ctx.name || `联系人${i}`; continue }
    if (n === 'module') { r[n] = ctx.module || 'album'; continue }
    if (n === 'title' || n === 'category') { r[n] = `分类${i % 5}`; continue }
    if (n === 'text') { r[n] = ctx.type === 'image' || ctx.type === 'voice' ? '' : lorem(); continue }
    if (/quote_text|content|sentences|opening|closing|body/.test(n)) { r[n] = lorem(); continue }
    if (c.type.includes('NULL') && rnd() < 0.4) { r[n] = null; continue }
    r[n] = lorem().slice(0, 20)
  }
  return r
}

/* contacts（FK 锚点） */
tables.contacts = [rowOf('contacts', 1, { name: '小星' }), rowOf('contacts', 2, { name: '家人群', module: undefined })]
tables.contacts[1].kind = 'group'
tables.contact_members = [rowOf('contact_members', 1, { contacts: 1 }), rowOf('contact_members', 2, { contacts: 2 })]
tables.contact_settings = [rowOf('contact_settings', 1)]
tables.contact_desktop = [rowOf('contact_desktop', 1)]
tables.card_groups = [1, 2, 3].map((i) => rowOf('card_groups', i))
tables.cards = []
for (let i = 1; i <= P.cards; i++) {
  const hasImg = rnd() < P.cardImgPct
  const r = rowOf('cards', i, { cards: hasImg ? 'IMG' : undefined })
  if (hasImg) r.asset_path = dataURL(P.cardImgKB, 'image/jpeg')
  else r.asset_path = null
  r.group_id = (i % 3) + 1
  tables.cards.push(r)
}
/* 故意掺 10 条完全重复的字卡（content 相同） */
for (let i = 0; i < 10; i++) { const d = { ...tables.cards[i] }; d.id = P.cards + i + 1; tables.cards.push(d) }

tables.chat_messages = []
for (let i = 1; i <= P.chats; i++) {
  const u = rnd()
  const type = u < P.imgPct ? 'image' : u < P.imgPct + P.voicePct ? 'voice' : 'text'
  const ctx = { contact_id: 1, type, selfId: i }
  const r = rowOf('chat_messages', i, ctx)
  r.contact_id = (i % 10 === 0) ? 2 : 1
  r.asset_path = type === 'image' ? dataURL(P.chatImgKB, 'image/jpeg') : type === 'voice' ? dataURL(P.chatVoiceKB, 'audio/mp4') : null
  r.text = type === 'text' ? lorem() : ''
  r.sender = i % 2 ? 'me' : 'them'
  if (rnd() < 0.15) r.quote_image = dataURL(P.quoteImgKB, 'image/jpeg')
  tables.chat_messages.push(r)
}
/* 故意掺 20 条完全重复的聊天（模拟旧「合并=复制」已写进备份的重复） */
for (let i = 0; i < 20; i++) { const d = { ...tables.chat_messages[i] }; d.id = P.chats + i + 1; tables.chat_messages.push(d) }

tables.favorites = Array.from({ length: P.favorites }, (_, i) => rowOf('favorites', i + 1, { chat_messages: (i % P.chats) + 1 }))
tables.wallets = [1, 2].map((i) => rowOf('wallets', i))
tables.red_packet_grabs = Array.from({ length: 30 }, (_, i) => rowOf('red_packet_grabs', i + 1, { chat_messages: i + 1 }))
tables.poke_library = Array.from({ length: 15 }, (_, i) => rowOf('poke_library', i + 1))
tables.moments = Array.from({ length: P.moments }, (_, i) => rowOf('moments', i + 1))
tables.moment_interactions = Array.from({ length: 100 }, (_, i) => rowOf('moment_interactions', i + 1, { moments: (i % P.moments) + 1 }))
tables.letters = Array.from({ length: P.letters }, (_, i) => rowOf('letters', i + 1))
tables.divinations = Array.from({ length: P.divinations }, (_, i) => rowOf('divinations', i + 1))
tables.global_settings = Array.from({ length: 40 }, (_, i) => rowOf('global_settings', i + 1, { name: undefined }))
  .map((r, i) => ({ ...r, name: `setting_key_${i}`, value: '1' }))
tables.proactive_jobs = Array.from({ length: 20 }, (_, i) => rowOf('proactive_jobs', i + 1))
tables.group_member_settings = [1, 2].map((i) => rowOf('group_member_settings', i))
tables.anniversaries = Array.from({ length: 10 }, (_, i) => rowOf('anniversaries', i + 1))
tables.songs = Array.from({ length: P.songs }, (_, i) => rowOf('songs', i + 1))
tables.song_favs = Array.from({ length: 30 }, (_, i) => rowOf('song_favs', i + 1, { songs: (i % P.songs) + 1 }))
tables.companion_invites = Array.from({ length: 10 }, (_, i) => rowOf('companion_invites', i + 1, { chat_messages: i + 1 }))
tables.listen_together = Array.from({ length: 10 }, (_, i) => rowOf('listen_together', i + 1, { songs: (i % P.songs) + 1 }))
tables.cinema_together = Array.from({ length: 10 }, (_, i) => rowOf('cinema_together', i + 1, { chat_messages: i + 1 }))
tables.app_items = Array.from({ length: 40 }, (_, i) => rowOf('app_items', i + 1))
tables.photo_walls = [1, 2, 3].map((i) => rowOf('photo_walls', i, { name: `相册${i}` }))
tables.photo_wall_elements = []
for (let i = 1; i <= P.elements; i++) {
  const r = rowOf('photo_wall_elements', i, {})
  r.wall_id = (i % 3) + 1
  r.type = i % 3 === 0 ? 'text' : 'image'
  r.content = r.type === 'image' ? dataURL(P.elemKB, 'image/jpeg') : lorem()
  tables.photo_wall_elements.push(r)
}

/* 只保留 schema 中真实存在的表 */
const payload = { app: 'eunoia', format: 'eunoia-backup', version: 1, created_at: Date.now(), scope: {}, ref: {}, tables: {} }
for (const [t, rows] of Object.entries(tables)) if (T[t]) payload.tables[t] = rows

const json = JSON.stringify(payload)
fs.writeFileSync('/workspace/eunoia-test-100mb.json', json)
console.log('行数统计:')
for (const [t, rows] of Object.entries(payload.tables)) console.log(`  ${t}: ${rows.length}`)
console.log('文件大小:', (fs.statSync('/workspace/eunoia-test-100mb.json').size / 1024 / 1024).toFixed(1), 'MB')
