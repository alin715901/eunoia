// 一起观影：我邀请联系人一起看某部影片 / 联系人主动邀请我。
// 邀请落 cinema_together 表，并在聊天里落一条 content_type='cinema_invite'
// 的卡片消息（text 存 JSON 元数据），聊天页可查看状态、受邀方可接受/拒绝。
// 我发出的邀请：TA 会在几秒后接受（较大概率）或婉拒；
// TA 邀我：我在聊天卡片或影院播放器接受/拒绝。
import db from '../db'
import { hourlyToPerMinute } from '@/utils/prob'
import * as notification from './notification.service'
import * as settingsRepo from '../repositories/settings.repo'

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
  const isGroup = contactKind(inv.contact_id) === 'group';
  const members = isGroup ? groupMembers(inv.contact_id) : [];
  return JSON.stringify({
    inviteId: inv.id,
    filmTitle: inv.film_title,
    filmUrl: inv.film_url,
    playSrc: inv.play_src,
    playKind: inv.play_kind,
    from: inv.from_side,
    status: status || inv.status,
    isGroup,
    groupMembers: members,
    contactName: ci.name,
    contactAvatar: ci.avatar,
    myAvatar: effectiveMyAvatar(db, inv.contact_id)
  });
}

/* 联系人类型：person / group */
function contactKind(contactId) {
  const r = db.prepare('SELECT kind FROM contacts WHERE id = ?').get(contactId);
  return (r && r.kind) || 'person';
}

/* 群成员列表（id/name/avatar） */
function groupMembers(groupId) {
  return db
    .prepare(
      `SELECT c.id, c.name, c.avatar FROM contact_members m
       JOIN contacts c ON c.id = m.member_id WHERE m.group_id = ?`
    )
    .all(groupId)
    .map((m) => ({ id: m.id, name: m.name || '成员', avatar: m.avatar || '' }));
}

/* 把邀请状态写回聊天卡片消息，并广播更新（聊天页卡片实时变状态） */
function syncMessage(d, inv, status) {
  if (!inv.message_id) return;
  d.prepare('UPDATE chat_messages SET text = ? WHERE id = ?').run(metaOf(inv, status), inv.message_id);
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(inv.message_id);
  if (m) notification.broadcast('message_update', { contactId: inv.contact_id, message: m });
}

function updateStatus(d, inv, status) {
  d.prepare('UPDATE cinema_together SET status = ? WHERE id = ?').run(status, inv.id);
  syncMessage(d, inv, status);
}

function broadcastInvite(type, inv) {
  const ci = effectiveContactInfo(db, inv.contact_id);
  const isGroup = contactKind(inv.contact_id) === 'group';
  const payload = {
    type,
    invite: {
      ...inv,
      is_group: isGroup,
      group_members: isGroup ? groupMembers(inv.contact_id) : [],
      contact_name: ci.name,
      contact_avatar: ci.avatar,
      my_avatar: effectiveMyAvatar(db, inv.contact_id)
    }
  };
  notification.broadcast('cinema_together', payload);
}

/* ═══ 我邀请 TA 一起看某部影片 ═══ */
function sendInvite(contactId, film = {}) {
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return { error: '对方已拉黑，邀请无法送达' };
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO cinema_together(contact_id, from_side, film_title, film_url, play_src, play_kind, status, created_at)
       VALUES(?, 'me', ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      contactId,
      (film.title || '').slice(0, 200),
      (film.url || '').slice(0, 500),
      (film.playSrc || '').slice(0, 500),
      film.playKind || 'iframe',
      Math.floor(Date.now() / 1000)
    );
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM cinema_together WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'me', 'cinema_invite', ?, 'sent', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE cinema_together SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);

  setTimeout(() => respondAsContact(invId), randInt(4000, 10000));
  return { id: invId };
}

/* TA 对我的邀请做出响应（定时触发） */
function respondAsContact(inviteId) {
  const inv = db.prepare('SELECT * FROM cinema_together WHERE id = ?').get(inviteId);
  if (!inv || inv.status !== 'pending') return;
  const accept = Math.random() < 0.85;
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  broadcastInvite(accept ? 'accepted' : 'rejected', { ...inv, status: accept ? 'accepted' : 'rejected' });
}

