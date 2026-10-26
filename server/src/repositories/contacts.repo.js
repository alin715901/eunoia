const db = require('../db');
const { quoteBodyOf } = require('../utils/quoteText');

function now() {
  return Math.floor(Date.now() / 1000);
}

function getContact(id) {
  return db.prepare('SELECT * FROM contacts WHERE id=?').get(id);
}

function listContacts() {
  return db
    .prepare(
      `SELECT c.*, (
         SELECT COUNT(*) FROM chat_messages m
         WHERE m.contact_id = c.id AND m.sender = 'contact' AND m.read = 0
       ) AS unread,
       -- 聊天里实际显示的头像：开启人物卡同步时用人物卡头像，否则用联系人本体头像
       CASE WHEN d.sync_chat_avatar = 1 AND IFNULL(d.partner_avatar, '') != ''
            THEN d.partner_avatar ELSE c.avatar END AS chat_avatar
       FROM contacts c
       LEFT JOIN contact_desktop d ON d.contact_id = c.id
       ORDER BY c.sort_order ASC, c.id ASC`
    )
    .all();
}

// 最近互动排序（主页默认选中用）：看最后一条聊天/朋友圈时间，越近越靠前
function getRecents(limit = 10) {
  const n = Math.max(1, Number(limit) || 10);
  return db
    .prepare(
      `SELECT c.*, COALESCE(
         (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.contact_id = c.id),
         (SELECT MAX(m.created_at) FROM moments m WHERE m.contact_id = c.id),
         (SELECT MAX(l.created_at) FROM letters l WHERE l.contact_id = c.id),
         c.created_at
       ) AS last_active
       FROM contacts c
       ORDER BY last_active DESC, c.id DESC
       LIMIT ?`
    )
    .all(n);
}

function createContact({ name, kind = 'person', avatar = null, memberIds = [] } = {}) {
  if (kind === 'group') {
    const ids = Array.isArray(memberIds) ? memberIds : [];
    if (ids.length < 2) {
      throw new Error('群聊至少需要 2 位成员');
    }
  }
  const info = db
    .prepare("INSERT INTO contacts(kind, name, avatar, sort_order, created_at) VALUES(?, ?, ?, ?, ?)")
    .run(kind, name, avatar, 0, now());
  const id = info.lastInsertRowid;
  // 自动建立默认设置行 + 桌面行
  db.prepare('INSERT OR IGNORE INTO contact_settings(contact_id) VALUES(?)').run(id);
  db.prepare('INSERT OR IGNORE INTO contact_desktop(contact_id) VALUES(?)').run(id);
  if (kind === 'group' && Array.isArray(memberIds) && memberIds.length) {
    const ins = db.prepare(
      'INSERT OR IGNORE INTO contact_members(group_id, member_id) VALUES(?, ?)'
    );
    const tx = db.transaction(() => {
      for (const m of memberIds) ins.run(id, m);
    });
    tx();
  }
  return getContact(id);
}

function listMembers(groupId) {
  return db
    .prepare(
      `SELECT c.*,
         -- 聊天里实际显示的头像：开启人物卡同步时用人物卡头像，否则用联系人本体头像
         CASE WHEN d.sync_chat_avatar = 1 AND IFNULL(d.partner_avatar, '') != ''
              THEN d.partner_avatar ELSE c.avatar END AS chat_avatar
       FROM contacts c
       JOIN contact_members m ON m.member_id = c.id
       LEFT JOIN contact_desktop d ON d.contact_id = c.id
       WHERE m.group_id = ?
       ORDER BY c.sort_order ASC, c.id ASC`
    )
    .all(groupId);
}

// 往群里加成员（已在群里则忽略）
function addMember(groupId, memberId) {
  const g = db.prepare('SELECT kind FROM contacts WHERE id = ?').get(groupId);
  if (!g) throw new Error('群不存在');
  if (g.kind !== 'group') throw new Error('只有群聊才能加成员');
  const m = db.prepare('SELECT id FROM contacts WHERE id = ?').get(memberId);
  if (!m) throw new Error('成员不存在');
  db.prepare('INSERT OR IGNORE INTO contact_members(group_id, member_id) VALUES(?, ?)').run(
    groupId,
    memberId
  );
  return getContact(memberId);
}

