import db from '../db'
import { drawCards, drawCardsForMember, drawPokeCard } from './cardDraw.service'
import * as notification from './notification.service'
import * as settingsRepo from '../repositories/settings.repo'
import * as chatRepo from '../repositories/chat.repo'
import * as walletRepo from '../repositories/wallet.repo'

function randInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/* 回答问题时长：优先用 answer_delay（对方回答「提问」的速度），
   未设置时回落 reply_delay，再不行用 1~5 秒兜底 */
function answerDelayOf(st) {
  const aLo = Number(st.answer_delay_min);
  const aHi = Number(st.answer_delay_max);
  const lo = Number.isFinite(aLo) && aLo > 0 ? aLo : (Number(st.reply_delay_min) || 1);
  const hiRaw = Number.isFinite(aHi) && aHi > 0 ? aHi : (Number(st.reply_delay_max) || 5);
  return [lo, Math.max(lo, hiRaw)];
}

function getNextSeq(contactId) {
  const row = db
    .prepare('SELECT COALESCE(MAX(seq), 0) m FROM chat_messages WHERE contact_id = ?')
    .get(contactId);
  return (row.m || 0) + 1;
}

function isGroup(d, contactId) {
  const c = d.prepare('SELECT kind FROM contacts WHERE id = ?').get(contactId);
  return !!(c && c.kind === 'group');
}

/* 定时器防护：联系人可能已被删除/执行出错，统一吞掉异常，绝不击垮进程 */
function guard(fn, contactId) {
  return () => {
    try {
      if (contactId != null) {
        const alive = db.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId);
        if (!alive) return;
      }
      fn();
    } catch (e) {
      console.error('[guard] skipped:', e.message);
    }
  };
}

/* 我的显示名（引用摘要前缀用）：聊天设置里的「我的备注」（contact_settings.my_name）优先，
   其次首页人物卡的名字（contact_desktop.my_name），最后回落「我」。
   改备注后新引用立即用新名字；历史引用由 contacts.repo 的 updateSettings 钩子刷新 */
function myDisplayName(d, contactId) {
  try {
    const s = d.prepare('SELECT my_name FROM contact_settings WHERE contact_id = ?').get(contactId)?.my_name;
    if (s && String(s).trim()) return String(s).trim();
    const dk = d.prepare('SELECT my_name FROM contact_desktop WHERE contact_id = ?').get(contactId)?.my_name;
    if (dk && String(dk).trim()) return String(dk).trim();
  } catch (e) { /* ignore */ }
  return '我';
}

/* 对方小概率撤回刚发出的一条消息（开关 contact_recall_enabled，内定概率 10%）；
   撤回后广播 message_update，前端把该条实时替换为居中提示「对方撤回了一条消息」 */
function maybeContactRecall(d, contactId, msgs) {
  try {
    const st = d.prepare('SELECT contact_recall_enabled FROM contact_settings WHERE contact_id = ?').get(contactId);
    if (!st || !Number(st.contact_recall_enabled)) return;
    if (Math.random() >= 0.1) return;
    const target = (msgs || []).find((m) => ['text', 'card'].includes(m.content_type) && m.text);
    if (!target) return;
    const delay = randInt(2000, 6000);
    setTimeout(
      guard(() => {
        const row = chatRepo.recallMessage(target.id);
        if (row) {
          notification.broadcast('message_update', { contactId, message: row });
          notification.broadcast('badge_update', settingsRepo.getBadges());
        }
      }, contactId),
      delay
    );
  } catch (e) {
    console.error('[maybeContactRecall] skipped:', e.message);
  }
}

// 群成员列表（附带该成员自己的设置，没有则回落群设置）
function groupMembersWithRules(d, groupId) {
  const g = d.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(groupId) || {};
  const members = d
    .prepare(
      `SELECT c.* FROM contacts c JOIN contact_members m ON m.member_id = c.id
       WHERE m.group_id = ? AND c.kind != 'group'
       ORDER BY c.sort_order ASC, c.id ASC`
    )
    .all(groupId);
  const ownMap = new Map();
  for (const r of d
    .prepare('SELECT * FROM group_member_settings WHERE group_id = ?')
    .all(groupId)) {
    let cw = r.cat_weights;
    if (typeof cw === 'string') {
      try {
        cw = JSON.parse(cw);
      } catch (e) {
        cw = {};
      }
    }
    ownMap.set(r.member_id, r);
  }
  return members.map((m) => {
    const own = ownMap.get(m.id);
    const pick = (k, dflt) => {
      if (own && own[k] !== undefined && own[k] !== null) return own[k];
      if (g[k] !== undefined && g[k] !== null) return g[k];
      return dflt;
    };
    let cw = own ? own.cat_weights : g.cat_weights;
    if (typeof cw === 'string') {
      try {
        cw = JSON.parse(cw);
      } catch (e) {
        cw = {};
      }
    }
    return {
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      cat_weights: cw || {},
      gen_ratio: pick('gen_ratio', 70),
      reply_min: pick('reply_min', 1),
      reply_max: pick('reply_max', 3),
      reply_delay_min: pick('reply_delay_min', 1),
      reply_delay_max: pick('reply_delay_max', 5),
      answer_delay_min: pick('answer_delay_min', 1),
      answer_delay_max: pick('answer_delay_max', 5),
      proactive_enabled: pick('proactive_enabled', 1),
      proactive_count: pick('proactive_count', 1),
      proactive_interval_min: pick('proactive_interval_min', 60),
      has_own: !!own,
    };
  });
}

// 让对方继续说：点聊天底部「…」时调用。不等我发消息也会立刻"正在输入"，延迟跟随「设置」里的回复时长
// （reply_delay_min ~ reply_delay_max 秒），不受「已读不回」影响——点了就是让他开口
function continueTalk(dbRef, contactId) {
  const d = dbRef || db;
  const st = d.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (!st || st.blocked) return false;
  const group = isGroup(d, contactId);
  // 群聊：随机挑一位成员接话
  let memberId = null;
  if (group) {
    const members = groupMembersWithRules(d, contactId);
    memberId = members.length ? members[Math.floor(Math.random() * members.length)].id : null;
  }
  const cards = memberId ? drawCardsForMember(d, contactId, memberId, 1) : drawCards(d, contactId, 1);
  const card = cards[0] || null;
  // 拍一拍：内定 3% 概率（点"继续说"也算对方主动发，同样触发）。命中且库里有字卡时不显示"正在输入"，
  // 走独立的短延时（约 0.8~1.6 秒），不跟随普通回复时长
  if (Math.random() < 0.03 && drawPokeCard(d)) {
    setTimeout(
      guard(() => {
        if (emitPoke(d, contactId)) maybeContactFavorite(d, contactId);
      }, contactId),
      randInt(800, 1600)
    );
    return true;
  }
  notification.broadcast('typing', { contactId, typing: true });
  setTimeout(
    guard(() => {
      // 抽到图片字卡（表情包）→ 按字卡消息落库（前端渲染为图）；纯文字字卡 → 文本消息
      const m = card && card.asset_path
        ? insertContactCard(d, contactId, card, memberId)
        : insertContactText(d, contactId, card?.content || '…', null, memberId);
      notification.broadcast('typing', { contactId, typing: false });
      const info = effectiveContactInfo(d, contactId);
      notification.broadcast('new_messages', { contactId, messages: [m], avatar: info.avatar, name: info.name });
      notification.broadcast('badge_update', settingsRepo.getBadges());
      // 开了「对方撤回消息」时，这句也有小概率被撤回
      maybeContactRecall(d, contactId, [m]);
    }, contactId),
    // 延迟跟随「设置」里的回复时长（秒）：reply_delay_min ~ reply_delay_max
    randInt(
      st.reply_delay_min || 1,
      Math.max(st.reply_delay_min || 1, st.reply_delay_max || 5)
    ) * 1000
  );
  return true;
}

