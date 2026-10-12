// 一起听歌：我邀请联系人一起听当前歌曲 / 联系人主动邀请我。
// 邀请落 listen_together 表，并在聊天里落一条 content_type='listen_invite'
// 的卡片消息（text 存 JSON 元数据），聊天页可查看状态、受邀方可接受/拒绝。
// 我发出的邀请：TA 会在几秒后接受（较大概率）或婉拒；
// TA 邀我：由 cron 每分钟小概率触发，我在聊天卡片或歌词页接受/拒绝。
const db = require('../db');
const notification = require('./notification.service');
const settingsRepo = require('../repositories/settings.repo');

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function getNextSeq(d, contactId) {
  const r = d.prepare('SELECT MAX(seq) AS m FROM chat_messages WHERE contact_id = ?').get(contactId);
  return (Number(r && r.m) || 0) + 1;
}

/* 联系人（对方）头像：同步到聊天的人物卡头像优先 */
function effectiveContactInfo(d, contactId) {
  const c = d.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(contactId);
  if (!c) return { avatar: '', name: '对方' };
  let avatar = c.avatar || '';
  const desk = d.prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?').get(contactId);
  if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar;
  return { avatar, name: c.name || '对方' };
}

/* 我方头像：桌面 my_avatar（开启同步时优先）> 设置 my_avatar > 桌面 my_avatar */
function effectiveMyAvatar(d, contactId) {
  const s = d.prepare('SELECT my_avatar FROM contact_settings WHERE contact_id = ?').get(contactId);
  const desk = d.prepare('SELECT sync_chat_avatar, my_avatar FROM contact_desktop WHERE contact_id = ?').get(contactId);
  if (desk && desk.sync_chat_avatar && desk.my_avatar) return desk.my_avatar;
  return (s && s.my_avatar) || (desk && desk.my_avatar) || '';
}

function metaOf(inv, status) {
  const ci = effectiveContactInfo(db, inv.contact_id);
  return JSON.stringify({
    inviteId: inv.id,
    songId: inv.song_id,
    songTitle: inv.song_title,
    songArtist: inv.song_artist,
    songCover: inv.song_cover,
    from: inv.from_side,
    status: status || inv.status,
    contactName: ci.name,
    contactAvatar: ci.avatar,
    myAvatar: effectiveMyAvatar(db, inv.contact_id)
  });
}

/* 把邀请状态写回聊天卡片消息，并广播更新（聊天页卡片实时变状态） */
function syncMessage(d, inv, status) {
  if (!inv.message_id) return;
  d.prepare('UPDATE chat_messages SET text = ? WHERE id = ?').run(metaOf(inv, status), inv.message_id);
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(inv.message_id);
  if (m) notification.broadcast('message_update', { contactId: inv.contact_id, message: m });
}

function updateStatus(d, inv, status) {
  d.prepare('UPDATE listen_together SET status = ? WHERE id = ?').run(status, inv.id);
  syncMessage(d, inv, status);
}

function broadcastInvite(type, inv) {
  const ci = effectiveContactInfo(db, inv.contact_id);
  const payload = {
    type,
    invite: {
      ...inv,
      contact_name: ci.name,
      contact_avatar: ci.avatar,
      my_avatar: effectiveMyAvatar(db, inv.contact_id)
    }
  };
  notification.broadcast('listen_together', payload);
}

/* ═══ 我邀请 TA 一起听当前歌曲 ═══ */
function sendInvite(contactId, song = {}) {
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return { error: '对方已拉黑，邀请无法送达' };
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO listen_together(contact_id, from_side, song_id, song_title, song_artist, song_cover, status, created_at)
       VALUES(?, 'me', ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      contactId,
      song.id || 0,
      (song.title || '').slice(0, 200),
      (song.artist || '').slice(0, 200),
      song.cover || '',
      Math.floor(Date.now() / 1000)
    );
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM listen_together WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'me', 'listen_invite', ?, 'sent', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE listen_together SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);

  setTimeout(() => respondAsContact(invId), randInt(4000, 10000));
  return { id: invId };
}

/* TA 对我的邀请做出响应（定时触发） */
function respondAsContact(inviteId) {
  const inv = db.prepare('SELECT * FROM listen_together WHERE id = ?').get(inviteId);
  if (!inv || inv.status !== 'pending') return;
  const accept = Math.random() < 0.8;
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  broadcastInvite(accept ? 'accepted' : 'rejected', { ...inv, status: accept ? 'accepted' : 'rejected' });
}