/* ═══ TA 邀请我 ═══ */
function contactInvite(contactId, preset = {}) {
  const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (st && st.blocked) return null;
  const dup = db
    .prepare("SELECT 1 FROM cinema_together WHERE contact_id = ? AND status = 'pending'")
    .get(contactId);
  if (dup) return null;
  // TA 邀我时带的片：优先 preset（我正在看的那部），否则从片单里随机挑一条
  let film = preset.film || {};
  if (!film.url) {
    const rows = db.prepare("SELECT title, body FROM app_items WHERE module = 'cinema_links' AND body != ''").all();
    /* 优先挑应用内能播的（B站/腾讯/mp4 直链），保证接受后能直接进播放器 */
    const playable = rows.filter((r) => /BV[0-9A-Za-z]{10}|av\d+|v\.qq\.com|\.(mp4|webm|ogg|mov|m4v|m3u8)(\?.*)?$/i.test(r.body || ''));
    const pool = playable.length ? playable : rows;
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (pick) film = { title: pick.title, url: pick.body };
  }
  if (!film.url) return null;
  const seq = getNextSeq(db, contactId);
  const info = db
    .prepare(
      `INSERT INTO cinema_together(contact_id, from_side, film_title, film_url, play_src, play_kind, status, created_at)
       VALUES(?, 'contact', ?, ?, '', 'external', 'pending', ?)`
    )
    .run(contactId, (film.title || '').slice(0, 200), (film.url || '').slice(0, 500), Math.floor(Date.now() / 1000));
  const invId = Number(info.lastInsertRowid);
  const inv = db.prepare('SELECT * FROM cinema_together WHERE id = ?').get(invId);
  const mi = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'contact', 'cinema_invite', ?, 'read', 1, ?, ?)`
    )
    .run(contactId, metaOf(inv), seq, Math.floor(Date.now() / 1000));
  db.prepare('UPDATE cinema_together SET message_id = ? WHERE id = ?').run(Number(mi.lastInsertRowid), invId);
  const fresh = db.prepare('SELECT * FROM cinema_together WHERE id = ?').get(invId);
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

/* ═══ 我对 TA 的邀请做出响应（聊天卡片或播放器里点按钮） ═══ */
function respond(inviteId, accept) {
  const inv = db.prepare('SELECT * FROM cinema_together WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'contact' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, accept ? 'accepted' : 'rejected');
  broadcastInvite(accept ? 'accepted' : 'rejected', { ...inv, status: accept ? 'accepted' : 'rejected' });
  const isGroup = contactKind(inv.contact_id) === 'group';
  const ci = effectiveContactInfo(db, inv.contact_id);
  return {
    ok: true,
    status: accept ? 'accepted' : 'rejected',
    isGroup,
    groupMembers: isGroup ? groupMembers(inv.contact_id) : [],
    film: {
      title: inv.film_title,
      url: inv.film_url,
      playSrc: inv.play_src,
      playKind: inv.play_kind
    },
    contactId: inv.contact_id,
    contactName: ci.name,
    contactAvatar: ci.avatar,
    myAvatar: effectiveMyAvatar(db, inv.contact_id)
  };
}

/* ═══ 我取消自己发出的邀请 ═══ */
function cancel(inviteId) {
  const inv = db.prepare('SELECT * FROM cinema_together WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.from_side !== 'me' || inv.status !== 'pending') return { error: '邀请已处理或不存在' };
  updateStatus(db, inv, 'cancelled');
  broadcastInvite('cancelled', { ...inv, status: 'cancelled' });
  return { ok: true };
}

/* ═══ 结束一起观影（任一方） ═══ */
function end(inviteId) {
  const inv = db.prepare('SELECT * FROM cinema_together WHERE id = ?').get(Number(inviteId));
  if (!inv || inv.status !== 'accepted') return { error: '没有进行中的一起观影' };
  const newStatus = 'ended';
  db.prepare('UPDATE cinema_together SET status = ? WHERE id = ?').run(newStatus, inv.id);
  if (inv.message_id) {
    const m = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(inv.message_id);
    if (m) notification.broadcast('message_update', { contactId: inv.contact_id, message: m });
  }
  broadcastInvite('ended', { ...inv, status: newStatus });
  return { ok: true };
}

/* 当前与某联系人进行中的一起观影（accepted 且未结束） */
function getActive(contactId) {
  const inv = db
    .prepare("SELECT * FROM cinema_together WHERE contact_id = ? AND status = 'accepted' ORDER BY id DESC LIMIT 1")
    .get(contactId);
  return inv || null;
}

/* ═══ 每分钟：TA 小概率主动邀我观影 + 过期清理 + 超时自动结束 ═══ */
function contactInviteTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Math.floor(Date.now() / 1000);
    for (const c of rows) {
      const st = db.prepare('SELECT blocked, cinema_invite_prob FROM contact_settings WHERE contact_id = ?').get(c.id);
      if (st && st.blocked) continue;
      if (Math.random() < hourlyToPerMinute(st ? st.cinema_invite_prob : 21)) contactInvite(c.id);
    }
    /* 过期清理：超过 5 分钟没做回应，不分发起方向（我邀 TA / TA 邀我）一律过期 */
    const stale = db.prepare("SELECT * FROM cinema_together WHERE status = 'pending'").all();
    for (const inv of stale) {
      const age = now - Number(inv.created_at || 0);
      if (age > 300) updateStatus(db, inv, 'expired');
    }
    /* 进行中的一起观影超过 2 小时自动结束（避免遗留会话一直显示计时条） */
    const active = db.prepare("SELECT * FROM cinema_together WHERE status = 'accepted'").all();
    for (const inv of active) {
      const age = now - Number(inv.created_at || 0);
      if (age > 7200) {
        updateStatus(db, inv, 'ended');
        broadcastInvite('ended', { ...inv, status: 'ended' });
      }
    }
  } catch (e) {
    console.error('[cinemaTick]', e.message);
  }
}

/* 邀请列表（最近 limit 条） */
function listInvites(limit = 50) {
  return db.prepare('SELECT * FROM cinema_together ORDER BY id DESC LIMIT ?').all(limit);
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