// 把成员移出群（其专属规则一并清掉，避免残留）
function removeMember(groupId, memberId) {
  db.prepare('DELETE FROM contact_members WHERE group_id = ? AND member_id = ?').run(groupId, memberId);
  db.prepare('DELETE FROM group_member_settings WHERE group_id = ? AND member_id = ?').run(
    groupId,
    memberId
  );
  return true;
}

function updateContact(id, fields = {}) {
  const allowed = ['name', 'avatar', 'kind', 'muted_chat', 'muted_group', 'sort_order', 'pinned', 'pronoun'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(fields[k]);
    }
  }
  if (sets.length) {
    params.push(id);
    db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
  return getContact(id);
}

function deleteContact(id) {
  // 手动级联：与该联系人相关的一切一并删除
  // （朋友圈 -> 互动、信件、专属字卡库、纪念日、占卜、主动消息任务、聊天记录、设置与桌面）
  const momentIds = db.prepare('SELECT id FROM moments WHERE contact_id = ?').all(id).map((r) => r.id);
  const delInteraction = db.prepare('DELETE FROM moment_interactions WHERE moment_id = ?');
  const tx = db.transaction(() => {
    for (const mid of momentIds) delInteraction.run(mid);
    db.prepare('DELETE FROM moments WHERE contact_id = ?').run(id);
    db.prepare('DELETE FROM letters WHERE contact_id = ?').run(id);
    db.prepare('DELETE FROM cards WHERE owner_contact_id = ?').run(id);
    db.prepare('DELETE FROM card_groups WHERE owner_contact_id = ?').run(id);
    db.prepare('DELETE FROM anniversaries WHERE contact_id = ?').run(id);
    db.prepare('DELETE FROM divinations WHERE contact_id = ?').run(id);
    db.prepare('DELETE FROM proactive_jobs WHERE contact_id = ?').run(id);
    db.prepare('DELETE FROM contact_settings WHERE contact_id = ?').run(id);
    db.prepare('DELETE FROM contact_desktop WHERE contact_id = ?').run(id);
    db.prepare(
      'DELETE FROM group_member_settings WHERE group_id = ? OR member_id = ?'
    ).run(id, id);
    db.prepare('DELETE FROM contact_members WHERE group_id = ? OR member_id = ?').run(id, id);
    db.prepare('DELETE FROM chat_messages WHERE contact_id = ?').run(id);
    db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  });
  tx();
  return true;
}

function getSettings(id) {
  const row = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(id);
  if (row && row.cat_weights && typeof row.cat_weights === 'string') {
    try {
      row.cat_weights = JSON.parse(row.cat_weights);
    } catch (e) {
      /* 保持原样 */
    }
  }
  if (row && row.bubble_style && typeof row.bubble_style === 'string') {
    try {
      row.bubble_style = JSON.parse(row.bubble_style);
    } catch (e) {
      /* 保持原样 */
    }
  }
  return row;
}

