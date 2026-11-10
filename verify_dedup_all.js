/* 用真实 sql.js 复刻 backup.service.js 的 applyMerge 去重逻辑，
 * 验证「把同一份备份合并两次」后所有内容表都不重复。
 * 重点验证新增的 photo_wall_elements，并回归 cards / chat_messages /
 * letters / anniversaries / moments / favorites / app_items。 */
const initSqlJs = require('/workspace/web/node_modules/sql.js/dist/sql-wasm.js')
const fs = require('fs')

// ── schema（仅建测试需要的表）──
const SCHEMA = `
CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, name TEXT);
CREATE TABLE photo_walls (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, created_at INTEGER);
CREATE TABLE photo_wall_elements (id INTEGER PRIMARY KEY AUTOINCREMENT, wall_id INTEGER NOT NULL, type TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, scale REAL DEFAULT 1, rotation REAL DEFAULT 0, z INTEGER DEFAULT 0, content TEXT DEFAULT '', font TEXT DEFAULT '', frame TEXT DEFAULT '', created_at INTEGER);
CREATE TABLE card_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_contact_id INTEGER, category TEXT, scope TEXT, name TEXT, created_at INTEGER);
CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, owner_contact_id INTEGER, category TEXT, content TEXT, duration INTEGER, blocked INTEGER, created_at INTEGER);
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, sender TEXT, content_type TEXT, text TEXT, duration INTEGER, author_member_id INTEGER, is_proactive INTEGER, recalled INTEGER, quote_text TEXT, created_at INTEGER);
CREATE TABLE letters (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, sender TEXT, opening TEXT, closing TEXT, sentences TEXT, created_at INTEGER);
CREATE TABLE anniversaries (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, title TEXT, date TEXT, calendar TEXT, type TEXT, repeat_yearly INTEGER);
CREATE TABLE moments (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, author TEXT, author_contact_id INTEGER, text TEXT, created_at INTEGER);
CREATE TABLE favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, sender TEXT, content_type TEXT, text TEXT, created_at INTEGER);
CREATE TABLE app_items (id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT, contact_id INTEGER, title TEXT, body TEXT, created_at INTEGER);
`

// ── 与 backup.service.js 完全一致的 DEDUP（含本次新增 photo_wall_elements）──
const DEDUP = {
  chat_messages: ['contact_id', 'sender', 'content_type', 'text', 'duration', 'author_member_id', 'is_proactive', 'recalled', 'quote_text', 'created_at'],
  favorites: ['contact_id', 'sender', 'content_type', 'text', 'created_at'],
  letters: ['contact_id', 'sender', 'opening', 'closing', 'sentences', 'created_at'],
  moments: ['contact_id', 'author', 'author_contact_id', 'text', 'created_at'],
  anniversaries: ['contact_id', 'title', 'date', 'calendar', 'type', 'repeat_yearly'],
  cards: ['group_id', 'owner_contact_id', 'category', 'content', 'duration', 'blocked', 'created_at'],
  card_groups: ['owner_contact_id', 'category', 'scope', 'name', 'created_at'],
  app_items: ['module', 'contact_id', 'title', 'body', 'created_at'],
  photo_walls: ['name', 'created_at'],
  photo_wall_elements: ['wall_id', 'type', 'x', 'y', 'scale', 'rotation', 'z', 'font', 'frame', 'created_at'],
}
const ID_TABLES = {
  contacts: 'id', photo_walls: 'id', photo_wall_elements: 'id', card_groups: 'id', cards: 'id',
  chat_messages: 'id', letters: 'id', anniversaries: 'id', moments: 'id', favorites: 'id', app_items: 'id'
}
const REFS = {
  photo_wall_elements: { wall_id: 'photo_walls' },
  cards: { group_id: 'card_groups' },
  chat_messages: { contact_id: 'contacts' },
  letters: { contact_id: 'contacts' },
  anniversaries: { contact_id: 'contacts' },
  moments: { contact_id: 'contacts' },
  favorites: { contact_id: 'contacts' },
  app_items: { contact_id: 'contacts' },
  card_groups: { owner_contact_id: 'contacts' },
}

// sql.js 1.14 的 Statement 没有 .all()/.get()，用 db.prepare + step 包一层返回对象数组
function qall(db, sql, params) {
  const stmt = db.prepare(sql)
  if (params) stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}
function q1(db, sql, params) {
  const r = qall(db, sql, params)
  return r.length ? r[0] : null
}
function qall(db, sql, params) {
  const stmt = db.prepare(sql)
  if (params) stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}
