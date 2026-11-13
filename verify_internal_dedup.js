/* 验证新增的「导入前备份内部去重」(dedupeIncoming) + 既有「本地去重」：
 * 构造一份「自带内部重复」的备份（模拟旧 bug 把数据整表复制），分别走
 *   1) 合并到空库（本地无对应行 → 必须靠内部去重才能不重复）
 *   2) 覆盖导入（先删后灌、原本不去重 → 必须靠内部去重才能不重复）
 * 断言：导入后各表行数 = 唯一内容行数，且跨表外键（收藏→消息）仍指向保留行。
 * 另含「合并到已含相同数据的新库」回归：二次合并不再重复。 */
const initSqlJs = require('/workspace/web/node_modules/sql.js/dist/sql-wasm.js')

const SCHEMA = `
CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, name TEXT);
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, sender TEXT, content_type TEXT, text TEXT, duration INTEGER, author_member_id INTEGER, is_proactive INTEGER, recalled INTEGER, quote_text TEXT, created_at INTEGER);
CREATE TABLE favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, sender TEXT, content_type TEXT, text TEXT, message_id INTEGER, created_at INTEGER);
CREATE TABLE letters (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, sender TEXT, opening TEXT, closing TEXT, sentences TEXT, created_at INTEGER);
CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, owner_contact_id INTEGER, category TEXT, content TEXT, created_at INTEGER);
CREATE TABLE card_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_contact_id INTEGER, category TEXT, scope TEXT, name TEXT, created_at INTEGER);
CREATE TABLE app_items (id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT, contact_id INTEGER, title TEXT, body TEXT, created_at INTEGER);
`
const DEDUP = {
  chat_messages: ['contact_id', 'sender', 'content_type', 'text', 'duration', 'author_member_id', 'is_proactive', 'recalled', 'quote_text', 'created_at'],
  favorites: ['contact_id', 'sender', 'content_type', 'text', 'created_at'],
  letters: ['contact_id', 'sender', 'opening', 'closing', 'sentences', 'created_at'],
  cards: ['group_id', 'owner_contact_id', 'category', 'content', 'duration', 'blocked', 'created_at'],
  card_groups: ['owner_contact_id', 'category', 'scope', 'name', 'created_at'],
  app_items: ['module', 'contact_id', 'title', 'body', 'created_at'],
}
const ID_TABLES = { contacts: 'id', chat_messages: 'id', favorites: 'id', letters: 'id', cards: 'id', card_groups: 'id', app_items: 'id' }
const REFS = {
  chat_messages: { contact_id: 'contacts' },
  favorites: { contact_id: 'contacts', message_id: 'chat_messages' },
  letters: { contact_id: 'contacts' },
  cards: { group_id: 'card_groups' },
  card_groups: { owner_contact_id: 'contacts' },
  app_items: { contact_id: 'contacts' },
}
function normFp(v) { if (v === null || v === undefined) return ''; return String(v) }
function qall(db, sql, params) { const s = db.prepare(sql); if (params) s.bind(params); const r = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r }
function q1(db, sql, params) { const r = qall(db, sql, params); return r.length ? r[0] : null }
function localCols(db, t) { const m = new Map(); for (const c of qall(db, `PRAGMA table_info(${t})`)) m.set(c.name, true); return m }
function zeroOrNull() { return 0 }