// 用户发消息 -> 落库 -> 触发回复调度（支持引用某条消息：去规范化其文本/图片缩略图）
function sendUserMessage(dbRef, contactId, text, quoteId = null) {
  const d = dbRef || db;
  const seq = getNextSeq(contactId);
  let quote_text = '';
  let quote_image = '';
  if (quoteId) {
    const q = d.prepare('SELECT id, sender, text, asset_path, author_member_id FROM chat_messages WHERE id = ?').get(quoteId);
    if (q) {
      /* 微信样式：引用摘要带发送者前缀。引用我的消息 → 我的备注名；群聊成员发言 → 成员昵称；否则对方昵称 */
      const prefix = quotePrefixFor(d, contactId, q);
      const body = q.text || (q.asset_path ? '[图片]' : '');
      quote_text = prefix ? `${prefix}：${body}` : body;
      quote_image = q.asset_path || '';
    }
  }
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, quote_id, quote_text, quote_image, created_at)
       VALUES(?, 'me', 'text', ?, 'sent', 1, ?, ?, ?, ?, ?)`
    )
    .run(contactId, text, seq, quoteId || null, quote_text, quote_image, Math.floor(Date.now() / 1000));
  const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);

  scheduleReply(d, contactId);
  return msg;
}

/* 我拍对方（双击头像触发）：插入一条 sender='me' 的拍一拍系统提示。
   拍一拍算作我发出的一条消息，按对方的回复设置触发自动回复（延迟/条数/内容均跟随设置）。 */
export function sendPokeMessage(dbRef, contactId, text) {
  const d = dbRef || db;
  const seq = getNextSeq(contactId);
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'me', 'poke', ?, 'read', 1, ?, ?)`
    )
    .run(contactId, text, seq, Math.floor(Date.now() / 1000));
  const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);

  scheduleReply(d, contactId);
  return msg;
}

// 调度联系人回复（P1：发消息后触发）
// 群聊：每位成员按各自的 gen_ratio 概率独立参与回复（各延迟各条数），
//       另有不在发言者中的成员小概率稍后"主动接话"——不是一个人包揽轮流
/* 拼字卡：把抽到的多张字卡合成「一条」消息（不是分几条发）。
   以第一张为底（决定类型/图片/语音），文字部分按顺序拼接。 */
function drawMergedCards(dbRef, contactId, n) {
  const cards = drawCards(dbRef, contactId, Math.max(1, Number(n) || 1)) || [];
  if (!cards.length) return [];
  const first = cards[0];
  const texts = cards.map((c) => String(c.content || '').trim()).filter(Boolean);
  const merged = { ...first, content: texts.join(' ') || first.content || '' };
  return [merged];
}

function drawMergedForMember(dbRef, groupId, memberId, n) {
  const cards = drawCardsForMember(dbRef, groupId, memberId, Math.max(1, Number(n) || 1)) || [];
  if (!cards.length) return [];
  const first = cards[0];
  const texts = cards.map((c) => String(c.content || '').trim()).filter(Boolean);
  const merged = { ...first, content: texts.join(' ') || first.content || '' };
  return [merged];
}

function scheduleReply(dbRef, contactId) {
  const d = dbRef || db;
  const st = d.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(contactId);
  if (!st) return;
  // 已拉黑：收不到对方的消息（不再生成回复），但对方仍会"看"我发的消息——
  // 稍等 1.5~3 秒把我的消息标为已读（已送达→已读）并广播，只是永远不会有回复内容
  if (st.blocked) {
    setTimeout(
      guard(() => {
        d.prepare(
          "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
        ).run(contactId);
        notification.broadcast('messages_read', { contactId });
      }),
      randInt(1500, 3000)
    );
    return;
  }

  const group = isGroup(d, contactId);
  const members = group ? groupMembersWithRules(d, contactId) : [];

  /* 拍一拍：单聊内定 3% 概率。命中且库里有字卡时，对方不发话、直接拍一拍——
     不显示"正在输入"，走独立短延时（约 0.8~1.6 秒），不跟随普通回复时长。 */
  if (!group && Math.random() < 0.03 && drawPokeCard(d)) {
    setTimeout(
      guard(() => {
        if (emitPoke(d, contactId)) maybeContactFavorite(d, contactId);
      }),
      randInt(800, 1600)
    );
    return;
  }

  // 已读不回：开启后，有 40% 概率整条不回复（只是"看了没回"）。
  // 对方不会回复，所以不显示"正在输入中"（否则会输入后又没下文），
  // 稍等 1.5~3 秒后把我的消息标为已读，并广播 messages_read 让前端同步"已读"标识。
  if (st.read_no_reply && Math.random() < 0.4) {
    setTimeout(
      guard(() => {
        d.prepare(
          "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
        ).run(contactId);
        // 不弹"正在输入"，但已读标识要变化：专用事件通知前端（不触发输入状态）
        notification.broadcast('messages_read', { contactId });
        // 已读不回的同时，也可能顺手收藏我的一条消息
        maybeContactFavorite(d, contactId);
      }),
      randInt(1500, 3000)
    );
    return;
  }

  // 定时器触发时联系人可能已被删除（清空/删除联系人等），
  // 统一防护：联系人不存在或执行出错都直接跳过，绝不让定时器异常击垮进程
  function guard(fn) {
    return () => {
      try {
        const alive = d.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId);
        if (!alive) return;
        fn();
      } catch (e) {
        console.error('[scheduleReply] skipped:', e.message);
      }
    };
  }

  /* 计算联系人的"有效头像/名称"（弹窗用）：开启同步到聊天后取人物卡头像，
     与聊天界面保持一致；否则回落联系人自身头像 */
  function effectiveContactInfo() {
    const c = d.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(contactId)
    if (!c) return { avatar: '', name: '对方' }
    let avatar = c.avatar || ''
    const desk = d
      .prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?')
      .get(contactId)
    if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar
    return { avatar, name: c.name || '对方' }
  }

  notification.broadcast('typing', { contactId, typing: true });
  // 对方开始输入 = 处于"回复时间"。已读时间点：延迟 2~4 秒（模拟"看完消息再回"），
  // 避免"发送即已读"太快；若对方更快发出消息，emitCards 会兜底标已读。

  // 落库一批字卡消息并广播（quote 可选：对方本批回复的第一条带引用）
  function emitCards(cardIds, memberId, quote = null) {
    // 对方来回复 = 已读我的消息：把我的未读消息标记为已读（单勾→双勾/已读）
    d.prepare(
      "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
    ).run(contactId);
    const messages = [];
    for (let i = 0; i < cardIds.length; i++) {
      const card = cardIds[i];
      const q = i === 0 && quote ? quote : null;
      const seq = getNextSeq(contactId);
      const info = d
        .prepare(
          `INSERT INTO chat_messages(contact_id, sender, content_type, card_id, text, asset_path, duration, author_member_id, is_proactive, read_receipt, read, seq, created_at, quote_id, quote_text, quote_image)
           VALUES(?, 'contact', ?, ?, ?, ?, ?, ?, ?, 'delivered', 0, ?, ?, ?, ?, ?)`
        )
        .run(
          contactId,
          cardContentType(card),
          card.id,
          card.content,
          card.asset_path,
          card.duration,
          memberId,
          card.proactive ? 1 : 0,
          seq,
          Math.floor(Date.now() / 1000),
          q ? q.quoteId : null,
          q ? q.quoteText : '',
          q ? q.quoteImage : ''
        );
      messages.push(d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid));
    }
    // 带上有效头像/名称（同步到聊天时用人物卡头像），让弹窗与聊天界面一致
    const info = effectiveContactInfo();
    notification.broadcast('new_messages', {
      contactId,
      messages,
      avatar: info.avatar,
      name: info.name
    });
    const badges = settingsRepo.getBadges();
    notification.broadcast('badge_update', badges);
    // 对方小概率撤回刚发出的一条消息（开关在「主动消息」设置页，内定概率 10%）
    maybeContactRecall(d, contactId, messages);
  }

  /* 拍一拍：对方不说话，而是"拍了拍我"。
     从通用库拍一拍字卡里抽一条，作为居中系统提示（格式：{联系人} {字卡内容}）。
     没有拍一拍字卡时返回 false，由调用方回落到普通回复。 */
  if (!group) {
    // ─── 单聊：原逻辑不变 ───
    const count = randInt(st.reply_min || 1, Math.min(st.reply_max || 3, 7));
    const delaySec = randInt(
      st.reply_delay_min || 1,
      Math.max(st.reply_delay_min || 1, st.reply_delay_max || 5)
    );
    // 已读延迟：2~4 秒，且不超过实际回复延迟（回复发出时 emitCards 兜底标已读）
    const readDelayMs = Math.max(1, Math.min(randInt(2, 4), delaySec)) * 1000;
    setTimeout(
      guard(() => {
        d.prepare(
          "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
        ).run(contactId);
      }),
      readDelayMs
    );
    setTimeout(
      guard(() => {
        notification.broadcast('typing', { contactId, typing: false });
        d.prepare(
          "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
        ).run(contactId);
        /* 拼字卡：开了就抽 N 张合成一条（N 取设置里的 1~20 范围）；没开就按条数分开发 */
        const mergeOn = Number(st.reply_merge_enabled) === 1;
        const mergeN = randInt(
          Math.max(1, Number(st.reply_merge_min) || 1),
          Math.max(1, Number(st.reply_merge_max) || 3)
        );
        const cards = (mergeOn ? drawMergedCards(d, contactId, mergeN) : drawCards(d, contactId, count))
          .map((c) => ({ ...c, proactive: false }));
        // 对方有时会引用最近的一条消息（我的或对方自己的）来回复
        emitCards(cards, null, pickQuoteForContact(d, contactId));
        // 对方也可能收藏我的一条消息（前端弹窗提示）
        maybeContactFavorite(d, contactId);
      }),
      delaySec * 1000
    );
    return;
  }

  // ─── 群聊：多成员独立参与 ───
  // 每位成员按 gen_ratio%（默认 70%）概率独立掷骰决定是否回复；全没中则随机保底一位
  // 已读延迟：2~4 秒（回复时间内），回复更早发出时 emitCards 兜底
  setTimeout(
    guard(() => {
      d.prepare(
        "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
      ).run(contactId);
    }),
    randInt(2000, 4000)
  );
  let speakers = members.filter((m) => Math.random() * 100 < (Number(m.gen_ratio ?? 70) || 0));
  if (!speakers.length && members.length) {
    speakers = [members[Math.floor(Math.random() * members.length)]];
  }

  let maxDelay = 0;
  for (const sp of speakers) {
    const count = randInt(sp.reply_min || 1, Math.min(sp.reply_max || 3, 7));
    const delaySec = randInt(
      sp.reply_delay_min || 1,
      Math.max(sp.reply_delay_min || 1, sp.reply_delay_max || 5)
    );
    maxDelay = Math.max(maxDelay, delaySec);
    setTimeout(
      guard(() => {
        // ★ 谁发言抽谁的字卡库 + 通用库，不混抽别人的
        const mergeOn = Number(st.reply_merge_enabled) === 1;
        const mergeN = randInt(
          Math.max(1, Number(st.reply_merge_min) || 1),
          Math.max(1, Number(st.reply_merge_max) || 3)
        );
        const cards = (mergeOn
          ? drawMergedForMember(d, contactId, sp.id, mergeN)
          : drawCardsForMember(d, contactId, sp.id, count)
        ).map((c) => ({ ...c, proactive: false }));
        emitCards(cards, sp.id);
      }),
      delaySec * 1000
    );
  }

  // 主动接话：从没参与回复的成员里随机挑一位，30% 概率在回复结束后 5~20 秒再补 1~2 条
  const idle = members.filter((m) => !speakers.some((s) => s.id === m.id));
  if (idle.length && Math.random() < 0.3) {
    const p = idle[Math.floor(Math.random() * idle.length)];
    const delaySec = maxDelay + randInt(5, 20);
    setTimeout(
      guard(() => {
        const cards = drawCardsForMember(d, contactId, p.id, randInt(1, 2)).map((c) => ({
          ...c,
          proactive: true,
        }));
        emitCards(cards, p.id);
      }),
      delaySec * 1000
    );
  }

  // 输入状态在全部回复发出后关闭
  setTimeout(
    guard(() => notification.broadcast('typing', { contactId, typing: false })),
    maxDelay * 1000 + 500
  );
}