function updateSettings(id, fields = {}) {
  const cols = [
    'reply_min', 'reply_max', 'reply_delay_min', 'reply_delay_max',
    'answer_delay_min', 'answer_delay_max',
    'cat_weights', 'gen_ratio', 'proactive_enabled', 'proactive_count',
    'proactive_count_min', 'proactive_count_max',
    'proactive_interval_min', 'proactive_interval_max',
    'moment_enabled', 'moment_freq', 'moment_count_min', 'moment_count_max',
    'moment_reply_enabled', 'moment_reply_min', 'moment_reply_max',
    'letter_enabled', 'letter_freq', 'letter_week_min', 'letter_week_max',
    'letter_sentences_min', 'letter_sentences_max', 'letter_opening', 'letter_closing',
    'my_name', 'my_avatar', 'avatar_shape', 'avatar_radius', 'avatar_size', 'avatar_pos',
    'chat_bg', 'chat_bg_blur', 'chat_font', 'chat_font_css', 'bubble_style',
    'blocked', 'show_read_receipt', 'read_receipt_style', 'read_no_reply', 'show_names',
    'call_enabled', 'call_incoming_prob', 'call_answer_prob', 'call_reject_prob', 'call_hangup_prob',
    'contact_recall_enabled',
  ];
  const sets = [];
  const params = [];
  for (const c of cols) {
    if (fields[c] !== undefined) {
      let v = fields[c];
      if (c === 'cat_weights' && typeof v === 'object') v = JSON.stringify(v);
      sets.push(`${c} = ?`);
      params.push(v);
    }
  }
  if (sets.length) {
    params.push(id);
    db.prepare(`UPDATE contact_settings SET ${sets.join(', ')} WHERE contact_id = ?`).run(...params);
  }
  /* 主动消息间隔被改过：以「上次主动发出时间」为基准重排下次时间，新间隔立即生效 */
  if (fields.proactive_interval_min !== undefined || fields.proactive_interval_max !== undefined) {
    const row = db
      .prepare('SELECT proactive_last_at, proactive_interval_min, proactive_interval_max FROM contact_settings WHERE contact_id = ?')
      .get(id);
    if (row) {
      let lo = Math.round(Number(row.proactive_interval_min) || 60);
      let hi = Math.round(Number(row.proactive_interval_max) || lo);
      if (hi < lo) [lo, hi] = [hi, lo];
      const mins = Math.floor(Math.random() * (hi - lo + 1)) + lo;
      const base = Number(row.proactive_last_at) || Math.floor(Date.now() / 1000);
      db.prepare('UPDATE contact_settings SET proactive_next_at = ? WHERE contact_id = ?').run(base + mins * 60, id);
    }
  }
  // 我的备注名变更 → 同步刷新历史引用摘要的前缀（旧消息里的「我：」/旧备注名一起更新）
  if (fields.my_name !== undefined) refreshQuoteTexts(id);
  return getSettings(id);
}

/* 重新生成该联系人所有引用摘要（quote_text）：
   引用我的消息 → 我的备注名（contact_settings.my_name 优先，contact_desktop.my_name 兜底）；
   引用对方消息 → 对方昵称。已撤回的消息不参与 */
function refreshQuoteTexts(contactId) {
  try {
    const st = db.prepare('SELECT my_name FROM contact_settings WHERE contact_id = ?').get(contactId);
    const desk = db.prepare('SELECT my_name AS dn FROM contact_desktop WHERE contact_id = ?').get(contactId);
    const myName = (st?.my_name || '').trim() || (desk?.dn || '').trim() || '我';
    const cName = db.prepare('SELECT name FROM contacts WHERE id = ?').get(contactId)?.name || '';
    const rows = db
      .prepare(
        `SELECT cm.id, cm.quote_id, q.sender AS q_sender, q.author_member_id AS q_member,
                q.content_type AS q_type, q.text AS q_text, q.asset_path AS q_asset
         FROM chat_messages cm JOIN chat_messages q ON q.id = cm.quote_id
         WHERE cm.contact_id = ? AND cm.recalled = 0 AND q.recalled = 0`
      )
      .all(contactId);
    const upd = db.prepare('UPDATE chat_messages SET quote_text = ? WHERE id = ?');
    const memberOf = db.prepare('SELECT name FROM contacts WHERE id = ?');
    for (const r of rows) {
      // 群聊里引用成员发言显示成员昵称，引用我的显示我的备注名，其余才是对方昵称
      let prefix = cName;
      if (r.q_sender === 'me') prefix = myName;
      else if (r.q_member) prefix = memberOf.get(r.q_member)?.name || cName;
      const body = quoteBodyOf(r.q_text, r.q_asset, r.q_type);
      upd.run(prefix ? `${prefix}：${body}` : body, r.id);
    }
  } catch (e) {
    console.error('[refreshQuoteTexts] skipped:', e.message);
  }
}

