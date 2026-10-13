/* 本地数据备份 / 恢复：
 * 导出 = 把 SQLite 里的行原样搬进 JSON（图片 / 音频都是 dataURL，随包一起带走）；
 * 导入 = 合并（id 重映射 + 同名联系人/歌曲自动归并，绝不覆盖本地已有行）
 *        或覆盖（先删后灌：全量删全表 / 板块删板块表 / 联系人按关联关系分区删）。
 * 关联数据自动带入：板块导出时会把引用到的联系人 / 字卡 / 歌曲 / 聊天记录等
 * 一并收进 ref 表，导入时 ref 表只做 INSERT OR IGNORE 或同名匹配，保证自洽。
 */
import db from '../db'

const FORMAT = 'eunoia-backup'
const VERSION = 1
/* 供 UI 层做「即将下载的数据是否合法」的最终校验（拦 Promise / 空对象） */
export const BACKUP_FORMAT = FORMAT

const fail = (msg) => {
  throw new Error(msg)
}

/* 不进备份的表：
 * _migrations  迁移标记（本地状态，无意义）
 * scheduler_log 调度运行日志（噪音）
 * deck_cards   塔罗牌库（种子数据，新库首次打开自动重建）
 * 其余 22 张表全部可备份。 */
const EXPORT_TABLES = [
  'contacts', 'contact_members', 'contact_settings', 'contact_desktop',
  'card_groups', 'cards', 'chat_messages', 'favorites', 'wallets',
  'moments', 'moment_interactions', 'letters', 'divinations',
  'global_settings', 'proactive_jobs', 'group_member_settings',
  'anniversaries', 'songs', 'song_favs', 'companion_invites',
  'listen_together', 'app_items', 'red_packet_grabs'
]

/* 大板块 → 数据表（对齐桌面功能；感知 / 心迹为即时功能不落库，无需导出。
 * 红包（wallets）属于聊天的一部分，随聊天板块一起导出，不单列。） */
export const BACKUP_FEATURES = [
  { key: 'chat', label: '聊天', tables: ['chat_messages', 'wallets', 'red_packet_grabs'] },
  { key: 'music', label: '音乐', tables: ['songs', 'song_favs'] },
  { key: 'cards', label: '字卡', tables: ['card_groups', 'cards'] },
  { key: 'letters', label: '信件', tables: ['letters'] },
  { key: 'moments', label: '朋友圈', tables: ['moments', 'moment_interactions'] },
  { key: 'favorites', label: '收藏', tables: ['favorites'] },
  { key: 'anniversaries', label: '纪念日', tables: ['anniversaries'] },
  { key: 'divinations', label: '占卜', tables: ['divinations'] },
  { key: 'companion', label: '陪伴邀请', tables: ['companion_invites'] },
  { key: 'listen', label: '一起听', tables: ['listen_together'] },
  { key: 'modules', label: '模块记录', tables: ['app_items'] },
  { key: 'beautify', label: '桌面美化', tables: ['global_settings'] }
]

/* 表 → 自增主键列（合并时重映射；无自增 id 的表不在此列） */
const ID_TABLES = {
  contacts: 'id', card_groups: 'id', cards: 'id', chat_messages: 'id',
  favorites: 'id', moments: 'id', moment_interactions: 'id', letters: 'id',
  divinations: 'id', proactive_jobs: 'id', anniversaries: 'id', songs: 'id',
  companion_invites: 'id', listen_together: 'id', app_items: 'id',
  red_packet_grabs: 'id'
}