function normFp(v) { if (v === null || v === undefined) return ''; return String(v) }
function localCols(db, t) {
  const m = new Map()
  for (const c of qall(db, `PRAGMA table_info(${t})`)) m.set(c.name, true)
  return m
}
function zeroOrNull() { return 0 }
function buildLocalDedup(db, t, cols, pk) {
  const m = new Map()
  const rows = qall(db, `SELECT ${pk}, ${cols.join(', ')} FROM ${t}`)
  for (const r of rows) {
    const fp = cols.map((c) => normFp(r[c])).join('\u0001')
    if (!m.has(fp)) m.set(fp, r[pk])
  }
  return m
}
function incomingFp(db, t, row, cols, maps, refs) {
  return cols.map((c) => {
    let v = row[c]
    const target = refs[c]
    if (target) {
      if (v === null || v === undefined || v === '') return ''
      const nv = Number(v)
      const mp = maps[target]
      v = mp && mp.has(nv) ? mp.get(nv) : zeroOrNull()
    }
    return normFp(v)
  }).join('\u0001')
}

// 复刻 applyMerge：id 重映射 + 内容去重。返回每张表最终行数。
function matchContact(db, row) {
  const name = String(row.name || '').trim()
  if (!name) return null
  const hit = q1(db, `SELECT id FROM contacts WHERE kind=? AND TRIM(name)=? ORDER BY id LIMIT 1`, [row.kind || 'person', name])
  return hit ? hit.id : null
}
function applyMerge(db, tables) {
  const known = Object.keys(tables).filter((t) => ID_TABLES[t])
  const maps = {}
  const skip = new Set()
  for (const t of known) {
    const pk = ID_TABLES[t]
    const map = new Map()
    let next = (q1(db, `SELECT COALESCE(MAX(${pk}),0) m FROM ${t}`).m || 0) + 1
    for (const row of tables[t]) {
      const old = row[pk]
      if (t === 'contacts') {
        const hit = matchContact(db, row)
        if (hit) { map.set(old, hit); skip.add(`contacts:${old}`); continue }
      }
      map.set(old, next++)
    }
    maps[t] = map
  }
  const localDedup = {}
  for (const t of known) {
    if (!DEDUP[t]) continue
    const pk = ID_TABLES[t]
    const cols = DEDUP[t].filter((c) => localCols(db, t).has(c))
    if (cols.length < DEDUP[t].length) continue
    localDedup[t] = buildLocalDedup(db, t, cols, pk)
  }
  for (const t of known) {
    const rows = tables[t]
    if (!rows.length) continue
    const pk = ID_TABLES[t]
    const refs = REFS[t] || {}
    const dedupCols = localDedup[t] ? DEDUP[t].filter((c) => localCols(db, t).has(c)) : null
    for (const row of rows) {
      if (pk) {
        if (skip.has(`${t}:${row[pk]}`)) continue
        if (dedupCols && localDedup[t]) {
          const fp = incomingFp(db, t, row, dedupCols, maps, refs)
          const localId = localDedup[t].get(fp)
          if (localId !== undefined) { maps[t].set(row[pk], localId); skip.add(`${t}:${row[pk]}`); continue }
        }
      }
      const cols = localCols(db, t)
      const useCols = Object.keys(row).filter((c) => cols.has(c))
      const sql = `INSERT INTO ${t} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`
      const vals = useCols.map((c) => {
        if (pk && c === pk) {
          const mapped = maps[t].get(row[pk])
          return mapped === undefined ? row[c] : mapped
        }
        const target = refs[c]
        let v = row[c]
        if (target !== undefined) {
          if (v === null || v === undefined || v === '') return null
          const nv = Number(v)
          if (maps[target] && maps[target].has(nv)) return maps[target].get(nv)
          return zeroOrNull()
        }
        return v
      })
      db.run(sql, vals)
    }
  }
}