/* 拍一拍：对方不说话，而是"拍了拍我"。
   从字卡库通用分类 category='poke' 的拍一拍字卡里抽一条（即「字卡库 → 拍一拍」专区，
   由用户自行管理，与聊天里「我」的拍一拍库完全分离），
   作为居中系统提示（格式：{联系人} {字卡内容}）。
   没有拍一拍字卡时返回 false，由调用方回落到普通回复。
   模块级函数，供 scheduleReply（发消息后回复）与 continueTalk（点"继续说"）共用。 */
function emitPoke(dbRef, contactId) {
  const d = dbRef || db;
  const card = drawPokeCard(d);
  if (!card) return false;
  // 对方来拍 = 已读我的消息
  d.prepare(
    "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
  ).run(contactId);
  const seq = getNextSeq(contactId);
  // 拍一拍内容完全由用户自行添加，原样发送（格式：{联系人} {字卡内容}），不做任何拼接
  const text = card.content;
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, card_id, text, asset_path, duration, author_member_id, is_proactive, read_receipt, read, seq, created_at, quote_id, quote_text, quote_image)
       VALUES(?, 'contact', 'poke', ?, ?, ?, ?, NULL, 0, 'delivered', 1, ?, ?, NULL, '', '')`
    )
    .run(
      contactId,
      card.id,
      text,
      card.asset_path || '',
      card.duration || null,
      seq,
      Math.floor(Date.now() / 1000)
    );
  const message = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
  const info2 = effectiveContactInfo(d, contactId);
  notification.broadcast('new_messages', {
    contactId,
    messages: [message],
    avatar: info2.avatar,
    name: info2.name
  });
  const badges = settingsRepo.getBadges();
  notification.broadcast('badge_update', badges);
  return true;
}

/* ── 特殊消息：图片 / 红包 / 通话 / 提问 ──
   与普通消息并列存入 chat_messages，用 content_type 区分；
   text 字段对红包/通话/提问存 JSON 元数据（前端负责解析渲染） */

// 发送图片消息（相册选图后调用），并触发对方回复
// contentType：'image'（相册图片，默认）| 'sticker'（聊天页表情面板点发的表情包）——
// 分开存储是为了前端按不同尺寸渲染（表情包更小，参考微信表情包气泡）
function sendImageMessage(dbRef, contactId, assetPath, contentType = 'image') {
  const d = dbRef || db;
  const ct = contentType === 'sticker' ? 'sticker' : 'image';
  const seq = getNextSeq(contactId);
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, asset_path, read_receipt, read, seq, created_at)
       VALUES(?, 'me', ?, '', ?, 'sent', 1, ?, ?)`
    )
    .run(contactId, ct, assetPath, seq, Math.floor(Date.now() / 1000));
  const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
  scheduleReply(d, contactId);
  return msg;
}

// 广播单条消息的更新（红包状态流转等）
function broadcastMessageUpdate(contactId, messageId) {
  const m = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (m) notification.broadcast('message_update', { contactId, message: m });
}

/* 取联系人的有效头像/名称（同步到聊天时用人物卡头像） */
function effectiveContactInfo(d, contactId) {
  const c = d.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(contactId)
  if (!c) return { avatar: '', name: '对方' }
  let avatar = c.avatar || ''
  const desk = d.prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?').get(contactId)
  if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar
  return { avatar, name: c.name || '对方' }
}

/* 对方引用回复的素材：小概率从最近几条消息（我的或对方自己的）里挑一条，拼出引用摘要 */
function pickQuoteForContact(d, contactId) {
  try {
    if (Math.random() >= 0.2) return null;
    const rows = d
      .prepare(
        `SELECT id, sender, text, asset_path, author_member_id FROM chat_messages
         WHERE contact_id = ? AND content_type IN ('text','card')
           AND text IS NOT NULL AND TRIM(text) != ''
         ORDER BY id DESC LIMIT 6`
      )
      .all(contactId);
    if (!rows.length) return null;
    const target = rows[Math.floor(Math.random() * Math.min(3, rows.length))];
    const prefix = quotePrefixFor(d, contactId, target);
    const body = target.text || (target.asset_path ? '[图片]' : '');
    if (!body) return null;
    return {
      quoteId: target.id,
      quoteText: prefix ? `${prefix}：${body}` : body,
      quoteImage: target.asset_path || '',
    };
  } catch (e) {
    return null;
  }
}

/* 引用摘要的前缀负责人：
   我的消息 → 我的备注名；群聊成员的发言 → 该成员的昵称（不显示群名）；其余 → 对方/本人昵称 */
function quotePrefixFor(d, contactId, row) {
  if (row.sender === 'me') return myDisplayName(d, contactId);
  if (row.author_member_id) {
    const mName = d.prepare('SELECT name FROM contacts WHERE id = ?').get(row.author_member_id)?.name;
    if (mName) return mName;
  }
  return d.prepare('SELECT name FROM contacts WHERE id = ?').get(contactId)?.name || '';
}