/* 表 → 外键列 → 目标表（导出时按此自动带入关联行，导入时按此重映射 / 断开） */
const REFS = {
  contacts: {},
  contact_members: { group_id: 'contacts', member_id: 'contacts' },
  contact_settings: { contact_id: 'contacts' },
  contact_desktop: { contact_id: 'contacts' },
  wallets: { contact_id: 'contacts' },
  card_groups: { owner_contact_id: 'contacts' },
  cards: { group_id: 'card_groups', owner_contact_id: 'contacts' },
  chat_messages: { contact_id: 'contacts', author_member_id: 'contacts', card_id: 'cards', quote_id: 'chat_messages' },
  favorites: { contact_id: 'contacts', message_id: 'chat_messages', letter_id: 'letters' },
  moments: { contact_id: 'contacts', author_contact_id: 'contacts' },
  moment_interactions: { moment_id: 'moments', contact_id: 'contacts', reply_to: 'moment_interactions' },
  letters: { contact_id: 'contacts', reply_to: 'letters' },
  divinations: { contact_id: 'contacts' },
  proactive_jobs: { contact_id: 'contacts' },
  group_member_settings: { group_id: 'contacts', member_id: 'contacts' },
  anniversaries: { contact_id: 'contacts' },
  songs: {},
  song_favs: { song_id: 'songs', contact_id: 'contacts' },
  companion_invites: { contact_id: 'contacts', message_id: 'chat_messages' },
  listen_together: { contact_id: 'contacts', song_id: 'songs', message_id: 'chat_messages' },
  red_packet_grabs: { message_id: 'chat_messages' },
  app_items: { contact_id: 'contacts' }
}

/* 可被自动带入的「叶子表」：它们自身的外键也只指向叶子表，不会无限展开 */
const AUTO_TARGETS = new Set(['contacts', 'cards', 'card_groups', 'songs', 'chat_messages', 'letters'])

const LABELS = {
  contacts: '联系人', contact_members: '群成员', contact_settings: '联系人设置', contact_desktop: '桌面配置',
  card_groups: '字卡分组', cards: '字卡', chat_messages: '聊天消息', favorites: '收藏', wallets: '红包',
  moments: '朋友圈', moment_interactions: '朋友圈互动', letters: '信件', divinations: '占卜记录',
  global_settings: '全局设置', proactive_jobs: '主动消息任务', group_member_settings: '群成员设置',
  anniversaries: '纪念日', songs: '歌曲', song_favs: '歌曲收藏', companion_invites: '陪伴邀请',
  listen_together: '一起听', app_items: '模块记录',
  red_packet_grabs: '红包领取记录'
}

/* 表名 → 中文名（设置页展示用） */
export const BACKUP_TABLE_LABELS = LABELS

/* ─────────── 小工具 ─────────── */

function tableExists(t) {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)
  return !!row
}

const colCache = new Map()
function localCols(t) {
  if (!colCache.has(t)) {
    const m = new Map()
    for (const c of db.prepare(`PRAGMA table_info(${t})`).all()) {
      m.set(c.name, { notnull: !!c.notnull, dflt: c.dflt_value !== null && c.dflt_value !== undefined })
    }
    colCache.set(t, m)
  }
  return colCache.get(t)
}

function toBind(v) {
  if (v === undefined || v === null) return null
  const t = typeof v
  if (t === 'number' || t === 'string') return v
  if (t === 'boolean') return v ? 1 : 0
  if (v instanceof Uint8Array) return v
  try { return JSON.stringify(v) } catch (_) { return String(v) }
}

function zeroOrNull(t, col) {
  const meta = localCols(t).get(col)
  return meta && meta.notnull ? 0 : null
}

/* ─────────── 导出 ─────────── */

function allRows(t) {
  return db.prepare(`SELECT * FROM ${t}`).all()
}

/* 联系人范围：以勾选联系人为根，做传递闭包——
 * 群成员是双向关联：一个人属于某群 → 把整群纳入（含群内其它成员），
 * 从而群始终是完整的，不会出现「群只剩一个人」的孤儿群。
 * 返回的 contacts / contact_members / group_member_settings 已是完整集合，
 * 其余表再按 contact_id 全量拉取。 */
