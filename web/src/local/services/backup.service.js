/* 本地数据备份 / 恢复：
 * 导出 = 把 SQLite 里的行原样搬进 JSON（图片 / 音频都是 dataURL，随包一起带走）；
 * 导入 = 合并（id 重映射 + 同名联系人/歌曲自动归并，绝不覆盖本地已有行）
 *        或覆盖（先删后灌：全量删全表 / 板块删板块表 / 联系人按关联关系分区删）。
 * 关联数据自动带入：板块导出时会把引用到的联系人 / 字卡 / 歌曲 / 聊天记录等
 * 一并收进 ref 表，导入时 ref 表只做 INSERT OR IGNORE 或同名匹配，保证自洽。
 */
import db, { setImporting, reloadFromStorage } from '../db'
import { CARE_TEXTS_KEY } from '../../utils/careTexts'

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
 * 其余 27 张表全部可备份。 */
const EXPORT_TABLES = [
  'contacts', 'contact_members', 'contact_settings', 'contact_desktop',
  'card_groups', 'cards', 'chat_messages', 'favorites', 'wallets',
  'moments', 'moment_interactions', 'letters', 'divinations',
  'global_settings', 'proactive_jobs', 'group_member_settings',
  'anniversaries', 'songs', 'song_favs', 'companion_invites',
  'listen_together', 'cinema_together', 'app_items', 'red_packet_grabs',
  'poke_library', 'photo_walls', 'photo_wall_elements'
]

/* 桌面大板块 → 数据表（对齐桌面功能；感知 / 心迹为即时功能不落库，无需导出）。
 * mods: 该板块只取 app_items 里的部分 module 行（通用模块数据统一存 app_items）。
 * 归属说明：
 *  - 聊天含 红包（wallets / red_packet_grabs）、拍一拍（poke_library）等发进聊天的数据；
 *  - 美化设置 = 主题全部设置（global_settings KV）+ 人物卡签名/背景等（contact_desktop）；
 *  - 音乐含 一起听（listen_together）；影院含 影院站点/链接（app_items cinema*）；
 *  - 相册 = 照片墙（photo_walls / photo_wall_elements）+ 相册模块记录（app_items album）；
 *  - 统计 = 消息收藏 / 提问记录（favorites），统计数值本身由聊天记录派生。 */
export const BACKUP_FEATURES = [
  { key: 'cards', label: '字卡库', tables: ['card_groups', 'cards'] },
  { key: 'beautify', label: '美化设置', tables: ['global_settings', 'contact_desktop'] },
  { key: 'chat', label: '聊天', tables: ['chat_messages', 'wallets', 'red_packet_grabs', 'poke_library'] },
  { key: 'moments', label: '朋友圈', tables: ['moments', 'moment_interactions'] },
  { key: 'letters', label: '信件', tables: ['letters'] },
  { key: 'anniversaries', label: '纪念', tables: ['anniversaries'] },
  { key: 'companion', label: '陪伴', tables: ['companion_invites'] },
  { key: 'divinations', label: '占卜', tables: ['divinations'] },
  { key: 'music', label: '音乐', tables: ['songs', 'song_favs', 'listen_together'] },
  { key: 'cinema', label: '影院', tables: ['cinema_together'], mods: { app_items: ['cinema', 'cinema_sites', 'cinema_links'] } },
  { key: 'game', label: '游戏', tables: [], mods: { app_items: ['game'] } },
  { key: 'mood', label: '心情', tables: [], mods: { app_items: ['mood'] } },
  { key: 'memo', label: '备忘录', tables: [], mods: { app_items: ['memo'] } },
  { key: 'period', label: '经期', tables: [], mods: { app_items: ['period'] } },
  { key: 'album', label: '相册', tables: ['photo_walls', 'photo_wall_elements'], mods: { app_items: ['album'] } },
  { key: 'stats', label: '统计', tables: ['favorites'] }
]