/* 对方收藏我的消息：小概率发生，广播 contact_favorite 让前端弹窗「×××收藏了你的消息」 */
function maybeContactFavorite(d, contactId) {
  try {
    if (Math.random() >= 0.15) return;
    const rows = d
      .prepare(
        `SELECT text FROM chat_messages
         WHERE contact_id = ? AND sender = 'me' AND content_type IN ('text','card')
           AND text IS NOT NULL AND TRIM(text) != ''
         ORDER BY id DESC LIMIT 10`
      )
      .all(contactId);
    if (!rows.length) return;
    const target = rows[Math.floor(Math.random() * rows.length)];
    const info = effectiveContactInfo(d, contactId);
    notification.broadcast('contact_favorite', {
      contactId,
      name: info.name,
      avatar: info.avatar,
      text: String(target.text || '').slice(0, 40),
    });
  } catch (e) {
    /* ignore */
  }
}

/* 把对方（联系人）的一条普通文本消息落库并广播（已读我的消息 + 角标更新） */
function insertContactText(d, contactId, text, seq, memberId = null) {
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at, author_member_id)
       VALUES(?, 'contact', 'text', ?, 'delivered', 0, ?, ?, ?)`
    )
    .run(contactId, text, seq || getNextSeq(contactId), Math.floor(Date.now() / 1000), memberId);
  return d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
}

// 落库一条「对方发出的图片字卡（表情包）」消息（继续说/快捷回复抽到图片字卡时用）
/* 抽卡落库的消息类型：表情包板块 → sticker（前端小尺寸），图片板块 → image（相册图片尺寸），
   其余（主字卡/emoji/颜文字/语音等）保持 card。带文字的卡仍走 card 分支（图+文字一起显示） */
function cardContentType(card) {
  if (!card) return 'card';
  /* 语音卡：内容是「转写文案」，消息类型仍为 voice（前端渲染语音条 + 转文字） */
  if (card.category === 'voice' && card.asset_path) return 'voice';
  /* 按字卡板块恒定类型：图片字卡恒为 image、表情包字卡恒为 sticker 无框气泡，
     与是否带文字无关（带文字的图片/表情包字卡不再回落成带框 card，保持类型恒定）。
     仅当确实带图资源时才降级，避免误标分类却无资源的空白气泡。 */
  if (card.category === 'sticker' && card.asset_path) return 'sticker';
  if (card.category === 'image' && card.asset_path) return 'image';
  return 'card';
}

function insertContactCard(d, contactId, card, memberId = null, proactive = false) {
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, card_id, text, asset_path, duration, author_member_id, is_proactive, read_receipt, read, seq, created_at)
       VALUES(?, 'contact', ?, ?, ?, ?, ?, ?, ?, 'delivered', 0, ?, ?)`
    )
    .run(
      contactId,
      cardContentType(card),
      card.id || null,
      card.content || '',
      card.asset_path || '',
      card.duration || null,
      memberId,
      proactive ? 1 : 0,
      getNextSeq(contactId),
      Math.floor(Date.now() / 1000)
    );
  return d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
}

/* 以对方身份发一条纯文本消息（用于经期特殊关怀等系统关怀，非字卡）：
   复用 chat_messages 落库 + 返回落库后的消息对象。 */
export function sendContactText(contactId, text, opts = {}) {
  const proactive = opts.proactive ? 1 : 0
  const info = db
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, card_id, text, asset_path, duration, author_member_id, is_proactive, read_receipt, read, seq, created_at)
       VALUES(?, 'contact', 'text', NULL, ?, '', NULL, NULL, ?, 'delivered', 0, ?, ?)`
    )
    .run(Number(contactId), String(text || ''), proactive, getNextSeq(Number(contactId)), Math.floor(Date.now() / 1000))
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid)
}

// 发送红包：金额 + 可选留言落库为 JSON，模拟对方开红包（约 85% 几率 2.5~8 秒后「已领取」），
// 未领取的一段时间后「退回」；状态变化通过 SSE message_update 推送到前端。
// 余额闭环：发红包时先扣我的余额（不足报错）→ 对方领取则对方余额 += 金额 → 对方退回则加回我的余额。
function sendRedPacket(dbRef, contactId, amount, note) {
  const d = dbRef || db;
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('红包金额无效');
  // 我发红包：先扣我的余额（余额不足会抛错，由路由层转成友好提示）
  walletRepo.debitMyBalance(contactId, amt);
  const seq = getNextSeq(contactId);
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'me', 'redpacket', ?, 'sent', 1, ?, ?)`
    )
    .run(contactId, JSON.stringify({ amount: amt, status: 'unclaimed', note: note ? String(note) : '' }), seq, Math.floor(Date.now() / 1000));
  const id = info.lastInsertRowid;
  const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);

  setTimeout(() => {
    try {
      const cur = d.prepare('SELECT text FROM chat_messages WHERE id = ?').get(id);
      if (!cur) return;
      const meta = JSON.parse(cur.text || '{}');
      if (meta.status !== 'unclaimed') return;
      if (Math.random() < 0.85) {
        // 对方领取：对方余额增加（金额从我已在发送时扣出的部分转入对方）
        meta.status = 'claimed';
        d.prepare("UPDATE chat_messages SET text = ?, read_receipt = 'read' WHERE id = ?").run(JSON.stringify(meta), id);
        walletRepo.addToContactBalance(contactId, amt);
        broadcastMessageUpdate(contactId, id);
      } else {
        // 未领取：稍后自动退回（退回视为对方已读，并把金额加回我的余额）
        setTimeout(() => {
          try {
            const c2 = d.prepare('SELECT text FROM chat_messages WHERE id = ?').get(id);
            if (!c2) return;
            const m2 = JSON.parse(c2.text || '{}');
            if (m2.status !== 'unclaimed') return;
            m2.status = 'returned';
            d.prepare("UPDATE chat_messages SET text = ?, read_receipt = 'read' WHERE id = ?").run(JSON.stringify(m2), id);
            walletRepo.addToMyBalance(contactId, amt);
            broadcastMessageUpdate(contactId, id);
          } catch (e) {
            console.error('[redpacket] return failed:', e.message);
          }
        }, randInt(12000, 20000));
      }
    } catch (e) {
      console.error('[redpacket] claim failed:', e.message);
    }
  }, randInt(2500, 8000));

  return msg;
}

/* 对方主动给我发红包：message.sender = 'contact'，状态 unclaimed，等待我领取。
   与「我发红包」(sendRedPacket) 区分 —— 对方发的不会自动被领取，需我点开。
   落库后立即广播 new_messages，聊天里出现一条对方（左）发来的红包。 */