function scopedContactTables(ids) {
  const S = new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))
  let changed = true
  while (changed) {
    changed = false
    for (const t of ['contact_members', 'group_member_settings']) {
      if (!tableExists(t)) continue
      const rows = db.prepare(`SELECT * FROM ${t} WHERE group_id IN (${[...S].join(',')}) OR member_id IN (${[...S].join(',')})`).all()
      for (const r of rows) {
        if (!S.has(r.group_id)) { S.add(r.group_id); changed = true }
        if (!S.has(r.member_id)) { S.add(r.member_id); changed = true }
      }
    }
  }
  const IN = `(${[...S].join(',')})`
  const q = (sql) => db.prepare(sql).all()
  return {
    contacts: q(`SELECT * FROM contacts WHERE id IN ${IN}`),
    contact_members: q(`SELECT * FROM contact_members WHERE group_id IN ${IN} OR member_id IN ${IN}`),
    contact_settings: q(`SELECT * FROM contact_settings WHERE contact_id IN ${IN}`),
    contact_desktop: q(`SELECT * FROM contact_desktop WHERE contact_id IN ${IN}`),
    wallets: q(`SELECT * FROM wallets WHERE contact_id IN ${IN}`),
    chat_messages: q(`SELECT * FROM chat_messages WHERE contact_id IN ${IN}`),
    favorites: q(`SELECT * FROM favorites WHERE contact_id IN ${IN}`),
    letters: q(`SELECT * FROM letters WHERE contact_id IN ${IN}`),
    divinations: q(`SELECT * FROM divinations WHERE contact_id IN ${IN}`),
    proactive_jobs: q(`SELECT * FROM proactive_jobs WHERE contact_id IN ${IN}`),
    anniversaries: q(`SELECT * FROM anniversaries WHERE contact_id IN ${IN}`),
    app_items: q(`SELECT * FROM app_items WHERE contact_id IN ${IN}`),
    song_favs: q(`SELECT * FROM song_favs WHERE contact_id IN ${IN}`),
    companion_invites: q(`SELECT * FROM companion_invites WHERE contact_id IN ${IN}`),
    listen_together: q(`SELECT * FROM listen_together WHERE contact_id IN ${IN}`),
    moments: q(`SELECT * FROM moments WHERE contact_id IN ${IN} OR author_contact_id IN ${IN}`),
    moment_interactions: q(`SELECT * FROM moment_interactions WHERE contact_id IN ${IN} OR moment_id IN (SELECT id FROM moments WHERE contact_id IN ${IN} OR author_contact_id IN ${IN})`),
    group_member_settings: q(`SELECT * FROM group_member_settings WHERE group_id IN ${IN} OR member_id IN ${IN}`),
    card_groups: q(`SELECT * FROM card_groups WHERE owner_contact_id IN ${IN}`),
    cards: q(`SELECT * FROM cards WHERE owner_contact_id IN ${IN} OR group_id IN (SELECT id FROM card_groups WHERE owner_contact_id IN ${IN})`)
  }
}

/* 把范围表引用到的「叶子表」行递归补进来（最多 4 轮，避免环）。
 * partial 里的表是「范围内筛选过的部分行」（如联系人范围只选了部分 contacts），
 * 需要继续补关联行；不在 partial 里的表视为已整表导出，不再补。 */
function autoInclude(tables, ref, partial) {
  for (let round = 0; round < 4; round++) {
    const wanted = new Map()
    for (const [t, rows] of Object.entries(tables)) {
      const refs = REFS[t] || {}
      for (const [col, target] of Object.entries(refs)) {
        if (!AUTO_TARGETS.has(target)) continue
        if (tables[target] && !partial.has(target)) continue // 已整表导出
        let set = wanted.get(target)
        if (!set) wanted.set(target, (set = new Set()))
        for (const r of rows) {
          const v = r[col]
          if (v !== null && v !== undefined && v !== '' && v !== 0) set.add(Number(v))
        }
      }
    }
    let added = false
    for (const [target, ids] of wanted) {
      if (!ids.size) continue
      const isPartial = partial.has(target)
      const all = new Set(ids)
      if (isPartial) for (const r of tables[target] || []) all.add(r[ID_TABLES[target]])
      tables[target] = db
        .prepare(`SELECT * FROM ${target} WHERE ${ID_TABLES[target]} IN (${[...all].join(',')})`)
        .all()
      if (!ref.includes(target)) ref.push(target)
      added = true
    }
    if (!added) break
  }
}