// ── 复刻 dedupeIncoming（仅作用于传入 tables，不改本地）──
function dedupeIncoming(db, tables, known) {
  const remaps = {}
  for (const t of known) {
    const cols = DEDUP[t]; const pk = ID_TABLES[t]
    if (!cols || !pk) continue
    const rows = tables[t]
    if (!rows || rows.length < 2) continue
    const validCols = cols.filter((c) => localCols(db, t).has(c))
    if (validCols.length < cols.length) continue
    const seen = new Map(); const remap = new Map(); const kept = []
    for (const row of rows) {
      const fp = validCols.map((c) => normFp(row[c])).join('\u0001')
      const hit = seen.get(fp)
      if (hit === undefined) { seen.set(fp, row[pk]); kept.push(row) }
      else remap.set(row[pk], hit)
    }
    if (remap.size) { tables[t] = kept; remaps[t] = remap }
  }
  for (const t of known) {
    const remap = remaps[t]; if (!remap) continue
    const refs = REFS[t] || {}
    for (const r of tables[t]) {
      for (const [col, target] of Object.entries(refs)) {
        const v = r[col]
        if (v === null || v === undefined || v === '') continue
        const nv = Number(v)
        const tgt = remaps[target]
        if (tgt && tgt.has(nv)) r[col] = tgt.get(nv)
      }
    }
  }
}
// 复刻 applyMerge 的本地去重 + 插入（id 重映射 + 内容去重）
function matchContact(db, row) { const name = String(row.name || '').trim(); if (!name) return null; const hit = q1(db, `SELECT id FROM contacts WHERE kind=? AND TRIM(name)=? ORDER BY id LIMIT 1`, [row.kind || 'person', name]); return hit ? hit.id : null }
function buildLocalDedup(db, t, cols, pk) { const m = new Map(); for (const r of qall(db, `SELECT ${pk}, ${cols.join(', ')} FROM ${t}`)) { const fp = cols.map((c) => normFp(r[c])).join('\u0001'); if (!m.has(fp)) m.set(fp, r[pk]) } return m }
function incomingFp(db, t, row, cols, maps, refs) { return cols.map((c) => { let v = row[c]; const target = refs[c]; if (target) { if (v === null || v === undefined || v === '') return ''; const nv = Number(v); const mp = maps[target]; v = mp && mp.has(nv) ? mp.get(nv) : zeroOrNull() } return normFp(v) }).join('\u0001') }
function applyMerge(db, tables) {
  const known = Object.keys(tables).filter((t) => ID_TABLES[t])
  const maps = {}; const skip = new Set()
  for (const t of known) { const pk = ID_TABLES[t]; const map = new Map(); let next = (q1(db, `SELECT COALESCE(MAX(${pk}),0) m FROM ${t}`).m || 0) + 1; for (const row of tables[t]) { const old = row[pk]; if (t === 'contacts') { const hit = matchContact(db, row); if (hit) { map.set(old, hit); skip.add(`contacts:${old}`); continue } } map.set(old, next++) } maps[t] = map }
  const localDedup = {}
  for (const t of known) { if (!DEDUP[t]) continue; const pk = ID_TABLES[t]; const cols = DEDUP[t].filter((c) => localCols(db, t).has(c)); if (cols.length < DEDUP[t].length) continue; localDedup[t] = buildLocalDedup(db, t, cols, pk) }
  for (const t of known) {
    const rows = tables[t]; if (!rows.length) continue
    const pk = ID_TABLES[t]; const refs = REFS[t] || {}
    const dedupCols = localDedup[t] ? DEDUP[t].filter((c) => localCols(db, t).has(c)) : null
    for (const row of rows) {
      if (pk) { if (skip.has(`${t}:${row[pk]}`)) continue; if (dedupCols && localDedup[t]) { const fp = incomingFp(db, t, row, dedupCols, maps, refs); const lid = localDedup[t].get(fp); if (lid !== undefined) { maps[t].set(row[pk], lid); skip.add(`${t}:${row[pk]}`); continue } } }
      const cols = localCols(db, t); const useCols = Object.keys(row).filter((c) => cols.has(c))
      const sql = `INSERT INTO ${t} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`
      const vals = useCols.map((c) => { if (pk && c === pk) { const m = maps[t].get(row[pk]); return m === undefined ? row[c] : m } const target = refs[c]; let v = row[c]; if (target !== undefined) { if (v === null || v === undefined || v === '') return null; const nv = Number(v); if (maps[target] && maps[target].has(nv)) return maps[target].get(nv); return zeroOrNull() } return v })
      db.run(sql, vals)
    }
  }
}
// 复刻 applyOverwrite（先删后灌，纯插入；交叉测试内部去重后是否仍重复）
function applyOverwrite(db, tables, known) {
  for (const t of known) { if (t === 'contacts') continue; try { db.run(`DELETE FROM ${t}`) } catch (e) {} }
  // 复刻：contacts 按姓名归并 → 已存在则跳过（不删不插），避免 UNIQUE 冲突
  if (tables.contacts) delete tables.contacts
  known = known.filter((t) => t !== 'contacts')
  for (const t of known) { const rows = tables[t]; if (!rows || !rows.length) continue; const pk = ID_TABLES[t]; const cols = localCols(db, t); const useCols = Object.keys(rows[0]).filter((c) => cols.has(c)); const sql = `INSERT INTO ${t} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`; for (const r of rows) { const vals = useCols.map((c) => { if (pk && c === pk) return r[c]; const target = REFS[c]; let v = r[c]; if (target !== undefined) { if (v === null || v === undefined || v === '') return null; const nv = Number(v); return null } return v }); db.run(sql, vals) } }
}