function autoSendRedPacket(dbRef, contactId, amount, note) {
  const d = dbRef || db;
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return null;
  const seq = getNextSeq(contactId);
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'contact', 'redpacket', ?, 'delivered', 0, ?, ?)`
    )
    .run(contactId, JSON.stringify({ amount: amt, status: 'unclaimed', note: note ? String(note) : '' }), seq, Math.floor(Date.now() / 1000));
  const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
  const info2 = effectiveContactInfo(d, contactId);
  notification.broadcast('new_messages', {
    contactId,
    messages: [msg],
    avatar: info2.avatar,
    name: info2.name
  });
  notification.broadcast('badge_update', settingsRepo.getBadges());
  return msg;
}

/* 我领取对方发来的红包：仅当 sender='contact' 且 status='unclaimed'。
   领取后我的余额 += 金额，对方余额相应扣减；状态流转为 claimed（通过 message_update 推前端）。 */
function claimRedPacket(dbRef, messageId) {
  const d = dbRef || db;
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m || m.content_type !== 'redpacket' || m.sender !== 'contact') return null;
  const meta = JSON.parse(m.text || '{}');
  if (meta.status !== 'unclaimed') return { message: m, wallet: null };
  const amt = Math.round(Number(meta.amount) * 100) / 100;
  meta.status = 'claimed';
  d.prepare("UPDATE chat_messages SET text = ?, read_receipt = 'read' WHERE id = ?").run(
    JSON.stringify(meta),
    messageId
  );
  const wallet = walletRepo.creditMyBalance(m.contact_id, amt);
  const updated = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  broadcastMessageUpdate(m.contact_id, messageId);
  return { message: updated, wallet };
}

/* 我退回对方发来的红包：仅当 sender='contact' 且 status='unclaimed'。
   退回不改余额，状态流转为 returned（对方红包被退回）。 */
function returnRedPacket(dbRef, messageId) {
  const d = dbRef || db;
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m || m.content_type !== 'redpacket' || m.sender !== 'contact') return null;
  const meta = JSON.parse(m.text || '{}');
  if (meta.status !== 'unclaimed') return { message: m, wallet: null };
  meta.status = 'returned';
  d.prepare("UPDATE chat_messages SET text = ?, read_receipt = 'read' WHERE id = ?").run(
    JSON.stringify(meta),
    messageId
  );
  const updated = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  broadcastMessageUpdate(m.contact_id, messageId);
  return { message: updated, wallet: null };
}

function randomBlessing() {
  const list = ['恭喜发财，大吉大利', '给你发个红包', '小小意思，拿去花', '奖励你一下', '最近过得还好吗', '想你啦'];
  return list[Math.floor(Math.random() * list.length)];
}

/* ═══ 群红包（拼手气）═══
   一条群红包消息（content_type='redpacket'，text JSON 带 group:true）：
   { group:true, sender:'me'|成员id, amount, count, note, status, grabbed, claimed_amount, my_grab?, expired_refund? }
   领取流水落 red_packet_grabs（grabber: 'me' 或 'm:<成员id>'，每人限领一份，唯一索引保证）。
   余额闭环：
   - 我发   → 扣 wallets(群).my_balance；成员/我领取 → 各自余额 += 份额；到期未领完 → 剩余退回我的余额
   - 成员发 → 扣 wallets(成员).contact_balance（成员自己的钱）；领取 → 各自余额 += 份额；
              到期未领完 → 剩余退回该成员余额
   份额随机（经典拼手气）：每次领取在「剩余 − 留给后面每份的 1 分」之间随机取，最后一人拿全部剩余。 */
const GROUP_RP_EXPIRE_MS = 5 * 60 * 1000; // 群红包 5 分钟未领完，自动退回剩余
const GROUP_RP_PROB = 0.005;              // 每分钟每个群由成员发一个红包的概率（约 7 次/天）
const GROUP_RP_MAX_COUNT = 100;           // 单个红包最多份数
const GROUP_RP_MAX_AMOUNT = 10000000;     // 单个红包金额上限 1000 万

/* 群成员 id 列表（不含群本身） */
function groupMemberIds(d, groupId) {
  return d
    .prepare(
      `SELECT c.id FROM contacts c JOIN contact_members m ON m.member_id = c.id
       WHERE m.group_id = ? AND c.kind != 'group' ORDER BY c.id ASC`
    )
    .all(groupId)
    .map((r) => r.id);
}

/* 拼手气份额：在剩余里随机取一份，给后面每份至少留 1 分；最后一人拿全部剩余。
   份数只有 1 份时，领取即拿剩余全额（无需随机拆分）。 */
function randomGrabShare(amount, count, grabbedCount, claimedAmount) {
  const remainC = Math.round((amount - claimedAmount) * 100);
  const remainN = count - grabbedCount;
  if (remainN <= 0 || remainC <= 0) return 0;
  // 份数仅 1 份：领到的就是全额（已领到只剩最后一份时同样拿剩余全额）
  if (count <= 1 || remainN === 1) return remainC / 100;
  const maxC = remainC - (remainN - 1);
  const v = Math.floor(Math.random() * maxC) + 1;
  return v / 100;
}

/* 群红包元数据（非群红包返回 {}） */
function groupRpMeta(m) {
  try {
    const meta = JSON.parse(m.text || '{}');
    return meta && meta.group ? meta : {};
  } catch (e) {
    return {};
  }
}

/* 我发群红包：扣我的余额（不足抛错）→ 落库 → 安排成员随机来抢 + 到期兜底退回 */
function sendGroupRedPacket(dbRef, contactId, amount, count, note) {
  const d = dbRef || db;
  const amt = Math.round(Number(amount) * 100) / 100;
  const n = Math.floor(Number(count));
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('红包金额无效');
  if (!Number.isInteger(n) || n < 1 || n > GROUP_RP_MAX_COUNT) throw new Error('红包份数无效');
  if (amt < n * 0.01) throw new Error('每份至少 0.01 元，请提高金额或减少份数');
  walletRepo.debitMyBalance(contactId, amt);
  const meta = {
    group: true, sender: 'me', amount: amt, count: n,
    note: note ? String(note) : '', status: 'unclaimed',
    grabbed: 0, claimed_amount: 0
  };
  const seq = getNextSeq(contactId);
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at, author_member_id)
       VALUES(?, 'me', 'redpacket', ?, 'sent', 1, ?, ?, NULL)`
    )
    .run(contactId, JSON.stringify(meta), seq, Math.floor(Date.now() / 1000));
  const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
  scheduleGroupGrabs(d, msg.id, null);
  return msg;
}

/* 群成员发群红包：以成员自己的余额为准（contact_balance），不足则换人/放弃 */
function memberSendGroupRedPacket(dbRef, groupId) {
  const d = dbRef || db;
  const members = groupMemberIds(d, groupId);
  if (!members.length) return null;
  // 随机打乱成员顺序，挨个试直到有人余额够发
  for (let i = members.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    ;[members[i], members[j]] = [members[j], members[i]];
  }
  for (const mid of members) {
    try {
      const w = walletRepo.getWallet(mid);
      const cap = Math.min(GROUP_RP_MAX_AMOUNT, w.contact_balance);
      if (cap < 0.01) continue;
      // 份数 1 ~ min(6, 成员数+1)；金额不低于 份数×0.01
      const maxCount = Math.min(6, members.length + 1);
      const n = randInt(1, maxCount);
      const minAmt = Math.round(n * 0.01 * 100) / 100;
      if (cap < minAmt) continue;
      const amt = Math.round((Math.random() * (cap - minAmt) + minAmt) * 100) / 100;
      walletRepo.debitContactBalance(mid, amt);
      const meta = {
        group: true, sender: mid, amount: amt, count: n,
        note: randomBlessing(), status: 'unclaimed',
        grabbed: 0, claimed_amount: 0
      };
      const seq = getNextSeq(groupId);
      const info = d
        .prepare(
          `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at, author_member_id)
           VALUES(?, 'contact', 'redpacket', ?, 'delivered', 0, ?, ?, ?)`
        )
        .run(groupId, JSON.stringify(meta), seq, Math.floor(Date.now() / 1000), mid);
      const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
      scheduleGroupGrabs(d, msg.id, mid);
      const g = d.prepare('SELECT name, avatar FROM contacts WHERE id = ?').get(groupId);
      notification.broadcast('new_messages', {
        contactId: groupId,
        messages: [msg],
        avatar: g?.avatar || '',
        name: g?.name || ''
      });
      notification.broadcast('badge_update', settingsRepo.getBadges());
      return msg;
    } catch (e) {
      continue; // 这个成员余额不足，换下一个
    }
  }
  return null;
}

/* 安排群成员来抢（错峰随机延迟，均在有效期内）+ 到期兜底退回 */
function scheduleGroupGrabs(d, messageId, senderMemberId) {
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m) return;
  const meta = groupRpMeta(m);
  if (!meta.group || meta.status !== 'unclaimed') return;
  const remainCount = meta.count - (meta.grabbed || 0);
  if (remainCount <= 0) return;
  // 候选抢夺者：除发送者外的全部成员（我手动抢，不进定时器）
  let members = groupMemberIds(d, m.contact_id).filter((id) => id !== senderMemberId);
  for (let i = members.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    ;[members[i], members[j]] = [members[j], members[i]];
  }
  members.slice(0, remainCount).forEach((mid, i) => {
    const delay = randInt(2000, 12000) + i * randInt(1500, 5000);
    setTimeout(() => {
      try { memberGrabGroupRedPacket(d, messageId, mid); } catch (e) { /* ignore */ }
    }, delay);
  });
  // 到点未领完 → 退回剩余（页面关闭导致定时器丢失时，由 tick 里的兜底扫描补齐）
  setTimeout(() => {
    try { expireGroupRedPacket(d, messageId); } catch (e) { /* ignore */ }
  }, GROUP_RP_EXPIRE_MS);
}

/* 某个成员领取群红包：写流水 + 加成员自己的余额 + 更新消息元数据并广播 */
function memberGrabGroupRedPacket(d, messageId, memberId) {
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m) return null;
  const meta = groupRpMeta(m);
  if (!meta.group || meta.status !== 'unclaimed') return null;
  if ((meta.grabbed || 0) >= meta.count) return null;
  const key = 'm:' + memberId;
  const dup = d.prepare('SELECT 1 FROM red_packet_grabs WHERE message_id = ? AND grabber = ?').get(messageId, key);
  if (dup) return null;
  const share = randomGrabShare(meta.amount, meta.count, meta.grabbed || 0, meta.claimed_amount || 0);
  if (share <= 0) return null;
  d.prepare('INSERT INTO red_packet_grabs(message_id, grabber, amount, created_at) VALUES(?, ?, ?, ?)')
    .run(messageId, key, share, Math.floor(Date.now() / 1000));
  walletRepo.addToContactBalance(memberId, share); // 加进成员自己的余额
  meta.grabbed = (meta.grabbed || 0) + 1;
  meta.claimed_amount = Math.round(((meta.claimed_amount || 0) + share) * 100) / 100;
  if (meta.grabbed >= meta.count) meta.status = 'claimed';
  d.prepare('UPDATE chat_messages SET text = ? WHERE id = ?').run(JSON.stringify(meta), messageId);
  broadcastMessageUpdate(m.contact_id, messageId);
  return { share, message: d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) };
}