/* ═══ TA 邀请我 ═══ */
function contactInvite(contactId, preset = {}) {
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return null;
  const dup = db
    .prepare("SELECT 1 FROM listen_together WHERE contact_id = ? AND status = 'pending'")
    .get(contactId);
  if (dup) return null;
  // TA 邀请时带的歌：优先 preset（我在听的那首），否则随机挑一首库里的
  let song = preset.song || {};
  if (!song.id) {
    const row = db.prepare("SELECT id, title, artist, cover FROM songs WHERE source != '' ORDER BY RANDOM() LIMIT 1").get();
    if (row) song = row;
  }
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO listen_together(contact_id, from_side, song_id, song_title, song_artist, song_cover, status, created_at)
       VALUES(?, 'contact', ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      contactId,
      song.id || 0,
      (song.title || '').slice(0, 200),
      (song.artist || '').slice(0, 200),
      song.cover || '',
      Math.floor(Date.now() / 1000)
    );
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM listen_together WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'contact', 'listen_invite', ?, 'read', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE listen_together SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);
  const fresh = db.prepare('SELECT * FROM listen_together WHERE id = ?').get(invId);
  const info2 = effectiveContactInfo(db, contactId);
  notification.broadcast('new_messages', {
    contactId,
    messages: [db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(Number(mi.lastInsertRowid))],
    avatar: info2.avatar,
    name: info2.name
  });
  notification.broadcast('badge_update', settingsRepo.getBadges());
  broadcastInvite('incoming', fresh);
  return invId;
}

/* ═══ 我对 TA 的邀请做出响应（聊天卡片或歌词页点按钮） ═══ */
function respond(inviteId, accept) {
  const inv = db.prepare('SELECT * FROM listen_together WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'contact' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  broadcastInvite(accept ? 'accepted' : 'rejected', { ...inv, status: accept ? 'accepted' : 'rejected' });
  return { ok: true, status: accept ? 'accepted' : 'rejected' };
}

/* ═══ 我取消自己发出的邀请 ═══ */
function cancel(inviteId) {
  const inv = db.prepare('SELECT * FROM listen_together WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'me' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, 'cancelled');
  broadcastInvite('cancelled', { ...inv, status: 'cancelled' });
  return { ok: true };
}

/* ═══ 结束一起听（任一方） ═══ */
function end(inviteId) {
  const inv = db.prepare('SELECT * FROM listen_together WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.status !== 'accepted') return { error: '没有进行中的一起听' };
  const newStatus = 'ended';
  db.prepare('UPDATE listen_together SET status = ? WHERE id = ?').run(newStatus, inv.id);
  if (inv.message_id) {
    const m = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(inv.message_id);
    if (m) notification.broadcast('message_update', { contactId: inv.contact_id, message: m });
  }
  broadcastInvite('ended', { ...inv, status: newStatus });
  return { ok: true };
}

function listInvites(limit = 50) {
  return db
    .prepare(
      `SELECT i.*, c.name AS contact_name,
              CASE WHEN cd.sync_chat_avatar = 1 AND IFNULL(cd.partner_avatar, '') != ''
                   THEN cd.partner_avatar ELSE c.avatar END AS contact_avatar,
              CASE WHEN cd.sync_chat_avatar = 1 AND IFNULL(cd.my_avatar, '') != ''
                   THEN cd.my_avatar
                   ELSE IFNULL(cs.my_avatar, IFNULL(cd.my_avatar, '')) END AS my_avatar
       FROM listen_together i
       LEFT JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN contact_desktop cd ON cd.contact_id = i.contact_id
       LEFT JOIN contact_settings cs ON cs.contact_id = i.contact_id
       ORDER BY i.id DESC LIMIT ?`
    )
    .all(Math.max(1, Math.min(200, Number(limit) || 50)));
}

/* ═══ cron 每分钟：TA 小概率主动邀请我 + 过期清理 ═══ */
function contactInviteTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Math.floor(Date.now() / 1000);
    for (const c of rows) {
      const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(c.id);
      if (st && st.blocked) continue;
      if (Math.random() < 0.004) contactInvite(c.id);
    }
    const stale = db.prepare("SELECT * FROM listen_together WHERE status = 'pending'").all();
    for (const inv of stale) {
      const age = now - Number(inv.created_at || 0);
      if (inv.from_side === 'contact' && age > 600) updateStatus(db, inv, 'expired');
      else if (inv.from_side === 'me' && age > 120) updateStatus(db, inv, 'expired');
    }
    // 进行中的一起听超过 2 小时自动结束（避免遗留会话一直显示双人头像）
    const active = db.prepare("SELECT * FROM listen_together WHERE status = 'accepted'").all();
    for (const inv of active) {
      const age = now - Number(inv.created_at || 0);
      if (age > 7200) {
        updateStatus(db, inv, 'ended');
        broadcastInvite('ended', { ...inv, status: 'ended' });
      }
    }
  } catch (e) {
    console.error('[listenTick]', e.message);
  }
}

module.exports = {
  sendInvite, respond, cancel, end, listInvites, contactInvite, contactInviteTick
};
