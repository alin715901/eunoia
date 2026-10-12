// 陪伴邀请：我邀请联系人一起吃饭/学习…，或联系人来邀请我。
// 邀请落 companion_invites 表，并在聊天里落一条 content_type='companion_invite'
// 的卡片消息（text 存 JSON 元数据），聊天页可查看状态、受邀方可接受/拒绝。
// 我发出的邀请：TA 会在几秒后响应（大多数接受，小概率拒绝，拒绝后偶尔反邀）；
// TA 邀我：由 cron 每分钟小概率触发，我在聊天卡片或陪伴页接受/拒绝，10 分钟不回应自动过期。
const db = require('../db');
const notification = require('./notification.service');
const settingsRepo = require('../repositories/settings.repo');

const ACTIVITIES = {
  eat: '吃饭',
  sleep: '睡觉',
  work: '工作',
  study: '学习',
  train: '锻炼',
  fish: '摸鱼'
};

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function getNextSeq(d, contactId) {
  const r = d.prepare('SELECT MAX(seq) AS m FROM chat_messages WHERE contact_id = ?').get(contactId);
  return (Number(r && r.m) || 0) + 1;
}

/* 联系人卡片消息统一头像（同步到聊天的人物卡头像优先） */
function effectiveContactInfo(d, contactId) {
  const c = d.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(contactId);
  if (!c) return { avatar: '', name: '对方' };
  let avatar = c.avatar || '';
  const desk = d.prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?').get(contactId);
  if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar;
  return { avatar, name: c.name || '对方' };
}

function metaOf(inv, status) {
  return JSON.stringify({
    inviteId: inv.id,
    activity: inv.activity,
    name: ACTIVITIES[inv.activity] || '陪伴',
    mode: inv.mode,
    durationSec: inv.duration_sec || 0,
    from: inv.from_side,
    status: status || inv.status
  });
}

/* 把邀请状态写回它对应的聊天卡片消息，并广播更新（聊天页卡片实时变状态） */
function syncMessage(d, inv, status) {
  if (!inv.message_id) return;
  d.prepare('UPDATE chat_messages SET text = ? WHERE id = ?').run(metaOf(inv, status), inv.message_id);
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(inv.message_id);
  if (m) notification.broadcast('message_update', { contactId: inv.contact_id, message: m });
}

function updateStatus(d, inv, status) {
  d.prepare('UPDATE companion_invites SET status = ? WHERE id = ?').run(status, inv.id);
  syncMessage(d, inv, status);
}

/* ═══ 我邀请 TA ═══
   落库 + 聊天卡片（我的一侧），几秒后 TA 响应：约七成接受、三成拒绝；
   拒绝后 1/4 概率 TA 过一会儿反过来邀请我。 */