async function main() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(SCHEMA)
  db.run("INSERT INTO contacts(id,kind,name) VALUES(1,'person','小欧')")

  // 一份「自带内部重复」的备份：chat_messages 有 2 条内容相同(id 1,2)；favorites 引用 id1 的消息(id 10)，另有重复收藏(id 11 同内容)
  // 另含 letters/cards/app_items 各 1 条（无重复）
  const backup = {
    contacts: [{ id: 1, kind: 'person', name: '小欧' }],
    chat_messages: [
      { id: 1, contact_id: 1, sender: 'me', content_type: 'text', text: '在吗', created_at: 1700000005 },
      { id: 2, contact_id: 1, sender: 'me', content_type: 'text', text: '在吗', created_at: 1700000005 }, // 内部重复
    ],
    favorites: [
      { id: 10, contact_id: 1, sender: 'me', content_type: 'text', text: '收藏A', message_id: 1, created_at: 1700000006 },
      { id: 11, contact_id:1, sender: 'me', content_type: 'text', text: '收藏A', created_at: 1700000006 }, // 内部重复
    ],
    letters: [{ id: 1, contact_id: 1, sender: 'me', opening: '亲爱的', closing: '再见', sentences: '想你', created_at: 1700000007 }],
    cards: [{ id: 1, group_id: 1, owner_contact_id: 1, category: '情话', content: '早安', created_at: 1700000008 }],
    card_groups: [{ id: 1, owner_contact_id: 1, category: '日常', scope: 'private', name: '分组', created_at: 1700000009 }],
    app_items: [{ id: 1, module: 'mood', contact_id: 1, title: '心情', body: '还行', created_at: 1700000010 }],
  }
  const known = Object.keys(backup).filter((t) => ID_TABLES[t])
  const count = (t) => q1(db, `SELECT COUNT(*) c FROM ${t}`).c

  let allPass = true
  function assert(cond, label) { if (!cond) { allPass = false; console.log('FAIL', label) } else console.log('PASS', label) }

  // ── 场景 A：合并到「空库」──（本地无对应行，必须靠内部去重）
  dedupeIncoming(db, backup, known)
  applyMerge(db, backup)
  assert(count('chat_messages') === 1, `A 合并空库 chat_messages=1 (实${count('chat_messages')})`)
  assert(count('favorites') === 1, `A 合并空库 favorites=1 (实${count('favorites')})`)
  // 跨表外键：被保留的收藏应指向被保留的消息(id 经重映射后应有效)
  const fav = q1(db, 'SELECT message_id FROM favorites')
  const msgExists = q1(db, 'SELECT 1 FROM chat_messages WHERE id=?', [fav.message_id])
  assert(!!msgExists, `A 收藏外键指向存在的消息 (message_id=${fav && fav.message_id})`)
  assert(count('letters') === 1 && count('cards') === 1 && count('card_groups') === 1 && count('app_items') === 1, 'A 其余表各 1 条')

  // ── 场景 B：覆盖导入到「已含相同数据」的库 ──（删后重灌，靠内部去重）
  // 重置相关表
  for (const t of ['chat_messages', 'favorites', 'letters', 'cards', 'card_groups', 'app_items']) db.run(`DELETE FROM ${t}`)
  // 重建一份同样的 backup 对象（dedupeIncoming/fapply 会消费 tables，需克隆）
  const backupB = JSON.parse(JSON.stringify(backup))
  dedupeIncoming(db, backupB, known)
  applyOverwrite(db, backupB, known)
  assert(count('chat_messages') === 1, `B 覆盖导入 chat_messages=1 (实${count('chat_messages')})`)
  assert(count('favorites') === 1, `B 覆盖导入 favorites=1 (实${count('favorites')})`)

  // ── 场景 C：二次合并「已含数据的库」──（回归：本地去重生效，不重复）
  const backupC = JSON.parse(JSON.stringify(backup))
  dedupeIncoming(db, backupC, known)
  console.log('DEBUG C 前 local chat_messages:', JSON.stringify(qall(db, 'SELECT id,text,created_at FROM chat_messages')))
  console.log('DEBUG C 前 local favorites:', JSON.stringify(qall(db, 'SELECT id,text,message_id FROM favorites')))
  console.log('DEBUG C 传入 chat_messages:', JSON.stringify(backupC.chat_messages))
  applyMerge(db, backupC)
  assert(count('chat_messages') === 1, `C 二次合并 chat_messages 仍=1 (实${count('chat_messages')})`)
  assert(count('favorites') === 1, `C 二次合并 favorites 仍=1 (实${count('favorites')})`)

  console.log(allPass ? '\n✅ 内部去重全部通过' : '\n❌ 存在失败')
  process.exit(allPass ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