function markReadAll(contactId) {
  db.prepare(
    "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'contact'"
  ).run(contactId);
  return true;
}

const MEMBER_COLS = [
  'reply_min',
  'reply_max',
  'reply_delay_min',
  'reply_delay_max',
  'answer_delay_min',
  'answer_delay_max',
  'cat_weights',
  'gen_ratio',
  'proactive_enabled',
  'proactive_count',
  'proactive_interval_min',
];

function parseJsonField(row) {
  if (!row) return row;
  if (typeof row.cat_weights === 'string') {
    try {
      row.cat_weights = JSON.parse(row.cat_weights);
    } catch (e) {
      row.cat_weights = {};
    }
  }
  return row;
}

// 读某个群全部成员的设置；没有专属设置的行以群设置兜底
function getMemberSettings(groupId) {
  const g = getSettings(groupId) || {};
  const rows = db
    .prepare('SELECT * FROM group_member_settings WHERE group_id = ?')
    .all(groupId);
  const map = new Map();
  for (const r of rows) map.set(r.member_id, parseJsonField(r));
  return listMembers(groupId).map((m) => {
    const own = map.get(m.id);
    const inherited = {
      reply_min: g.reply_min ?? 1,
      reply_max: g.reply_max ?? 3,
      reply_delay_min: g.reply_delay_min ?? 1,
      reply_delay_max: g.reply_delay_max ?? 5,
      answer_delay_min: g.answer_delay_min ?? 1,
      answer_delay_max: g.answer_delay_max ?? 5,
      cat_weights: g.cat_weights ?? {},
      gen_ratio: g.gen_ratio ?? 70,
      proactive_enabled: g.proactive_enabled ?? 0,
      proactive_count: g.proactive_count ?? 1,
      proactive_interval_min: g.proactive_interval_min ?? 60,
    };
    return {
      member_id: m.id,
      name: m.name,
      avatar: m.avatar,
      inherited,
      settings: own || null,
      effective: own ? { ...inherited, ...own, member_id: m.id, name: m.name, avatar: m.avatar } : { ...inherited, member_id: m.id, name: m.name, avatar: m.avatar },
    };
  });
}

function upsertMemberSettings(groupId, memberId, fields = {}) {
  // 必须是该群成员
  const isMember = db
    .prepare('SELECT 1 FROM contact_members WHERE group_id = ? AND member_id = ?')
    .get(groupId, memberId);
  if (!isMember) throw new Error('该成员不在此群中');

  db.prepare(
    'INSERT OR IGNORE INTO group_member_settings(group_id, member_id) VALUES(?, ?)'
  ).run(groupId, memberId);

  const sets = [];
  const params = [];
  for (const c of MEMBER_COLS) {
    if (fields[c] !== undefined) {
      let v = fields[c];
      if (c === 'cat_weights' && typeof v === 'object') v = JSON.stringify(v);
      sets.push(`${c} = ?`);
      params.push(v);
    }
  }
  if (sets.length) {
    params.push(groupId, memberId);
    db.prepare(
      `UPDATE group_member_settings SET ${sets.join(', ')} WHERE group_id = ? AND member_id = ?`
    ).run(...params);
  }
  const row = parseJsonField(
    db
      .prepare('SELECT * FROM group_member_settings WHERE group_id = ? AND member_id = ?')
      .get(groupId, memberId)
  );
  return row;
}

function resetMemberSettings(groupId, memberId) {
  db.prepare(
    'DELETE FROM group_member_settings WHERE group_id = ? AND member_id = ?'
  ).run(groupId, memberId);
  return true;
}

module.exports = {
  getContact,
  listContacts,
  getRecents,
  createContact,
  updateContact,
  deleteContact,
  getSettings,
  updateSettings,
  markReadAll,
  refreshQuoteTexts,
  listMembers,
  addMember,
  removeMember,
  getMemberSettings,
  upsertMemberSettings,
  resetMemberSettings,
};