function sendInvite(contactId, { activity, mode, durationSec } = {}) {
  if (!ACTIVITIES[activity]) activity = 'eat';
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return { error: '对方已拉黑，邀请无法送达' };
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO companion_invites(contact_id, from_side, activity, mode, duration_sec, status, created_at)
       VALUES(?, 'me', ?, ?, ?, 'pending', ?)`
    )
    .run(contactId, activity, mode === 'down' ? 'down' : 'up', Math.max(0, Number(durationSec) || 0), Math.floor(Date.now() / 1000));
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM companion_invites WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'me', 'companion_invite', ?, 'sent', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE companion_invites SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);

  // TA 的响应：4~10 秒后
  setTimeout(() => respondAsContact(invId), randInt(4000, 10000));
  return { id: invId };
}

/* TA 对我的邀请做出响应（定时触发） */
function respondAsContact(inviteId) {
  const inv = db.prepare('SELECT * FROM companion_invites WHERE id = ?').get(inviteId);
  if (!inv || inv.status !== 'pending') return;
  const accept = Math.random() < 0.7;
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  notification.broadcast('companion_invite', {
    type: 'responded',
    invite: { ...inv, status: accept ? 'accepted' : 'rejected' }
  });
  if (!accept && Math.random() < 0.25) {
    // 反邀：TA 拒绝后过一会儿换个活动来邀请我
    setTimeout(() => contactInvite(inv.contact_id), randInt(15000, 40000));
  }
}

/* ═══ TA 邀请我 ═══
   落库 + 聊天卡片（对方一侧，带接受/拒绝按钮），并 SSE 通知陪伴页弹横幅。 */
function contactInvite(contactId, preset = {}) {
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return null;
  // 每日上限：最近 24 小时内 TA 主动邀我的次数已 ≥5 则不再触发（约 5 次/天封顶）
  const dayCnt = db
    .prepare("SELECT COUNT(*) AS n FROM companion_invites WHERE contact_id = ? AND from_side = 'contact' AND created_at >= ?")
    .get(contactId, Math.floor(Date.now() / 1000) - 86400);
  if (dayCnt && dayCnt.n >= 5) return null;
  // 已有任一方未处理的邀请时不重复邀请，避免刷屏
  const dup = db
    .prepare("SELECT 1 FROM companion_invites WHERE contact_id = ? AND status = 'pending'")
    .get(contactId);
  if (dup) return null;
  const keys = Object.keys(ACTIVITIES);
  const activity = preset.activity && ACTIVITIES[preset.activity] ? preset.activity : keys[randInt(0, keys.length - 1)];
  const mode = preset.mode === 'down' ? 'down' : Math.random() < 0.4 ? 'down' : 'up';
  const durationSec = mode === 'down' ? [15, 30, 45, 60][randInt(0, 3)] * 60 : 0;
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO companion_invites(contact_id, from_side, activity, mode, duration_sec, status, created_at)
       VALUES(?, 'contact', ?, ?, ?, 'pending', ?)`
    )
    .run(contactId, activity, mode, durationSec, Math.floor(Date.now() / 1000));
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM companion_invites WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'contact', 'companion_invite', ?, 'read', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE companion_invites SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);
  const fresh = db.prepare('SELECT * FROM companion_invites WHERE id = ?').get(invId);
  const info2 = effectiveContactInfo(db, contactId);
  notification.broadcast('new_messages', { contactId, messages: [db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(Number(mi.lastInsertRowid))], avatar: info2.avatar, name: info2.name });
  notification.broadcast('badge_update', settingsRepo.getBadges());
  // 邀请横幅/卡片需要显示对方名称与头像（fresh 本身不含联系人名）
  notification.broadcast('companion_invite', {
    type: 'incoming',
    invite: { ...fresh, contact_name: info2.name, contact_avatar: info2.avatar }
  });
  return invId;
}

/* ═══ 我对 TA 的邀请做出响应（聊天卡片或陪伴页点按钮） ═══ */
function respond(inviteId, accept) {
  const inv = db.prepare('SELECT * FROM companion_invites WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'contact' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  notification.broadcast('companion_invite', {
    type: accept ? 'accepted' : 'rejected',
    invite: { ...inv, status: accept ? 'accepted' : 'rejected' }
  });
  return { ok: true, status: accept ? 'accepted' : 'rejected' };
}

/* ═══ 我取消自己发出的邀请 ═══ */
function cancel(inviteId) {
  const inv = db.prepare('SELECT * FROM companion_invites WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'me' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, 'cancelled');
  notification.broadcast('companion_invite', { type: 'cancelled', invite: { ...inv, status: 'cancelled' } });
  return { ok: true };
}

function listInvites(limit = 50) {
  return db
    .prepare(
      `SELECT i.*, c.name AS contact_name,
              CASE WHEN cd.sync_chat_avatar = 1 AND IFNULL(cd.partner_avatar, '') != ''
                   THEN cd.partner_avatar ELSE c.avatar END AS contact_avatar
       FROM companion_invites i
       LEFT JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN contact_desktop cd ON cd.contact_id = i.contact_id
       ORDER BY i.id DESC LIMIT ?`
    )
    .all(Math.max(1, Math.min(200, Number(limit) || 50)));
}

/* ═══ cron 每分钟：TA 小概率主动邀请我 + 过期清理 ═══
   单个联系人每分钟约 0.35% 概率（期望 ≈ 5 次/天），并由 contactInvite 内每日硬上限 5 次兜底；
   未回应的受邀邀请 10 分钟后过期、我发出的搁置邀请 2 分钟后过期（服务重启丢定时器时兜底）。 */
function contactInviteTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Math.floor(Date.now() / 1000);
    for (const c of rows) {
      const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(c.id);
      if (st && st.blocked) continue;
      if (Math.random() < 0.0035) contactInvite(c.id);
    }
    // 过期清理
    const stale = db
      .prepare("SELECT * FROM companion_invites WHERE status = 'pending'")
      .all();
    for (const inv of stale) {
      const age = now - Number(inv.created_at || 0);
      if (inv.from_side === 'contact' && age > 600) updateStatus(db, inv, 'expired');
      else if (inv.from_side === 'me' && age > 120) updateStatus(db, inv, 'expired');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[companionTick]', e.message);
  }
}

module.exports = { sendInvite, respond, cancel, listInvites, contactInvite, contactInviteTick, ACTIVITIES };