/* 我领取群红包：与成员领取同规则，份额进我的余额（wallets(群).my_balance） */
function grabGroupRedPacket(dbRef, messageId) {
  const d = dbRef || db;
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m) return null;
  const meta = groupRpMeta(m);
  if (!meta.group || meta.status !== 'unclaimed') return { message: m, wallet: null, grab: null };
  if ((meta.grabbed || 0) >= meta.count) return { message: m, wallet: null, grab: null };
  const dup = d.prepare("SELECT 1 FROM red_packet_grabs WHERE message_id = ? AND grabber = 'me'").get(messageId);
  if (dup) return { message: m, wallet: null, grab: null };
  const share = randomGrabShare(meta.amount, meta.count, meta.grabbed || 0, meta.claimed_amount || 0);
  if (share <= 0) return { message: m, wallet: null, grab: null };
  d.prepare("INSERT INTO red_packet_grabs(message_id, grabber, amount, created_at) VALUES(?, 'me', ?, ?)")
    .run(messageId, share, Math.floor(Date.now() / 1000));
  const wallet = walletRepo.creditMyBalance(m.contact_id, share); // 加进「我」在这个群的余额
  meta.grabbed = (meta.grabbed || 0) + 1;
  meta.claimed_amount = Math.round(((meta.claimed_amount || 0) + share) * 100) / 100;
  meta.my_grab = share;
  if (meta.grabbed >= meta.count) meta.status = 'claimed';
  d.prepare('UPDATE chat_messages SET text = ? WHERE id = ?').run(JSON.stringify(meta), messageId);
  const updated = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  broadcastMessageUpdate(m.contact_id, messageId);
  return { message: updated, wallet, grab: share };
}

/* 群红包到期：未领完的剩余退回发送者（我 → 我的余额；成员 → 成员自己的余额） */
function expireGroupRedPacket(dbRef, messageId) {
  const d = dbRef || db;
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m) return null;
  const meta = groupRpMeta(m);
  if (!meta.group || meta.status !== 'unclaimed') return null;
  const remain = Math.round((meta.amount - (meta.claimed_amount || 0)) * 100) / 100;
  if (remain > 0) {
    if (m.sender === 'me') walletRepo.addToMyBalance(m.contact_id, remain);
    else walletRepo.addToContactBalance(m.author_member_id, remain);
  }
  meta.status = 'expired';
  meta.expired_refund = remain;
  d.prepare('UPDATE chat_messages SET text = ? WHERE id = ?').run(JSON.stringify(meta), messageId);
  const updated = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  broadcastMessageUpdate(m.contact_id, messageId);
  return updated;
}

/* 群红包详情：元数据 + 领取流水（含名字）+ 我的领取情况/剩余/能否领取 */
function getGroupRedPacketDetail(dbRef, messageId) {
  const d = dbRef || db;
  const m = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);
  if (!m) return null;
  const meta = groupRpMeta(m);
  if (!meta.group) return null;
  const rows = d
    .prepare('SELECT grabber, amount, created_at FROM red_packet_grabs WHERE message_id = ? ORDER BY id ASC')
    .all(messageId);
  const grabs = rows.map((r) => {
    let name = '我';
    if (r.grabber !== 'me') {
      const mid = Number(String(r.grabber).slice(2));
      name = d.prepare('SELECT name FROM contacts WHERE id = ?').get(mid)?.name || '群成员';
    }
    return { grabber: r.grabber, name, amount: r.amount, created_at: r.created_at };
  });
  const myRow = rows.find((r) => r.grabber === 'me');
  return {
    message: m,
    meta,
    grabs,
    myGrab: myRow ? myRow.amount : null,
    remainingCount: Math.max(0, meta.count - (meta.grabbed || 0)),
    remainingAmount: Math.round((meta.amount - (meta.claimed_amount || 0)) * 100) / 100,
    canGrab: meta.status === 'unclaimed' && !myRow && (meta.grabbed || 0) < meta.count,
    expired: meta.status === 'expired'
  };
}

/* 对方（单人）主动发红包的金额范围：0.01 ~ 1000 万（不超过对方余额），范围不变 */
const PEER_RP_MAX_AMOUNT = 10000000;
/* 自动增资上限：余额达到 1 亿停止增资 */
const TOPUP_CAP = 100000000;

/* 主动发红包：一天最多 8 个（自然日 0 点重置） */
const PEER_RP_DAILY_MAX = 8;
/* 主动发红包的不定时间隔：1.5 ~ 4.5 小时（均值 3 小时 → 约 8 次/天，
   与上限一致；随机区间避免整齐划一，也不至于过密或过疏） */
const RP_GAP_MIN = 1.5 * 3600 * 1000;
const RP_GAP_MAX = 4.5 * 3600 * 1000;
/* 增资的不定时间隔：1.5 ~ 4.5 小时（均值 3 小时，与原「每 3 小时」总量相当） */
const TOPUP_GAP_MIN = 1.5 * 3600 * 1000;
const TOPUP_GAP_MAX = 4.5 * 3600 * 1000;

/* 金额分档：让「元 / 千 / 万 / 十万 / 百万 / 千万」各档出现次数尽量平均。
   范围仍是 0.01 ~ 1000 万：最低档从 0.01 起，最高档封顶 1000 万。 */
const RP_TIERS = [
  { min: 0.01, max: 999.99 }, // 元级
  { min: 1000, max: 9999.99 }, // 千级
  { min: 10000, max: 99999.99 }, // 万级
  { min: 100000, max: 999999.99 }, // 十万级
  { min: 1000000, max: 9999999.99 }, // 百万级
  { min: 10000000, max: 10000000 }, // 千万级（封顶）
];

/* 轮转袋：每位联系人一份打乱的档位序号，取完再重新洗牌 —— 保证长期各档次数平均 */
const rpTierBags = new Map();
function pickTierAmount(cap, contactId) {
  let bag = rpTierBags.get(contactId);
  if (!bag || !bag.length) {
    bag = RP_TIERS.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    rpTierBags.set(contactId, bag);
  }
  /* 从袋首取第一个余额吃得下的档；吃不下就顺延（该档留着下次再用） */
  for (let k = 0; k < bag.length; k++) {
    const tier = RP_TIERS[bag[k]];
    if (tier.min <= cap) {
      bag.splice(k, 1);
      const max = Math.min(tier.max, cap);
      return Math.round((Math.random() * (max - tier.min) + tier.min) * 100) / 100;
    }
  }
  return null; // 余额连最低档都吃不下
}

/* 不定时调度状态（内存态；页面重启后重新错峰，不会开页即发） */
const rpNextAt = new Map(); // contactId -> 下次可发红包时间戳
const topupNextAt = new Map(); // contactId -> 下次增资时间戳
const rpDailyCount = new Map(); // contactId -> { day: 'YYYY-M-D', n: 已发数量 }
const randomGap = (min, max) => min + Math.random() * (max - min);
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/* 红包调度（每分钟触发）：
   1) 钱包自动增资——不定时（每人独立随机间隔 1.5~4.5 小时），每笔 1~5 万元，余额超 1 亿停。
   2) 红包发送——单人：不定时（每人独立随机间隔），一天最多 8 个，金额按档轮转
      （0.01~1000 万，不超其余额）；群聊：每个群按 GROUP_RP_PROB 由某位成员发一个群红包。
   3) 兜底——超过 5 分钟仍未领完的群红包，退回剩余给发送者。 */
