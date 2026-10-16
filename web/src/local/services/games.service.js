// 游戏邀请：我邀请联系人一起玩某款小游戏 / 联系人主动邀请我。
// 邀请落 game_invites 表，并在聊天里落一条 content_type='game_invite'
// 的卡片消息（text 存 JSON 元数据），聊天页可查看状态、受邀方可接受/拒绝。
// 我发出的邀请：TA 会在几秒后接受（较大概率）或婉拒；
// TA 邀我：我在聊天卡片接受/拒绝，接受后进入对局。
import db from '../db'
import * as notification from './notification.service'
import * as settingsRepo from '../repositories/settings.repo'

/* 游戏清单（kind → 展示名） */
export const GAME_NAMES = {
  memory: '默契翻牌',
  ghost: '抽鬼牌',
  gomoku: '五子棋',
  go: '围棋',
  aeroplane: '飞行棋',
  rps: '猜拳',
  guess: '猜数'
}

export function getGameName(kind) {
  return GAME_NAMES[kind] || '小游戏'
}

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1));
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
    gameKind: inv.game_kind,
    gameName: getGameName(inv.game_kind),
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
  d.prepare('UPDATE game_invites SET status = ? WHERE id = ?').run(status, inv.id);
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
  notification.broadcast('game_invite', payload);
}

/* ═══ 我邀请 TA 一起玩某款游戏 ═══ */
function sendInvite(contactId, gameKind = 'memory') {
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return { error: '对方已拉黑，邀请无法送达' };
  const kind = GAME_NAMES[gameKind] ? gameKind : 'memory';
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO game_invites(contact_id, from_side, game_kind, status, created_at)
       VALUES(?, 'me', ?, 'pending', ?)`
    )
    .run(contactId, kind, Math.floor(Date.now() / 1000));
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM game_invites WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'me', 'game_invite', ?, 'sent', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE game_invites SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);

  setTimeout(() => respondAsContact(invId), randInt(4000, 10000));
  return { id: invId };
}

/* TA 对我的邀请做出响应（定时触发） */
function respondAsContact(inviteId) {
  const inv = db.prepare('SELECT * FROM game_invites WHERE id = ?').get(inviteId);
  if (!inv || inv.status !== 'pending') return;
  const accept = Math.random() < 0.85;
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  broadcastInvite(accept ? 'accepted' : 'rejected', { ...inv, status: accept ? 'accepted' : 'rejected' });
}

/* ═══ TA 邀请我 ═══ */
function contactInvite(contactId) {
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return null;
  const dup = db
    .prepare("SELECT 1 FROM game_invites WHERE contact_id = ? AND status = 'pending'")
    .get(contactId);
  if (dup) return null;
  const kinds = Object.keys(GAME_NAMES);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO game_invites(contact_id, from_side, game_kind, status, created_at)
       VALUES(?, 'contact', ?, 'pending', ?)`
    )
    .run(contactId, kind, Math.floor(Date.now() / 1000));
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM game_invites WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'contact', 'game_invite', ?, 'read', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE game_invites SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);
  const fresh = db.prepare('SELECT * FROM game_invites WHERE id = ?').get(invId);
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

/* ═══ 我对 TA 的邀请做出响应（聊天卡片点按钮） ═══ */
function respond(inviteId, accept) {
  const inv = db.prepare('SELECT * FROM game_invites WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'contact' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  broadcastInvite(accept ? 'accepted' : 'rejected', { ...inv, status: accept ? 'accepted' : 'rejected' });
  const ci = effectiveContactInfo(db, inv.contact_id);
  return {
    ok: true,
    status: accept ? 'accepted' : 'rejected',
    gameKind: inv.game_kind,
    contactId: inv.contact_id,
    contactName: ci.name,
    contactAvatar: ci.avatar,
    myAvatar: effectiveMyAvatar(db, inv.contact_id)
  };
}

/* ═══ 我取消自己发出的邀请 ═══ */
function cancel(inviteId) {
  const inv = db.prepare('SELECT * FROM game_invites WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'me' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, 'cancelled');
  broadcastInvite('cancelled', { ...inv, status: 'cancelled' });
  return { ok: true };
}

/* ═══ 结束对局（任一方） ═══ */
function end(inviteId) {
  const inv = db.prepare('SELECT * FROM game_invites WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.status !== 'accepted') return { error: '没有进行中的对局' };
  db.prepare('UPDATE game_invites SET status = ? WHERE id = ?').run('ended', inv.id);
  if (inv.message_id) {
    const m = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(inv.message_id);
    if (m) notification.broadcast('message_update', { contactId: inv.contact_id, message: m });
  }
  broadcastInvite('ended', { ...inv, status: 'ended' });
  return { ok: true };
}

/* 当前与某联系人进行中的对局（accepted 且未结束） */
function getActive(contactId) {
  const inv = db
    .prepare("SELECT * FROM game_invites WHERE contact_id = ? AND status = 'accepted' ORDER BY id DESC LIMIT 1")
    .get(contactId);
  return inv || null;
}

/* ═══ 每分钟：TA 小概率主动邀我玩游戏 + 过期清理 ═══ */
function contactInviteTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Math.floor(Date.now() / 1000);
    for (const c of rows) {
      const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(c.id);
      if (st && st.blocked) continue;
      if (Math.random() < 0.004) contactInvite(c.id);
    }
    /* 过期清理：TA 邀我 10 分钟没处理 / 我邀 TA 2 分钟没响应（定时器丢失时兜底） */
    const stale = db.prepare("SELECT * FROM game_invites WHERE status = 'pending'").all();
    for (const inv of stale) {
      const age = now - Number(inv.created_at || 0);
      if (inv.from_side === 'contact' && age > 600) updateStatus(db, inv, 'expired');
      else if (inv.from_side === 'me' && age > 120) updateStatus(db, inv, 'expired');
    }
  } catch (e) {
    console.error('[gameTick]', e.message);
  }
}

/* 邀请列表（最近 limit 条） */
function listInvites(limit = 50) {
  return db.prepare('SELECT * FROM game_invites ORDER BY id DESC LIMIT ?').all(limit);
}

export {
  sendInvite,
  respond,
  cancel,
  end,
  getActive,
  listInvites,
  contactInvite,
  contactInviteTick
}