/* scope: { type: 'full' } | { type: 'feature', features: [key] } | { type: 'contacts', contacts: [id] } */
export function buildBackup(scope) {
  const type = scope && scope.type
  const tables = {}
  const ref = []
  const partial = new Set()
  const scopeMeta = { type: 'full' }
  if (type === 'feature') {
    const keys = (scope.features || []).filter((k) => BACKUP_FEATURES.some((f) => f.key === k))
    if (!keys.length) fail('请至少选择一个板块')
    scopeMeta.type = 'feature'
    scopeMeta.features = keys
    for (const k of keys) {
      const f = BACKUP_FEATURES.find((x) => x.key === k)
      for (const t of f.tables) if (tableExists(t)) tables[t] = allRows(t)
    }
  } else if (type === 'contacts') {
    const ids = [...new Set((scope.contacts || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    if (!ids.length) fail('请至少选择一个联系人')
    scopeMeta.type = 'contacts'
    scopeMeta.contacts = ids
    for (const [t, rows] of Object.entries(scopedContactTables(ids))) {
      if (tableExists(t)) tables[t] = rows
    }
    /* contacts 表只含勾选的联系人，群成员等关联联系人要靠 autoInclude 补 */
    partial.add('contacts')
  } else {
    for (const t of EXPORT_TABLES) if (tableExists(t)) tables[t] = allRows(t)
  }
  autoInclude(tables, ref, partial)
  return {
    app: 'eunoia',
    format: FORMAT,
    version: VERSION,
    created_at: Date.now(),
    scope: scopeMeta,
    ref,
    tables
  }
}

/* ─────────── 导入 ─────────── */

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return '文件不是有效的备份'
  if (obj.format !== FORMAT) return '不是本应用生成的备份文件'
  if (!obj.tables || typeof obj.tables !== 'object' || Array.isArray(obj.tables)) return '备份文件缺少数据表'
  for (const [t, rows] of Object.entries(obj.tables)) {
    if (!Array.isArray(rows)) return `备份文件损坏：表 ${t} 数据异常`
    if (rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return `备份文件损坏：表 ${t} 存在无效记录`
  }
  if (obj.version > VERSION) return '备份文件版本过新，请升级应用后再导入'
  return null
}

/* 同名联系人 / 同源歌曲匹配（合并时把 ref 行归并到本地已有行，避免重复） */
function matchContact(row) {
  const name = String(row.name || '').trim()
  if (!name) return null
  const hit = db.prepare('SELECT id FROM contacts WHERE kind = ? AND TRIM(name) = ? ORDER BY id LIMIT 1')
    .get(row.kind || 'person', name)
  return hit ? hit.id : null
}

function matchSong(row) {
  const sid = String(row.source_id || '').trim()
  if (sid) {
    const hit = db.prepare('SELECT id FROM songs WHERE source = ? AND source_id = ? ORDER BY id LIMIT 1')
      .get(row.source || 'local', sid)
    return hit ? hit.id : null
  }
  const hit = db.prepare("SELECT id FROM songs WHERE source = 'local' AND TRIM(title) = ? AND TRIM(COALESCE(artist,'')) = ? ORDER BY id LIMIT 1")
    .get(String(row.title || '').trim(), String(row.artist || '').trim())
  return hit ? hit.id : null
}

/* 覆盖模式：先删后灌 */
function applyOverwrite(tables, known, refTables, scope) {
  const type = (scope && scope.type) || 'full'
  if (type === 'full') {
    for (const t of known) db.prepare(`DELETE FROM ${t}`).run()
  } else if (type === 'feature') {
    const fks = new Set()
    for (const k of scope.features || []) {
      const f = BACKUP_FEATURES.find((x) => x.key === k)
      if (f) f.tables.forEach((t) => fks.add(t))
    }
    for (const t of known) if (fks.has(t)) db.prepare(`DELETE FROM ${t}`).run()
  } else if (type === 'contacts') {
    const ids = (scope.contacts || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (ids.length) scopedDelete(ids)
  }
  const inserted = {}
  for (const t of known) {
    const rows = tables[t]
    if (!rows || !rows.length) continue
    inserted[t] = insertRows(t, rows, refTables.has(t))
  }
  return inserted
}

/* 按联系人分区删除（外键已关，不走级联，全部手动删） */
function scopedDelete(ids) {
  const IN = `(${ids.join(',')})`
  const run = (sql) => { try { db.prepare(sql).run() } catch (e) { /* 表不存在则跳过 */ } }
  run(`DELETE FROM moment_interactions WHERE contact_id IN ${IN} OR moment_id IN (SELECT id FROM moments WHERE contact_id IN ${IN} OR author_contact_id IN ${IN})`)
  run(`DELETE FROM moments WHERE contact_id IN ${IN} OR author_contact_id IN ${IN}`)
  run(`DELETE FROM companion_invites WHERE contact_id IN ${IN}`)
  run(`DELETE FROM listen_together WHERE contact_id IN ${IN}`)
  run(`DELETE FROM song_favs WHERE contact_id IN ${IN}`)
  run(`DELETE FROM letters WHERE contact_id IN ${IN}`)
  run(`DELETE FROM app_items WHERE contact_id IN ${IN}`)
  run(`DELETE FROM cards WHERE owner_contact_id IN ${IN} OR group_id IN (SELECT id FROM card_groups WHERE owner_contact_id IN ${IN})`)
  run(`DELETE FROM card_groups WHERE owner_contact_id IN ${IN}`)
  run(`DELETE FROM contact_members WHERE group_id IN ${IN} OR member_id IN ${IN}`)
  run(`DELETE FROM group_member_settings WHERE group_id IN ${IN} OR member_id IN ${IN}`)
  run(`DELETE FROM chat_messages WHERE contact_id IN ${IN}`)
  run(`DELETE FROM favorites WHERE contact_id IN ${IN}`)
  run(`DELETE FROM divinations WHERE contact_id IN ${IN}`)
  run(`DELETE FROM anniversaries WHERE contact_id IN ${IN}`)
  run(`DELETE FROM proactive_jobs WHERE contact_id IN ${IN}`)
  run(`DELETE FROM contact_settings WHERE contact_id IN ${IN}`)
  run(`DELETE FROM contact_desktop WHERE contact_id IN ${IN}`)
  run(`DELETE FROM wallets WHERE contact_id IN ${IN}`)
  run(`DELETE FROM contacts WHERE id IN ${IN}`)
}

/* 合并模式：id 重映射 + 同名归并 */
function applyMerge(tables, known, refTables) {
  /* pass 1：为新 id 建映射；联系人按「类型+名字」、歌曲按「来源+ID」匹配本地已有行，
   * 匹配上则复用本地 id 且不插入（避免同一个人 / 同一首歌被复制一份） */
  const maps = {}
  const skip = new Set()
  for (const t of known) {
    const pk = ID_TABLES[t]
    if (!pk) continue
    const map = new Map()
    let next = (db.prepare(`SELECT COALESCE(MAX(${pk}), 0) m FROM ${t}`).get().m || 0) + 1
    for (const row of tables[t]) {
      const old = row[pk]
      if (t === 'contacts') {
        const hit = matchContact(row)
        if (hit) { map.set(old, hit); skip.add(`contacts:${old}`); continue }
      }
      if (t === 'songs') {
        const hit = matchSong(row)
        if (hit) { map.set(old, hit); skip.add(`songs:${old}`); continue }
      }
      map.set(old, next++)
    }
    maps[t] = map
  }
  /* pass 2：逐行转换外键并插入 */
  const inserted = {}
  for (const t of known) {
    const rows = tables[t]
    if (!rows.length) continue
    const pk = ID_TABLES[t]
    /* 合并时的写入策略：
     * global_settings 同 key 覆盖值；
     * contact_settings / contact_desktop / wallets 主键是 contact_id，
     *   若联系人已同名归并到本地，冲突时保留本地设置；
     * 复合主键表（群成员 / 群成员设置 / 歌曲收藏）冲突时跳过；
     * 其余表 id 全是新分配的，不会冲突。 */
    let verb = 'INSERT'
    if (t === 'global_settings') verb = 'INSERT OR REPLACE'
    else if (!pk || t === 'contact_settings' || t === 'contact_desktop' || t === 'wallets') verb = 'INSERT OR IGNORE'
    let n = 0
    for (const row of rows) {
      if (pk && skip.has(`${t}:${row[pk]}`)) continue
      const cols = localCols(t)
      const refs = REFS[t] || {}
      const useCols = Object.keys(row).filter((c) => cols.has(c))
      const sql = `${verb} INTO ${t} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`
      const vals = useCols.map((c) => {
        /* 主键列换成新分配的 id（跳过同名归并的行） */
        if (pk && c === pk) {
          const mapped = maps[t].get(row[pk])
          return mapped === undefined ? toBind(row[c]) : mapped
        }
        const target = refs[c]
        let v = row[c]
        if (target !== undefined) {
          if (v === null || v === undefined || v === '') return null
          const nv = Number(v)
          if (target === 'contacts') {
            return maps.contacts && maps.contacts.has(nv) ? maps.contacts.get(nv) : zeroOrNull(t, c)
          }
          if (maps[target] && maps[target].has(nv)) return maps[target].get(nv)
          return zeroOrNull(t, c) // 目标表不在备份里 → 断开引用
        }
        return toBind(v === undefined ? null : v)
      })
      db.prepare(sql).run(...vals)
      n++
    }
    if (n) inserted[t] = n
  }
  return inserted
}

/* 通用插行（覆盖模式用，保留原 id） */
function insertRows(t, rows, orIgnore) {
  const cols = localCols(t)
  const useCols = Object.keys(rows[0]).filter((c) => cols.has(c))
  if (!useCols.length) fail(`表 ${t} 没有可导入的字段`)
  for (const [name, meta] of cols) {
    if (meta.notnull && !meta.dflt && !useCols.includes(name)) {
      fail(`备份缺少表 ${t} 的必填字段 ${name}`)
    }
  }
  const verb = orIgnore ? 'INSERT OR IGNORE' : 'INSERT'
  const sql = `${verb} INTO ${t} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`
  const stmt = db.prepare(sql)
  let n = 0
  for (const r of rows) {
    stmt.run(...useCols.map((c) => toBind(r[c] === undefined ? null : r[c])))
    n++
  }
  return n
}

/* 修正自增序列，避免后续新建记录撞已恢复的 id */
function fixSequences(tables) {
  for (const t of tables) {
    const pk = ID_TABLES[t]
    if (!pk) continue
    try {
      const m = db.prepare(`SELECT COALESCE(MAX(${pk}), 0) m FROM ${t}`).get().m
      db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET seq = MAX(seq, excluded.seq)")
        .run(t, m)
    } catch (e) { /* 库太小没有 sqlite_sequence，忽略 */ }
  }
}

/* mode: 'merge' | 'overwrite' */
export function importBackup(payload, mode) {
  const err = validateBackup(payload)
  if (err) fail(err)
  const m = mode === 'overwrite' ? 'overwrite' : 'merge'
  const tables = payload.tables
  const refTables = new Set(Array.isArray(payload.ref) ? payload.ref : [])
  const names = Object.keys(tables)
  const known = names.filter((t) => /^[a-z_]+$/.test(t) && tableExists(t))
  const unknown = names.filter((t) => !known.includes(t))
  if (!known.length) fail('备份里没有可导入的数据表')
  colCache.clear()
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    const run = db.transaction(() => {
      const inserted = m === 'overwrite'
        ? applyOverwrite(tables, known, refTables, payload.scope)
        : applyMerge(tables, known, refTables)
      fixSequences(known)
      return inserted
    })
    var inserted = run()
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  const parts = Object.entries(inserted)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${LABELS[t] || t} ${n} 条`)
  const text = parts.length
    ? `已导入 ${parts.slice(0, 5).join(' · ')}${parts.length > 5 ? ` 等 ${parts.length} 项` : ''}`
    : '没有新数据需要写入'
  return { ok: true, mode: m, inserted, skipped: unknown, text }
}

/* ─────────── 设置页概览 ─────────── */

function contactCounts() {
  const m = new Map()
  const bump = (cid, n) => {
    if (cid === null || cid === undefined) return
    const k = Number(cid)
    m.set(k, (m.get(k) || 0) + n)
  }
  const group = (sql) => {
    try {
      for (const r of db.prepare(sql).all()) bump(r.cid, r.n)
    } catch (e) { /* 表不存在则忽略 */ }
  }
  for (const t of [
    'contact_settings', 'contact_desktop', 'wallets', 'chat_messages', 'favorites',
    'letters', 'divinations', 'proactive_jobs', 'anniversaries', 'app_items',
    'song_favs', 'companion_invites', 'listen_together'
  ]) {
    group(`SELECT contact_id cid, COUNT(*) n FROM ${t} GROUP BY contact_id`)
  }
  group('SELECT contact_id cid, COUNT(*) n FROM moments GROUP BY contact_id')
  group('SELECT author_contact_id cid, COUNT(*) n FROM moments WHERE author_contact_id IS NOT NULL GROUP BY author_contact_id')
  group('SELECT contact_id cid, COUNT(*) n FROM moment_interactions GROUP BY contact_id')
  group('SELECT m.contact_id cid, COUNT(*) n FROM moment_interactions i JOIN moments m ON m.id = i.moment_id GROUP BY m.contact_id')
  group('SELECT group_id cid, COUNT(*) n FROM contact_members GROUP BY group_id')
  group('SELECT member_id cid, COUNT(*) n FROM contact_members GROUP BY member_id')
  group('SELECT group_id cid, COUNT(*) n FROM group_member_settings GROUP BY group_id')
  group('SELECT owner_contact_id cid, COUNT(*) n FROM card_groups GROUP BY owner_contact_id')
  group('SELECT owner_contact_id cid, COUNT(*) n FROM cards GROUP BY owner_contact_id')
  return m
}

/* 导出弹窗用：板块（含条数）/ 联系人（含关联条数）/ 全量总条数 */
export function backupOverview() {
  const count = (t) => {
    try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c } catch (e) { return 0 }
  }
  const features = BACKUP_FEATURES
    .map((f) => ({ key: f.key, label: f.label, count: f.tables.reduce((s, t) => s + count(t), 0) }))
  const counts = contactCounts()
  const contacts = db
    .prepare('SELECT id, kind, name, avatar FROM contacts ORDER BY CASE WHEN kind = \'group\' THEN 1 ELSE 0 END, sort_order, id')
    .all()
    .map((c) => ({ ...c, count: counts.get(c.id) || 0 }))
  const total = EXPORT_TABLES.reduce((s, t) => s + count(t), 0)
  return { features, contacts, total }
}