function redpacketTick() {
  try {
    const now = Date.now();
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    // 群成员 id（成员自己的余额也在各自 wallets 行里，随群聊一起增资）
    const memberIds = db
      .prepare(
        `SELECT DISTINCT m.member_id AS id FROM contact_members m
         JOIN contacts c ON c.id = m.member_id WHERE c.kind != 'group'`
      )
      .all()
      .map((r) => r.id);
    // 钱包随机自动增资：不定时（每人独立随机间隔 1.5~4.5 小时，均值 3 小时）
    // 每笔仍是 1~5 万元；余额超过 1 亿时停止增资
    for (const cid of [...rows.map((r) => r.id), ...memberIds]) {
      const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(cid);
      if (st && st.blocked) continue;
      // 首次运行时错峰安排下次时间，避免所有人同一时刻齐刷刷增资
      if (!topupNextAt.has(cid)) topupNextAt.set(cid, now + Math.random() * TOPUP_GAP_MAX);
      if (now < topupNextAt.get(cid)) continue;
      const w = walletRepo.getWallet(cid);
      if (w.contact_balance < TOPUP_CAP) {
        const inc = Math.round((Math.random() * 49999 + 1) * 100) / 100;
        walletRepo.addToContactBalance(cid, inc);
      }
      topupNextAt.set(cid, now + randomGap(TOPUP_GAP_MIN, TOPUP_GAP_MAX));
    }
    // 红包：不定时发（每人独立随机间隔），一天最多 8 个，金额按档轮转（0.01~1000 万，不超余额）
    const today = dayKey(now);
    for (const c of rows) {
      const cid = c.id;
      const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(cid);
      if (st && st.blocked) continue;
      // 当天已发数量（跨日自动重置）
      let cnt = rpDailyCount.get(cid);
      if (!cnt || cnt.day !== today) {
        // 以库为准统计今日已发，避免页面重启后计数归零而超发
        const sent = db
          .prepare(
            `SELECT COUNT(*) AS n FROM chat_messages
             WHERE contact_id = ? AND sender = 'contact' AND content_type = 'redpacket' AND created_at >= ?`
          )
          .get(cid, Math.floor(new Date(new Date(now).setHours(0, 0, 0, 0)).getTime() / 1000));
        cnt = { day: today, n: sent ? sent.n : 0 };
        rpDailyCount.set(cid, cnt);
      }
      if (cnt.n >= PEER_RP_DAILY_MAX) continue; // 今日额度用尽
      if (!rpNextAt.has(cid)) rpNextAt.set(cid, now + Math.random() * RP_GAP_MAX);
      if (now < rpNextAt.get(cid)) continue;
      const w = walletRepo.getWallet(cid);
      const cap = Math.min(PEER_RP_MAX_AMOUNT, w.contact_balance);
      const amt = cap >= 0.01 ? pickTierAmount(cap, cid) : null;
      if (amt != null) {
        autoSendRedPacket(db, cid, amt, randomBlessing());
        cnt.n += 1;
      }
      rpNextAt.set(cid, now + randomGap(RP_GAP_MIN, RP_GAP_MAX));
    }
    // 群聊：每分钟每个群按单一概率由某位成员发一个群红包
    const groups = db.prepare("SELECT id FROM contacts WHERE kind = 'group'").all();
    for (const g of groups) {
      if (Math.random() < GROUP_RP_PROB) memberSendGroupRedPacket(db, g.id);
    }
    // 兜底：超过 5 分钟仍未领完的群红包 → 退回剩余（覆盖页面关闭期间定时器丢失的情况）
    const stale = db
      .prepare(
        `SELECT id, created_at FROM chat_messages
         WHERE content_type = 'redpacket' AND created_at >= ?
         ORDER BY id DESC LIMIT 60`
      )
      .all(Math.floor(Date.now() / 1000) - 3600);
    for (const row of stale) {
      try {
        const mm = db.prepare('SELECT text FROM chat_messages WHERE id = ?').get(row.id);
        const meta = JSON.parse(mm?.text || '{}');
        if (!meta.group || meta.status !== 'unclaimed') continue;
        if (Math.floor(Date.now() / 1000) - row.created_at >= GROUP_RP_EXPIRE_MS / 1000) {
          expireGroupRedPacket(db, row.id);
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.error('[redpacketTick]', e.message);
  }
}
// sender：由谁发起通话决定气泡落在哪边 —— 我方拨打('me')在右侧，对方打来('contact')在左侧
// initiatorMemberId：群聊通话由某个成员发起时，气泡显示在该成员名下（author_member_id）
function sendCallRecord(dbRef, contactId, payload) {
  const d = dbRef || db;
  const p = payload || {};
  const byThem = p.sender === 'contact';
  const sender = byThem ? 'contact' : 'me';
  const readReceipt = byThem ? 'delivered' : 'sent';
  const seq = getNextSeq(contactId);
  const initiatorMemberId = p.initiatorMemberId != null ? Number(p.initiatorMemberId) : null;
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at, author_member_id)
       VALUES(?, ?, 'call', ?, ?, 1, ?, ?, ?)`
    )
    .run(
      contactId,
      sender,
      JSON.stringify({ duration: Math.max(0, Math.floor(Number(p.duration) || 0)), result: p.result || 'answered' }),
      readReceipt,
      seq,
      Math.floor(Date.now() / 1000),
      initiatorMemberId
    );
  return d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
}

// 发送提问（单选 / 多选 / 问答）。
//   · 选择题（single/multi）：对方"回复所选的选项"——随机抽取其中一个选项作为文字消息回应（不抽字卡）。
//   · 问答题（qa）：对方随机抽字卡回应（沿用既有字卡回复逻辑）。
//   提问记录同时存入「统计」（favorites）。
function sendQuestion(dbRef, contactId, { type, question, options }) {
  const d = dbRef || db;
  const t = ['single', 'multi', 'qa'].includes(type) ? type : 'qa';
  const q = String(question || '').trim();
  if (!q) throw new Error('问题内容不能为空');
  const opts = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];
  if (t !== 'qa' && opts.length < 2) throw new Error('请至少填写两个选项');
  const seq = getNextSeq(contactId);
  const info = d
    .prepare(
      `INSERT INTO chat_messages(contact_id, sender, content_type, text, read_receipt, read, seq, created_at)
       VALUES(?, 'me', 'question', ?, 'sent', 1, ?, ?)`
    )
    .run(contactId, JSON.stringify({ type: t, question: q, options: opts }), seq, Math.floor(Date.now() / 1000));
  const msg = d.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
  // 提问记录存入统计功能（群聊不收藏，仅单人联系人可收藏）
  if (!isGroup(d, contactId)) {
    try {
      chatRepo.addFavorite(msg.id);
    } catch (e) {
      console.error('[question] favorite failed:', e.message);
    }
  }
  if (isGroup(d, contactId)) {
    // 群聊提问：每个成员都要回答（各自随机选项/抽卡，按顺序错开时间）
    groupAnswerQuestion(d, contactId, t, opts);
  } else if (t === 'qa') {
    // 问答：对方随机抽字卡回应（只回答问题本身，不额外回复）
    replyQaQuestion(d, contactId);
  } else {
    // 选择题：对方"回复所选选项"——先输入，再随机抽选项合并成一条文字回应（多选随机 1~全部个）
    replyChoiceQuestion(d, contactId, opts, t);
  }
  return msg;
}

/* 选择题作答抽取：单选随机挑 1 个；多选随机挑 1~全部个（最少一个、最多全选），
   挑中的选项按原顺序合并为一条消息文本 —— 一次性发完，不逐条刷屏 */
function pickOptions(opts, type) {
  const pool = (opts || []).filter(Boolean).slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const k = type === 'multi' ? randInt(1, pool.length) : 1;
  return pool.slice(0, k).join('\n');
}

/* 群聊提问：每位成员依次作答——
   · 选择题（single/multi）：每人各自随机选一个选项作为文字回复（带成员署名）
   · 问答题（qa）：每人抽一张字卡回应（有图片的字卡以图片消息发出）
   回复按成员顺序错开时间，每位成员回答前先短暂"正在输入" */
function groupAnswerQuestion(dbRef, contactId, type, options) {
  const d = dbRef || db;
  const st = d.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(contactId);
  // 拉黑时普通聊天不回复，但提问（选择题/问答）对方仍会回答并发送回答
  if (!st) return;
  const members = groupMembersWithRules(d, contactId);
  if (!members.length) return;
  const opts = (options || []).filter(Boolean);
  const [aLo, aHi] = answerDelayOf(st);
  const base = randInt(aLo, aHi);
  members.forEach((sp, idx) => {
    // 依次错开：基础延迟 + 每人多等 2.5~5 秒，避免所有人同时刷屏
    const delay = 600 + base * 1000 + idx * randInt(2500, 5000);
    setTimeout(
      guard(() => {
        notification.broadcast('typing', { contactId, typing: true });
        setTimeout(
          guard(() => {
            let m;
            if (type === 'qa') {
              // 问答题：该成员抽一张字卡（图片字卡 → 图片消息）
              const card = drawCardsForMember(d, contactId, sp.id, 1)[0] || null;
              m = card && card.asset_path
                ? insertContactCard(d, contactId, card, sp.id)
                : insertContactText(d, contactId, card?.content || '…', null, sp.id);
            } else {
              // 选择题：单选各选一个；多选随机选 1~全部并合并为一条消息
              const choice = opts.length ? pickOptions(opts, type) : '…';
              m = insertContactText(d, contactId, choice, null, sp.id);
            }
            notification.broadcast('typing', { contactId, typing: false });
            const info = effectiveContactInfo(d, contactId);
            notification.broadcast('new_messages', { contactId, messages: [m], avatar: info.avatar, name: info.name });
            notification.broadcast('badge_update', settingsRepo.getBadges());
            // 开了「对方撤回消息」时，这句也有小概率被撤回
            maybeContactRecall(d, contactId, [m]);
          }),
          randInt(800, 1600)
        );
      }, contactId),
      delay
    );
  });
}

/* 问答回复：对方先"正在输入"，随后随机抽一张字卡回应（只回答问题本身，不额外回复） */
function replyQaQuestion(dbRef, contactId) {
  const d = dbRef || db;
  const st = d.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(contactId);
  // 拉黑时普通聊天不回复，但提问（选择题/问答）对方仍会回答并发送回答
  if (!st) return;
  const [aLo, aHi] = answerDelayOf(st);
  const delaySec = randInt(aLo, aHi);
  setTimeout(
    guard(() => {
      // 先广播"对方正在输入"
      notification.broadcast('typing', { contactId, typing: true });
      setTimeout(
        guard(() => {
          // 已读我的消息
          d.prepare(
            "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
          ).run(contactId);
          // 抽一张字卡作为回答（图片字卡 → 图片消息）
          const card = drawCards(d, contactId, 1)[0] || null;
          const m = card && card.asset_path
            ? insertContactCard(d, contactId, card)
            : insertContactText(d, contactId, card?.content || '…');
          // 回答已发出：立即关闭"正在输入"，否则输入状态一直挂着，
          // 用户会以为对方还在打字/还要继续发消息
          notification.broadcast('typing', { contactId, typing: false });
          const info = effectiveContactInfo(d, contactId);
          notification.broadcast('new_messages', { contactId, messages: [m], avatar: info.avatar, name: info.name });
          notification.broadcast('badge_update', settingsRepo.getBadges());
          // 对方小概率撤回刚发出的这条回答
          maybeContactRecall(d, contactId, [m]);
        }),
        Math.max(800, delaySec * 1000)
      );
    }),
    600
  );
}

/* 选择题回复：对方先"正在输入"，随后随机抽取选项合并为一条文字消息回应
   （单选回 1 个；多选随机回 1~全部个，最少一个最多全选，一条发完不逐条刷屏） */
function replyChoiceQuestion(dbRef, contactId, options, type) {
  const d = dbRef || db;
  const st = d.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(contactId);
  // 拉黑时普通聊天不回复，但提问（选择题/问答）对方仍会回答并发送回答
  if (!st) return;
  const opts = (options || []).filter(Boolean);
  if (!opts.length) return;
  const [aLo, aHi] = answerDelayOf(st);
  const delaySec = randInt(aLo, aHi);
  setTimeout(
    guard(() => {
      // 先广播"对方正在输入"
      notification.broadcast('typing', { contactId, typing: true });
      setTimeout(
        guard(() => {
          // 已读我的消息
          d.prepare(
            "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
          ).run(contactId);
          const choice = pickOptions(opts, type);
          const m = insertContactText(d, contactId, choice);
          // 回答已发出：立即关闭"正在输入"（此前只开不关，回答后"…"一直挂着）
          notification.broadcast('typing', { contactId, typing: false });
          const info = effectiveContactInfo(d, contactId);
          notification.broadcast('new_messages', { contactId, messages: [m], avatar: info.avatar, name: info.name });
          notification.broadcast('badge_update', settingsRepo.getBadges());
          // 对方小概率撤回刚发出的这条回复
          maybeContactRecall(d, contactId, [m]);
        }),
        Math.max(800, delaySec * 1000)
      );
    }),
    600
  );
}

/* 主动消息调度（后台定时触发，无需用户交互）：遍历所有未拉黑单人联系人，
   开启主动消息且已到"下次可发时间"的，抽若干张字卡以对方身份主动发来。
   下次时间落在联系人自己设置的【间隔范围】内随机取值，并持久化到 contact_settings，
   这样服务重启不会清空计时（否则每次重启都会立刻补发一条，看起来就很频繁）。 */
const lastProactiveAt = new Map();
function nextIntervalSec(st) {
  let lo = Number(st && st.proactive_interval_min);
  let hi = Number(st && st.proactive_interval_max);
  if (!Number.isFinite(lo) || lo <= 0) lo = 60;
  if (!Number.isFinite(hi) || hi <= 0) hi = lo;
  if (hi < lo) [lo, hi] = [hi, lo];
  return randInt(Math.round(lo), Math.round(hi)) * 60;
}
function proactiveTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Math.floor(Date.now() / 1000);
    for (const c of rows) {
      const cid = c.id;
      const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(cid);
      if (st && st.blocked) continue;
      // 未建设置行的联系人按默认配置走（默认开启主动消息），不被跳过
      const enabled = st ? Number(st.proactive_enabled) : 1;
      if (!enabled) continue;

      let next = st ? Number(st.proactive_next_at) || 0 : 0;
      if (!next) {
        // 从未调度过（例如服务刚升级）：用「最后一条主动消息时间 + 一个间隔」补算出下次时间，
        // 保证重启不补发；若历史上从未发过主动消息，才允许立刻发一条作为起点。
        const lastRow = db
          .prepare('SELECT MAX(created_at) AS t FROM chat_messages WHERE contact_id = ? AND is_proactive = 1')
          .get(cid);
        const lastSent = Number(lastRow && lastRow.t) || 0;
        if (lastSent) {
          next = lastSent + nextIntervalSec(st);
          if (st) {
            db.prepare('UPDATE contact_settings SET proactive_last_at = ?, proactive_next_at = ? WHERE contact_id = ?').run(
              lastSent,
              next,
              cid
            );
          }
        } else {
          next = 0; // 首次：立刻发一条
        }
      }
      if (next && now < next) continue;

      const lo = Number(st && st.proactive_count_min);
      const hi = Number(st && st.proactive_count_max);
      let count = 1;
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0) count = randInt(Math.round(lo), Math.round(hi));
      else if (st && Number(st.proactive_count)) count = Math.max(1, Number(st.proactive_count));
      const cards = drawCards(db, cid, count);
      if (!cards || !cards.length) continue; // 该联系人字卡库为空则跳过本次
      const nextAt = now + nextIntervalSec(st);
      if (st) {
        db.prepare('UPDATE contact_settings SET proactive_last_at = ?, proactive_next_at = ? WHERE contact_id = ?').run(
          now,
          nextAt,
          cid
        );
      } else {
        lastProactiveAt.set(cid, now);
      }
      const info = effectiveContactInfo(db, cid);
      const sent = [];
      for (const card of cards) {
        const m = insertContactCard(db, cid, card, null, true);
        if (m) sent.push(m);
      }
      if (sent.length) {
        console.log(
          `[proactive] contact=${cid} 发出 ${sent.length} 条，下次约 ${Math.round((nextAt - now) / 60)} 分钟后`
        );
        notification.broadcast('typing', { contactId: cid, typing: true });
        notification.broadcast('new_messages', { contactId: cid, messages: sent, avatar: info.avatar, name: info.name });
        notification.broadcast('badge_update', settingsRepo.getBadges());
        const cid2 = cid;
        setTimeout(() => notification.broadcast('typing', { contactId: cid2, typing: false }), 3000);
      }
    }
  } catch (e) {
    console.error('[proactiveTick]', e.message);
  }
}

export {
  sendUserMessage,
  scheduleReply,
  continueTalk,
  groupMembersWithRules,
  sendImageMessage,
  sendRedPacket,
  autoSendRedPacket,
  claimRedPacket,
  returnRedPacket,
  sendGroupRedPacket,
  memberSendGroupRedPacket,
  grabGroupRedPacket,
  expireGroupRedPacket,
  getGroupRedPacketDetail,
  redpacketTick,
  proactiveTick,
  sendCallRecord,
  sendQuestion,
};
