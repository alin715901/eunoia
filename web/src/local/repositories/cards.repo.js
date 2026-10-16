import db from '../db'

function now() {
  return Math.floor(Date.now() / 1000);
}

function listGroups({ scope, contactId, category } = {}) {
  let sql = 'SELECT * FROM card_groups WHERE 1=1';
  const params = [];
  if (scope) {
    sql += ' AND scope = ?';
    params.push(scope);
  }
  if (scope === 'contact' && contactId) {
    sql += ' AND owner_contact_id = ?';
    params.push(contactId);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY id ASC';
  return db.prepare(sql).all(...params);
}

// 各库规模统计：给"字卡库枢纽"页用
// 返回 [{ scope, owner_contact_id, group_count, card_count }]
// 卡片可能未分组（group_id = NULL），用 UNION 把「未分组」的卡也计入 card_count
function statsByScope() {
  return db
    .prepare(
      `SELECT scope, owner_contact_id,
              SUM(group_count) AS group_count,
              SUM(card_count) AS card_count,
              SUM(poke_count) AS poke_count,
              SUM(poke_group_count) AS poke_group_count
       FROM (
         SELECT scope, owner_contact_id, COUNT(*) AS group_count, 0 AS card_count, 0 AS poke_count, 0 AS poke_group_count
         FROM card_groups GROUP BY scope, owner_contact_id
         UNION ALL
         SELECT scope, owner_contact_id, 0 AS group_count, COUNT(*) AS card_count, 0 AS poke_count, 0 AS poke_group_count
         FROM cards GROUP BY scope, owner_contact_id
         UNION ALL
         SELECT scope, owner_contact_id, 0 AS group_count, 0 AS card_count, COUNT(*) AS poke_count, 0 AS poke_group_count
         FROM cards WHERE category = 'poke' GROUP BY scope, owner_contact_id
         UNION ALL
         SELECT scope, owner_contact_id, 0 AS group_count, 0 AS card_count, 0 AS poke_count, COUNT(*) AS poke_group_count
         FROM card_groups WHERE category = 'poke' GROUP BY scope, owner_contact_id
       )
       GROUP BY scope, owner_contact_id`
    )
    .all();
}

function createGroup({ category, scope = 'general', ownerContactId = null, name, color = '' } = {}) {
  const owner = scope === 'contact' ? ownerContactId : null;
  const info = db
    .prepare('INSERT INTO card_groups(category, scope, owner_contact_id, name, color, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(category, scope, owner, name, color || '', now());
  return db.prepare('SELECT * FROM card_groups WHERE id = ?').get(info.lastInsertRowid);
}

function updateGroup(id, { name, color } = {}) {
  const g = db.prepare('SELECT * FROM card_groups WHERE id = ?').get(id);
  if (!g) return null;
  const nextName = name !== undefined ? name : g.name;
  const nextColor = color !== undefined ? (color || '') : g.color;
  db.prepare('UPDATE card_groups SET name = ?, color = ? WHERE id = ?').run(nextName, nextColor, id);
  return db.prepare('SELECT * FROM card_groups WHERE id = ?').get(id);
}

function renameGroup(id, name) {
  return updateGroup(id, { name });
}

function blockGroup(id, blocked) {
  const v = blocked ? 1 : 0;
  db.prepare('UPDATE card_groups SET blocked = ? WHERE id = ?').run(v, id);
  // 级联：屏蔽/解除分组时同步组内全部字卡（单条 SQL，避免前端逐卡请求造成延迟）
  db.prepare('UPDATE cards SET blocked = ? WHERE group_id = ?').run(v, id);
  return db.prepare('SELECT * FROM card_groups WHERE id = ?').get(id);
}

function toggleBlockGroup(id) {
  const g = db.prepare('SELECT * FROM card_groups WHERE id = ?').get(id);
  if (!g) return null;
  return blockGroup(id, g.blocked ? 0 : 1);
}

function deleteGroup(id) {
  // cards 表有 ON DELETE CASCADE，删除分组会级联删卡
  db.prepare('DELETE FROM card_groups WHERE id = ?').run(id);
  return true;
}

function listCards({ groupId, category, scope, contactId, includeBlocked = false } = {}) {
  // LEFT JOIN：未分组（group_id = NULL）的卡片也要在管理界面显示（归入「未分组」）
  let sql =
    'SELECT c.* FROM cards c LEFT JOIN card_groups g ON c.group_id = g.id WHERE 1=1';
  const params = [];
  if (groupId) {
    sql += ' AND c.group_id = ?';
    params.push(groupId);
  }
  if (category) {
    sql += ' AND c.category = ?';
    params.push(category);
  }
  if (scope) {
    sql += ' AND c.scope = ?';
    params.push(scope);
  }
  if (contactId) {
    sql += ' AND c.owner_contact_id = ?';
    params.push(contactId);
  }
  if (!includeBlocked) {
    // 未分组（group_id = NULL）的卡片在 LEFT JOIN 后 g.blocked 为 NULL，
    // 若直接写 `g.blocked = 0` 会把这些卡排除；改为「未分组」或「所属分组未屏蔽」都放行
    sql += ' AND c.blocked = 0 AND (c.group_id IS NULL OR g.blocked = 0)';
  }
  sql += ' ORDER BY c.id ASC';
  return db.prepare(sql).all(...params);
}

function createCard({
  groupId,
  category,
  content = null,
  scope,
  ownerContactId = null,
  asset_path = null,
  duration = null,
  weight = 1,
} = {}) {
  // groupId 可为空：不归属任何分组的字卡 group_id = NULL，归入「未分组」
  const g = groupId ? db.prepare('SELECT * FROM card_groups WHERE id = ?').get(groupId) : null;
  const cat = category != null ? category : (g ? g.category : null);
  const sc = scope != null ? scope : (g ? g.scope : null);
  const owner = sc === 'contact' ? (ownerContactId != null ? ownerContactId : (g ? g.owner_contact_id : null)) : null;
  const info = db
    .prepare(
      `INSERT INTO cards(group_id, category, scope, owner_contact_id, content, asset_path, duration, weight, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(groupId ? Number(groupId) : null, cat, sc, owner, content, asset_path, duration, weight, now());
  return db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid);
}

// 批量建卡：单个事务一次插入全部（导入大量字卡时避免前端逐条请求过慢）
// 自动去重：同库(scope+owner) + 同分类 + 同内容 + 同资源路径 视为重复，跳过不插入
// （既拦住「库里已存在」的卡，也拦住「同一份文件里互相重复」的卡）
// items = [{ groupId, category, scope, ownerContactId, content, asset_path, duration, weight }]
function createCardsBatch(items = []) {
  if (!Array.isArray(items) || !items.length) return { inserted: 0, skipped: 0 };
  const getGroupStmt = db.prepare('SELECT * FROM card_groups WHERE id = ?');
  const groupCache = new Map();
  const existStmt = db.prepare(
    `SELECT 1 FROM cards WHERE scope = ? AND owner_contact_id IS ? AND category = ? AND content IS ? AND asset_path IS ? LIMIT 1`
  );
  const insertStmt = db.prepare(
    `INSERT INTO cards(group_id, category, scope, owner_contact_id, content, asset_path, duration, weight, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const t = now();
  db.exec('BEGIN');
  try {
    let inserted = 0;
    let skipped = 0;
    const seen = new Set(); // 批次内去重
    for (const it of items) {
      const groupId = it.groupId != null ? Number(it.groupId) : null;
      let g = null;
      if (groupId) {
        if (!groupCache.has(groupId)) groupCache.set(groupId, getGroupStmt.get(groupId) || null);
        g = groupCache.get(groupId);
      }
      const cat = it.category != null ? it.category : (g ? g.category : null);
      const sc = it.scope != null ? it.scope : (g ? g.scope : null);
      const owner = sc === 'contact' ? (it.ownerContactId != null ? Number(it.ownerContactId) : (g ? g.owner_contact_id : null)) : null;
      const content = it.content == null ? null : String(it.content);
      const asset = it.asset_path == null ? null : String(it.asset_path);
      // 去重键：库 + 分类 + 内容 + 资源路径（分组归属不计，内容相同的卡只保留一份）
      const key = `${sc}|${owner}|${cat}|${content}|${asset}`;
      if (seen.has(key)) { skipped++; continue; }
      const exists = existStmt.get(sc, owner, cat, content, asset);
      if (exists) { seen.add(key); skipped++; continue; }
      seen.add(key);
      insertStmt.run(groupId, cat, sc, owner, content, asset, it.duration ?? null, it.weight ?? 1, t);
      inserted++;
    }
    db.exec('COMMIT');
    return { inserted, skipped };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  }
}

function updateCard(id, fields = {}) {
  const allowed = [
    'group_id', 'category', 'content', 'scope', 'owner_contact_id',
    'asset_path', 'duration', 'blocked', 'weight',
  ];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      // SQLite 只接受 number/string/bigint/buffer/null，前端传来的布尔（如 blocked:true）归一成 1/0
      const v = typeof fields[k] === 'boolean' ? (fields[k] ? 1 : 0) : fields[k];
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (sets.length) {
    params.push(id);
    db.prepare(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
  const after = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  /* 语音卡改文字 → 同步更新引用该卡的历史语音消息的转写文案，聊天里长按转文字即所见即所得 */
  if (after && after.category === 'voice' && fields.content !== undefined) {
    db.prepare("UPDATE chat_messages SET text = ? WHERE card_id = ? AND content_type = 'voice'")
      .run(after.content || '', id);
  }
  return after;
}

function deleteCard(id) {
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  return true;
}

export {
  listGroups,
  statsByScope,
  createGroup,
  updateGroup,
  renameGroup,
  blockGroup,
  toggleBlockGroup,
  deleteGroup,
  listCards,
  createCard,
  createCardsBatch,
  updateCard,
  deleteCard,
};