/* 表 → 自增主键列（合并时重映射；无自增 id 的表不在此列） */
const ID_TABLES = {
  contacts: 'id', card_groups: 'id', cards: 'id', chat_messages: 'id',
  favorites: 'id', moments: 'id', moment_interactions: 'id', letters: 'id',
  divinations: 'id', proactive_jobs: 'id',   anniversaries: 'id', songs: 'id',
  companion_invites: 'id', listen_together: 'id', cinema_together: 'id', app_items: 'id',
  red_packet_grabs: 'id', poke_library: 'id', photo_walls: 'id', photo_wall_elements: 'id'
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
  cinema_together: { contact_id: 'contacts', message_id: 'chat_messages' },
  red_packet_grabs: { message_id: 'chat_messages' },
  app_items: { contact_id: 'contacts' },
  poke_library: {},
  photo_walls: {},
  photo_wall_elements: { wall_id: 'photo_walls' }
}

/* 可被自动带入的「叶子表」：它们自身的外键也只指向叶子表，不会无限展开 */
const AUTO_TARGETS = new Set(['contacts', 'cards', 'card_groups', 'songs', 'chat_messages', 'letters'])

const LABELS = {
  contacts: '联系人', contact_members: '群成员', contact_settings: '联系人设置', contact_desktop: '桌面配置',
  card_groups: '字卡分组', cards: '字卡', chat_messages: '聊天消息', favorites: '收藏', wallets: '红包',
  moments: '朋友圈', moment_interactions: '朋友圈互动', letters: '信件', divinations: '占卜记录',
  global_settings: '全局设置', proactive_jobs: '主动消息任务', group_member_settings: '群成员设置',
  anniversaries: '纪念日', songs: '歌曲', song_favs: '歌曲收藏', companion_invites: '陪伴邀请',
  listen_together: '一起听', cinema_together: '一起观影', app_items: '模块记录',
  red_packet_grabs: '红包领取记录', poke_library: '拍一拍',
  photo_walls: '照片墙', photo_wall_elements: '照片墙元素'
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
    cinema_together: q(`SELECT * FROM cinema_together WHERE contact_id IN ${IN}`),
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

/* app_items 按模块过滤时拼 IN 子句（值来自代码常量，防御性转义） */
const modIN = (mods) => [...mods].map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',')

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
    const modSets = new Map() // 表 → 要导出的 module 集合（多个板块同表时合并）
    for (const k of keys) {
      const f = BACKUP_FEATURES.find((x) => x.key === k)
      for (const t of f.tables) if (tableExists(t)) tables[t] = allRows(t)
      for (const [t, mods] of Object.entries(f.mods || {})) {
        if (!tableExists(t)) continue
        if (!modSets.has(t)) modSets.set(t, new Set())
        for (const m of mods) modSets.get(t).add(m)
      }
    }
    for (const [t, mods] of modSets) {
      if (tables[t]) continue // 该表已被某板块整表导出
      tables[t] = db.prepare(`SELECT * FROM ${t} WHERE module IN (${modIN(mods)})`).all()
      partial.add(t) // 部分行导出，autoInclude 按部分表处理
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
  const out = {
    app: 'eunoia',
    format: FORMAT,
    version: VERSION,
    created_at: Date.now(),
    scope: scopeMeta,
    ref,
    tables
  }
  /* 关怀文案（经期特殊关怀）存在 localStorage，不落数据库，备份表天然不含它；
     为保障「云端同步 / 导出再导入」不丢失，把当前自定义文案随全量备份一起带走。
     仅全量备份携带（按板块 / 按联系人导出是局部数据，不该夹带全局配置）；
     导入时若有该字段则写回 localStorage（见 importBackup）。 */
  if (type !== 'feature' && type !== 'contacts') {
    try {
      const raw = localStorage.getItem(CARE_TEXTS_KEY)
      if (raw) out.care_texts = JSON.parse(raw)
    } catch (e) { /* 解析失败则不带，不阻断备份 */ }
  }
  return out
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

/* 覆盖模式：先删后灌（删除 / 插入均分批，批间让出主线程，避免长阻塞）。
   删除阶段的行数也计入进度总量，让进度条在「清理旧数据」阶段就有反馈。 */
async function applyOverwrite(tables, known, refTables, scope, ctx) {
  const type = (scope && scope.type) || 'full'
  const countRows = (t, extra) => {
    try { return db.prepare(`SELECT COUNT(*) c FROM ${t}${extra ? ` WHERE ${extra}` : ''}`).get().c } catch (e) { return 0 }
  }
  let deleteTotal = 0
  const plain = new Set()
  const modSets = new Map()
  if (type === 'feature') {
    for (const k of scope.features || []) {
      const f = BACKUP_FEATURES.find((x) => x.key === k)
      if (!f) continue
      f.tables.forEach((t) => plain.add(t))
      for (const [t, mods] of Object.entries(f.mods || {})) {
        if (!modSets.has(t)) modSets.set(t, new Set())
        for (const m of mods) modSets.get(t).add(m)
      }
    }
    for (const t of known) {
      if (plain.has(t)) deleteTotal += countRows(t)
      else if (modSets.has(t)) deleteTotal += countRows(t, `module IN (${modIN(modSets.get(t))})`)
    }
  } else if (type === 'full') {
    for (const t of known) deleteTotal += countRows(t)
  }
  /* 把删除行数并入进度总量（联系人分区删除条数难精确预估，略，占比小） */
  if (ctx) ctx.total += deleteTotal

  if (type === 'full') {
    for (const t of known) {
      emitProgress(ctx, 'delete', `正在清理${LABELS[t] || t}…`)
      await batchDelete(t, null, ctx)
    }
  } else if (type === 'feature') {
    for (const t of known) {
      emitProgress(ctx, 'delete', `正在清理${LABELS[t] || t}…`)
      if (plain.has(t)) await batchDelete(t, null, ctx)
      else if (modSets.has(t)) await batchDelete(t, `module IN (${modIN(modSets.get(t))})`, ctx)
    }
  } else if (type === 'contacts') {
    emitProgress(ctx, 'delete', '正在清理旧数据…')
    const ids = (scope.contacts || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (ids.length) await scopedDelete(ids)
  }
  const inserted = {}
  for (const t of known) {
    const rows = tables[t]
    if (!rows || !rows.length) continue
    inserted[t] = await insertChunked(t, rows, refTables.has(t), ctx)
  }
  return inserted
}

/* 按联系人分区删除（外键已关，不走级联，全部手动删）。
   每条 DELETE 后让出主线程，避免该联系人数据量大时阻塞 UI 线程。 */
async function scopedDelete(ids) {
  const IN = `(${ids.join(',')})`
  const stmts = [
    `DELETE FROM moment_interactions WHERE contact_id IN ${IN} OR moment_id IN (SELECT id FROM moments WHERE contact_id IN ${IN} OR author_contact_id IN ${IN})`,
    `DELETE FROM moments WHERE contact_id IN ${IN} OR author_contact_id IN ${IN}`,
    `DELETE FROM companion_invites WHERE contact_id IN ${IN}`,
    `DELETE FROM listen_together WHERE contact_id IN ${IN}`,
    `DELETE FROM cinema_together WHERE contact_id IN ${IN}`,
    `DELETE FROM song_favs WHERE contact_id IN ${IN}`,
    `DELETE FROM letters WHERE contact_id IN ${IN}`,
    `DELETE FROM app_items WHERE contact_id IN ${IN}`,
    `DELETE FROM cards WHERE owner_contact_id IN ${IN} OR group_id IN (SELECT id FROM card_groups WHERE owner_contact_id IN ${IN})`,
    `DELETE FROM card_groups WHERE owner_contact_id IN ${IN}`,
    `DELETE FROM contact_members WHERE group_id IN ${IN} OR member_id IN ${IN}`,
    `DELETE FROM group_member_settings WHERE group_id IN ${IN} OR member_id IN ${IN}`,
    `DELETE FROM chat_messages WHERE contact_id IN ${IN}`,
    `DELETE FROM favorites WHERE contact_id IN ${IN}`,
    `DELETE FROM divinations WHERE contact_id IN ${IN}`,
    `DELETE FROM anniversaries WHERE contact_id IN ${IN}`,
    `DELETE FROM proactive_jobs WHERE contact_id IN ${IN}`,
    `DELETE FROM contact_settings WHERE contact_id IN ${IN}`,
    `DELETE FROM contact_desktop WHERE contact_id IN ${IN}`,
    `DELETE FROM wallets WHERE contact_id IN ${IN}`,
    `DELETE FROM contacts WHERE id IN ${IN}`
  ]
  for (const sql of stmts) {
    try { db.prepare(sql).run() } catch (e) { /* 表不存在则跳过 */ }
    await yieldToMain()
  }
}

/* 合并模式：id 重映射 + 同名归并。
 * pass1 先建映射（同步，不写库，仅遍历备份行）；pass2 分批插入，
 * 每 IMPORT_CHUNK 行一个事务、批间让出主线程，避免长阻塞导致 ANR 卡退。 */
async function applyMerge(tables, known, refTables, ctx) {
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
  const inserted = {}
  for (const t of known) {
    const rows = tables[t]
    if (!rows.length) continue
    emitProgress(ctx, 'import', `正在导入${LABELS[t] || t}…`)
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
    for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
      const piece = rows.slice(i, i + IMPORT_CHUNK)
      db.transaction(() => {
        const cols = localCols(t)
        const refs = REFS[t] || {}
        const useCols = Object.keys(piece[0]).filter((c) => cols.has(c))
        const sql = `${verb} INTO ${t} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`
        const stmt = db.prepare(sql)
        for (const row of piece) {
          if (pk && skip.has(`${t}:${row[pk]}`)) continue
          const vals = useCols.map((c) => {
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
          stmt.run(...vals)
          n++
        }
      })()
      if (ctx) {
        ctx.done += piece.length
        emitProgress(ctx, 'import', `正在导入${LABELS[t] || t}…`)
      }
      await yieldToMain()
    }
    if (n) inserted[t] = n
  }
  return inserted
}

/* ── 分批导入辅助 ──
 * 导入动辄上万行（聊天记录 + 图片 / 音频 dataURL），若一次性同步写进单个事务，
 * 主线程会被长时间阻塞 → Android WebView 触发 ANR（应用无响应被系统杀掉，
 * 即用户看到的「导入过程中卡退、重新进入也进不去」）。
 * 改为：每 IMPORT_CHUNK 行一个事务，批间让出主线程，让事件循环得以处理输入。 */
const IMPORT_CHUNK = 1000

/* setTimeout(0) 让出主线程：当前宏任务结束、事件循环处理 pending 输入。
   WebView 长任务拆分的通用做法，能重置 ANR 计时、避免被系统杀掉。 */
function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/* 导入进度回报：把当前阶段 / 正在导入的表中文名 / 已完成行数回传给 UI。
   onProgress 由调用方传入（UI 用于展示进度条与「正在导入 X」文案）。 */
function emitProgress(ctx, phase, label) {
  if (!ctx || !ctx.onProgress) return
  try {
    ctx.onProgress({ phase, label, done: ctx.done, total: ctx.total })
  } catch (e) { /* 回调异常不应中断导入 */ }
}

/* 分批删除：每 5000 行一批，批间让出主线程，避免大表 DELETE 阻塞主线程。
   where 为空（null）表示删整表，SQL 不能拼出「WHERE  AND …」——必须先判空。 */
async function batchDelete(t, where, ctx) {
  const w = where ? ` WHERE ${where}` : ''
  for (;;) {
    const sel = `SELECT rowid FROM ${t}${w} LIMIT 5000`
    const cond = where ? `(${where}) AND rowid IN (${sel})` : `rowid IN (${sel})`
    const r = db.prepare(`DELETE FROM ${t} WHERE ${cond}`).run()
    if (!r.changes) break
    if (ctx) { ctx.done += r.changes; emitProgress(ctx, 'delete', `正在清理${LABELS[t] || t}…`) }
    await yieldToMain()
  }
}

/* 分批插入（覆盖模式用，保留原 id）：每 IMPORT_CHUNK 行一个事务，批间让出主线程。 */
async function insertChunked(t, rows, orIgnore, ctx) {
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
  emitProgress(ctx, 'import', `正在导入${LABELS[t] || t}…`)
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const piece = rows.slice(i, i + IMPORT_CHUNK)
    db.transaction(() => {
      const stmt = db.prepare(sql)
      for (const r of piece) {
        stmt.run(...useCols.map((c) => toBind(r[c] === undefined ? null : r[c])))
      }
    })()
    if (ctx) {
      ctx.done += piece.length
      emitProgress(ctx, 'import', `正在导入${LABELS[t] || t}…`)
    }
    await yieldToMain()
  }
  return rows.length
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

/* mode: 'merge' | 'overwrite'
   onProgress({ phase, label, done, total })：导入进度回调，phase 取值
   'prepare'(准备) | 'delete'(清理旧数据) | 'import'(正在导入某表) | 'save'(落盘保存)。
   UI 用它展示进度条与「正在导入 X」文案；传 null 则静默（无 UI 场景）。 */
export async function importBackup(payload, mode, onProgress) {
  const err = validateBackup(payload)
  if (err) fail(err)
  const m = mode === 'overwrite' ? 'overwrite' : 'merge'
  const tables = payload.tables
  const refTables = new Set(Array.isArray(payload.ref) ? payload.ref : [])
  const names = Object.keys(tables)
  const known = names.filter((t) => /^[a-z_]+$/.test(t) && tableExists(t))
  const unknown = names.filter((t) => !known.includes(t))
  if (!known.length) fail('备份里没有可导入的数据表')
  /* 总行数（用于进度百分比）。合并模式可能有同名归并跳过，但占比极小，忽略不影响观感。 */
  let total = 0
  for (const t of known) {
    const rows = tables[t]
    if (rows && rows.length) total += rows.length
  }
  const ctx = { onProgress, total, done: 0 }
  colCache.clear()
  /* 导入期间抑制自动落盘：导入会把整库撑大，自动 flush 会导出整个巨大库、
     长时间阻塞主线程 → 触发 ANR。落盘推迟到此处结束后由调用方 flushNow 统一完成。 */
  setImporting(true)
  db.exec('PRAGMA foreign_keys = OFF')
  let inserted
  try {
    emitProgress(ctx, 'prepare', '正在准备数据…')
    inserted = m === 'overwrite'
      ? await applyOverwrite(tables, known, refTables, payload.scope, ctx)
      : await applyMerge(tables, known, refTables, ctx)
    fixSequences(known)
  } catch (e) {
    /* 导入中途失败：回滚内存库到最后一次成功落盘的状态，避免把「被删空 / 半成品」的库
       随后被 flush 持久化到磁盘（那样下次启动载入的就是坏数据 / 空库，表现为「进不去」）。 */
    try { await reloadFromStorage() } catch (_) { /* 回滚失败也继续抛出原错误 */ }
    throw e
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
    setImporting(false) // 复位：若有未落盘数据，setImporting 内部会登记一次延迟 flush（由 flushNow 真正 await 完成）
  }
  /* 写回关怀文案（见 buildBackup）：有该字段才覆盖本地，局部导出备份不含它则不动 */
  if (payload.care_texts) {
    try { localStorage.setItem(CARE_TEXTS_KEY, JSON.stringify(payload.care_texts)) } catch (e) { /* 存储失败忽略 */ }
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
    'song_favs', 'companion_invites', 'listen_together', 'cinema_together'
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
  const features = BACKUP_FEATURES.map((f) => {
    let c = f.tables.reduce((s, t) => s + count(t), 0)
    for (const [t, mods] of Object.entries(f.mods || {})) {
      try { c += db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE module IN (${modIN(mods)})`).get().c } catch (e) { /* 表不存在 */ }
    }
    return { key: f.key, label: f.label, count: c }
  })
  const counts = contactCounts()
  const contacts = db
    .prepare('SELECT id, kind, name, avatar FROM contacts ORDER BY CASE WHEN kind = \'group\' THEN 1 ELSE 0 END, sort_order, id')
    .all()
    .map((c) => ({ ...c, count: counts.get(c.id) || 0 }))
  const total = EXPORT_TABLES.reduce((s, t) => s + count(t), 0)
  return { features, contacts, total }
}
