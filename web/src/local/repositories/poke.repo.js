/* 拍一拍库：与字卡库（cards 表）完全独立的存储。
 * 前端/服务统一通过这里读写，不再借用 cards 表的 category='poke'。
 *
 * id 偏移量：poke_library 与 cards 都用 AUTOINCREMENT，id 可能撞车；
 * 对外暴露的拍一拍 id = 真实 id + POKE_ID_OFFSET（1000000），写回时再减去，
 * 这样 deleteCard / updateCard 仅凭 id 就能区分是拍一拍还是普通字卡。 */
import db from '../db'

export const POKE_ID_OFFSET = 1_000_000

function now() {
  return Math.floor(Date.now() / 1000)
}

/* 把 poke_library 行整形成与 cards 行同构的对象（前端/字卡库复用同一套渲染） */
function shape(r) {
  if (!r) return null
  return {
    id: r.id + POKE_ID_OFFSET,
    group_id: null,
    category: 'poke',
    scope: 'general',
    owner_contact_id: null,
    content: r.content,
    asset_path: null,
    duration: null,
    blocked: r.blocked || 0,
    weight: r.weight || 1,
    created_at: r.created_at,
  }
}

export function listPokes({ includeBlocked = false } = {}) {
  let sql = 'SELECT * FROM poke_library WHERE 1=1'
  if (!includeBlocked) sql += ' AND blocked = 0'
  sql += ' ORDER BY id ASC'
  return db.prepare(sql).all().map(shape)
}

export function createPoke(content) {
  const c = String(content == null ? '' : content).trim()
  if (!c) return null
  const info = db
    .prepare('INSERT INTO poke_library(content, weight, created_at) VALUES(?, 1, ?)')
    .run(c, now())
  return shape(db.prepare('SELECT * FROM poke_library WHERE id = ?').get(info.lastInsertRowid))
}

export function createPokes(items = []) {
  const t = now()
  const insert = db.prepare('INSERT INTO poke_library(content, weight, created_at) VALUES(?, 1, ?)')
  const out = []
  db.exec('BEGIN')
  try {
    for (const it of items) {
      const c = String((it && typeof it === 'object' ? it.content : it) == null ? '' : (it && typeof it === 'object' ? it.content : it)).trim()
      if (!c) continue
      const info = insert.run(c, t)
      out.push(shape(db.prepare('SELECT * FROM poke_library WHERE id = ?').get(info.lastInsertRowid)))
    }
    db.exec('COMMIT')
    return out
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (_) { /* ignore */ }
    throw e
  }
}

export function updatePoke(id, fields = {}) {
  const realId = id - POKE_ID_OFFSET
  const sets = []
  const params = []
  if (fields.content !== undefined) {
    sets.push('content = ?')
    params.push(String(fields.content))
  }
  if (fields.blocked !== undefined) {
    sets.push('blocked = ?')
    params.push(fields.blocked ? 1 : 0)
  }
  if (sets.length) {
    params.push(realId)
    db.prepare(`UPDATE poke_library SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  return shape(db.prepare('SELECT * FROM poke_library WHERE id = ?').get(realId))
}

export function deletePoke(id) {
  db.prepare('DELETE FROM poke_library WHERE id = ?').run(id - POKE_ID_OFFSET)
  return true
}