async function main() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(SCHEMA)

  // 联系人（id 空间锚点）
  db.run("INSERT INTO contacts(id,kind,name) VALUES(1,'person','小欧')")

  // 本地已有数据（模拟「已部署/已存在」的状态）
  db.run("INSERT INTO photo_walls(id,name,created_at) VALUES(1,'旅行相册',1700000000)")
  db.run("INSERT INTO photo_wall_elements(id,wall_id,type,x,y,scale,rotation,z,font,frame,created_at) VALUES(1,1,'image',10,20,1,0,0,'','',1700000001)")
  db.run("INSERT INTO photo_wall_elements(id,wall_id,type,x,y,scale,rotation,z,font,frame,created_at) VALUES(2,1,'text',30,40,1,0,1,'serif','polaroid',1700000002)")
  db.run("INSERT INTO card_groups(id,owner_contact_id,category,scope,name,created_at) VALUES(1,1,'日常','private','我的分组',1700000003)")
  db.run("INSERT INTO cards(id,group_id,owner_contact_id,category,content,created_at) VALUES(1,1,1,'情话','早安',1700000004)")
  db.run("INSERT INTO chat_messages(id,contact_id,sender,content_type,text,created_at) VALUES(1,1,'me','text','在吗',1700000005)")
  db.run("INSERT INTO letters(id,contact_id,sender,opening,closing,sentences,created_at) VALUES(1,1,'me','亲爱的','再见','想你',1700000006)")
  db.run("INSERT INTO anniversaries(id,contact_id,title,date,calendar,type,repeat_yearly) VALUES(1,1,'生日','2024-01-01','solar','birthday',1)")
  db.run("INSERT INTO moments(id,contact_id,author,author_contact_id,text,created_at) VALUES(1,1,'小欧',1,'今天开心',1700000007)")
  db.run("INSERT INTO favorites(id,contact_id,sender,content_type,text,created_at) VALUES(1,1,'me','text','收藏句',1700000008)")
  db.run("INSERT INTO app_items(id,module,contact_id,title,body,created_at) VALUES(1,'mood',1,'心情','还行',1700000009)")

  // 模拟「同一份备份」传入（内容与本地完全相同 → 二次合并场景）
  const backup = {
    contacts: [{ id: 1, kind: 'person', name: '小欧' }],
    photo_walls: [
      { id: 1, name: '旅行相册', created_at: 1700000000 },
      { id: 2, name: '新墙', created_at: 1700000100 },
    ],
    photo_wall_elements: [
      { id: 1, wall_id: 1, type: 'image', x: 10, y: 20, scale: 1, rotation: 0, z: 0, font: '', frame: '', created_at: 1700000001 },
      { id: 2, wall_id: 1, type: 'text', x: 30, y: 40, scale: 1, rotation: 0, z: 1, font: 'serif', frame: 'polaroid', created_at: 1700000002 },
      { id: 3, wall_id: 2, type: 'image', x: 5, y: 5, scale: 1, rotation: 0, z: 0, font: '', frame: '', created_at: 1700000101 }, // 新墙的新元素（应插入）
    ],
    card_groups: [{ id: 1, owner_contact_id: 1, category: '日常', scope: 'private', name: '我的分组', created_at: 1700000003 }],
    cards: [{ id: 1, group_id: 1, owner_contact_id: 1, category: '情话', content: '早安', created_at: 1700000004 }],
    chat_messages: [{ id: 1, contact_id: 1, sender: 'me', content_type: 'text', text: '在吗', created_at: 1700000005 }],
    letters: [{ id: 1, contact_id: 1, sender: 'me', opening: '亲爱的', closing: '再见', sentences: '想你', created_at: 1700000006 }],
    anniversaries: [{ id: 1, contact_id: 1, title: '生日', date: '2024-01-01', calendar: 'solar', type: 'birthday', repeat_yearly: 1 }],
    moments: [{ id: 1, contact_id: 1, author: '小欧', author_contact_id: 1, text: '今天开心', created_at: 1700000007 }],
    favorites: [{ id: 1, contact_id: 1, sender: 'me', content_type: 'text', text: '收藏句', created_at: 1700000008 }],
    app_items: [{ id: 1, module: 'mood', contact_id: 1, title: '心情', body: '还行', created_at: 1700000009 }],
  }

  const count = (t) => q1(db, `SELECT COUNT(*) c FROM ${t}`).c

  console.log('=== 二次合并前 ===')
  const before = {}
  for (const t of Object.keys(backup)) before[t] = count(t)

  // 合并两次（模拟用户反复导入同一份备份）
  applyMerge(db, backup)
  applyMerge(db, backup)

  console.log('=== 二次合并后 ===')
  const expect = {
    photo_walls: 2,            // 原有1 + 新墙1
    photo_wall_elements: 3,    // 原有2 + 新墙元素1（新墙2个元素应去重，不重复）
    card_groups: 1,
    cards: 1,
    chat_messages: 1,
    letters: 1,
    anniversaries: 1,
    moments: 1,
    favorites: 1,
    app_items: 1,
  }
  let pass = true
  for (const t of Object.keys(expect)) {
    const got = count(t)
    const ok = got === expect[t]
    if (!ok) pass = false
    console.log(`${ok ? 'PASS' : 'FAIL'} ${t}: ${before[t]} -> ${got} (期望 ${expect[t]})`)
  }
  // 额外检查：photo_wall_elements 不应出现 wall_id=1 的重复坐标行
  const dup = qall(db, "SELECT wall_id,x,y,COUNT(*) c FROM photo_wall_elements GROUP BY wall_id,x,y HAVING c>1")
  if (dup.length) { pass = false; console.log('FAIL 存在重复坐标元素:', JSON.stringify(dup)) }
  else console.log('PASS photo_wall_elements 无重复坐标行')

  console.log(pass ? '\n✅ 全部通过：二次合并无重复' : '\n❌ 存在重复，需修复')
  process.exit(pass ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
