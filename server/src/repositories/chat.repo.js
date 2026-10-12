const db = require('../db');

function getMessages(contactId, cursor = null, limit = 50) {
  const rows = db
    .prepare(
      `SELECT * FROM chat_messages
       WHERE contact_id = ? AND (? IS NULL OR id < ?)
       ORDER BY id DESC LIMIT ?`
    )
    .all(contactId, cursor, cursor, limit);
  return rows.reverse();
}

function getMessageById(id) {
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
}

function insertMessage(msg) {
  const {
    contact_id, sender, content_type = 'text', card_id = null,
    text = null, asset_path = null, duration = null,
    is_proactive = 0, read_receipt = 'sent', read = 0, seq = 0,
    quote_id = null, quote_text = '', quote_image = '',
  } = msg;
  const info = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, card_id, text, asset_path, duration, is_proactive, read_receipt, read, seq, quote_id, quote_text, quote_image, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      contact_id, sender, content_type, card_id, text, asset_path, duration,
      is_proactive, read_receipt, read, seq, quote_id, quote_text, quote_image,
      Math.floor(Date.now() / 1000)
    );
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
}

function markRead(messageId) {
  db.prepare("UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE id = ?").run(messageId);
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
}

/* 撤回：清空正文/附件并标记 recalled，聊天里渲染为「X 撤回了一条消息」 */
function recallMessage(id) {
  db.prepare(
    `UPDATE chat_messages
     SET recalled = 1, text = '', asset_path = NULL, quote_id = NULL, quote_text = '', quote_image = ''
     WHERE id = ?`
  ).run(id);
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
}

function deleteMessage(id) {
  db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id);
  return { id, deleted: true };
}

/* 收藏：把消息快照落库（按 message_id 去重），在「统计」页归集展示。
   群聊消息不可收藏（仅单人联系人可收藏） */
function addFavorite(messageId) {
  const m = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m) return null;
  // 群聊（contacts.kind='group'）禁止收藏
  const c = db.prepare('SELECT kind FROM contacts WHERE id = ?').get(m.contact_id);
  if (c && c.kind === 'group') return null;
  const exist = db.prepare('SELECT id FROM favorites WHERE message_id = ?').get(messageId);
  if (exist) return db.prepare('SELECT * FROM favorites WHERE id = ?').get(exist.id);
  const info = db
    .prepare(
      `INSERT INTO favorites(message_id, contact_id, sender, content_type, text, asset_path, quote_text, quote_image, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      m.id, m.contact_id, m.sender, m.content_type, m.text, m.asset_path,
      m.quote_text || '', m.quote_image || '', Math.floor(Date.now() / 1000)
    );
  return db.prepare('SELECT * FROM favorites WHERE id = ?').get(info.lastInsertRowid);
}

function getFavorites() {
  return db
    .prepare(
      `SELECT f.*, c.name AS contact_name, c.avatar AS contact_avatar, c.kind AS contact_kind,
              CASE WHEN cd.sync_chat_avatar = 1 AND cd.partner_avatar IS NOT NULL AND cd.partner_avatar != ''
                   THEN cd.partner_avatar ELSE c.avatar END AS chat_avatar
       FROM favorites f
       LEFT JOIN contacts c ON c.id = f.contact_id
       LEFT JOIN contact_desktop cd ON cd.contact_id = f.contact_id
       ORDER BY f.id DESC`
    )
    .all();
}

module.exports = {
  getMessages,
  getMessageById,
  insertMessage,
  markRead,
  recallMessage,
  deleteMessage,
  addFavorite,
  getFavorites,
};
