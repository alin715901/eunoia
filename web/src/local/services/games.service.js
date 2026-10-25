// 游戏邀请：我邀请联系人一起玩某款小游戏 / 联系人主动邀请我。
// 邀请落 game_invites 表，并在聊天里落一条 content_type='game_invite'
// 的卡片消息（text 存 JSON 元数据），聊天页可查看状态、受邀方可接受/拒绝。
// 我发出的邀请：TA 会在几秒后接受（较大概率）或婉拒；
// TA 邀我：我在聊天卡片接受/拒绝，接受后进入对局。
import db from '../db'
import { hourlyToPerMinute } from '@/utils/prob'
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

/* 游戏展示元数据（kind → 图标/名称/简介/规则），大厅与入口页共用 */
export const GAME_META = {
  memory: {
    name: '默契翻牌', emoji: '🃏', desc: '单人休闲计时局，翻完所有配对',
    rules: [
      '16 张牌（8 对图案）背面朝上铺开，每次翻开两张。',
      '自己玩：休闲计时局，图案相同即配对成功，全部翻完即结束，比步数和用时，没有输赢。',
      '一起玩：双方轮流翻牌，每人每次翻两张；配对上就继续翻，没配上换对方。翻完全部结束。'
    ]
  },
  ghost: {
    name: '抽鬼牌', emoji: '👻', desc: '轮流抽牌，抽到小王者输',
    rules: [
      '一副扑克只留一张「小王」当鬼牌，共 53 张；鬼牌是唯一凑不成对子的牌。',
      '发牌：洗牌后平分，多出的暗牌一定不是鬼牌（鬼牌必在对局中）；先把手里的同点数对子（花色不限）直接弃掉。',
      '先后手：双方各掷一次骰子，点数大的先抽。',
      '轮流抽牌：双方手牌呈扇形铺开，点对方一张牌选中（上浮），再点一次抽出；能配对手牌就一起弃掉，凑不成留在手里。',
      '胜负：手牌先出光者获胜；终局时手里留着鬼牌的人就是输家。'
    ]
  },
  gomoku: {
    name: '五子棋', emoji: '⚫', desc: '五子连珠即获胜',
    rules: [
      '15×15 棋盘，你执黑先手，对方执白，双方轮流落子。',
      '横、竖、斜任意方向，先让自己的五子连成一线者获胜。'
    ]
  },
  go: {
    name: '围棋', emoji: '⚪', desc: '9 路/13 路棋盘，吃子数地',
    rules: [
      '两种难度：简单为 9×9 棋盘，困难为 13×13 棋盘；棋子落在交叉点上。',
      '你执黑先手，对方执白，双方轮流落子。',
      '吃子：棋子周围的气被对方堵完就会被提掉；不能下自杀手。',
      '终局：双方连续虚着（停一手）结束，按中国规则数地——自己的子加上围住的空，无贴目，地多者胜。'
    ]
  },
  aeroplane: {
    name: '飞行棋', emoji: '✈️', desc: '传统四色棋盘，4 架飞机竞速',
    rules: [
      '传统四色棋盘：双方各执一色（你为蓝、对方为红），停机坪分列棋盘对角，每方 4 架飞机。',
      '掷出 6 点一架飞机起飞到本方起飞点，并可再掷一次；飞机沿外围公共赛道顺时针前进。',
      '踩到本方彩色三角飞行格，可直接飞到远端同色三角，大幅领先。',
      '落到对方飞机所在格即把它撞回停机坪；走完一圈后经本方颜色终点通道冲向中心终点，需精确点数，超过会反弹。',
      '谁先把任意一架飞机开到中心终点，谁获胜。'
    ]
  },
  rps: {
    name: '猜拳', emoji: '✊', desc: '三局两胜定输赢',
    rules: [
      '和对方猜拳，三局两胜。',
      '石头克剪刀、剪刀克布、布克石头。',
      '出拳相同算平局，不计分也不耗局数，重新再猜。'
    ]
  },
  guess: {
    name: '猜数', emoji: '🔢', desc: '双向猜数对决，简单1-100/困难1-1000',
    rules: [
      '两种难度：简单 1-100、困难 1-1000，先选难度再开始。',
      '双方先掷骰子，点数大的一方先出题（想一个数），另一方来猜；同点数则重掷。',
      '猜的人根据「大了 / 小了」提示缩小范围，猜中即记录本次次数。',
      '两轮互换角色（你出题对方猜 ↔ 对方出题你猜），结束后比次数：用得少的一方获胜，相同则平局。'
    ]
  }
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

  /* 广播新消息：让正开着该会话的聊天页立即出现邀请卡片，聊天列表预览/角标同步刷新。
     之前只有「TA 邀我」广播、「我邀 TA」不广播——从游戏大厅发完邀请回到聊天，
     keep-alive 缓存的聊天页不会重新加载，邀请卡片就死活不出现（列表预览却有，对不上）。
     与 TA 邀我 / 一起听 / 一起观影 / 陪伴邀请的处理保持一致。 */
  const info2 = effectiveContactInfo(db, contactId);
  notification.broadcast('new_messages', {
    contactId,
    messages: [db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(Number(mi.lastInsertRowid))],
    avatar: info2.avatar,
    name: info2.name
  });
  notification.broadcast('badge_update', settingsRepo.getBadges());

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
      const st = db.prepare('SELECT blocked, game_invite_prob FROM contact_settings WHERE contact_id = ?').get(c.id);
      if (st && st.blocked) continue;
      if (Math.random() < hourlyToPerMinute(st ? st.game_invite_prob : 21)) contactInvite(c.id);
    }
    /* 过期清理：超过 5 分钟没做回应，不分发起方向（我邀 TA / TA 邀我）一律过期 */
    const stale = db.prepare("SELECT * FROM game_invites WHERE status = 'pending'").all();
    for (const inv of stale) {
      const age = now - Number(inv.created_at || 0);
      if (age > 300) updateStatus(db, inv, 'expired');
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
