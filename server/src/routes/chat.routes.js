const express = require('express');
const router = express.Router();
const chatRepo = require('../repositories/chat.repo');
const chatService = require('../services/chat.service');
const db = require('../db');
const settingsRepo = require('../repositories/settings.repo');
const notification = require('../services/notification.service');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

// 聊天列表：所有联系人/群聊 + 最后一条消息摘要（微信式列表）
router.get('/chats', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT c.id, c.kind, c.name, c.avatar, c.muted_chat AS mutedChat,
        CASE WHEN cd.sync_chat_avatar = 1 AND cd.partner_avatar IS NOT NULL AND cd.partner_avatar != ''
             THEN cd.partner_avatar ELSE c.avatar END AS chat_avatar,
        (SELECT COUNT(*) FROM chat_messages m
          WHERE m.contact_id = c.id AND m.sender = 'contact' AND m.read = 0) AS unread,
        (SELECT m.content_type FROM chat_messages m WHERE m.contact_id = c.id
          ORDER BY m.id DESC LIMIT 1) AS lastType,
        (SELECT m.text FROM chat_messages m WHERE m.contact_id = c.id
          ORDER BY m.id DESC LIMIT 1) AS lastText,
        (SELECT m.recalled FROM chat_messages m WHERE m.contact_id = c.id
          ORDER BY m.id DESC LIMIT 1) AS lastRecalled,
        (SELECT m.sender FROM chat_messages m WHERE m.contact_id = c.id
          ORDER BY m.id DESC LIMIT 1) AS lastSender,
        (SELECT m.author_member_id FROM chat_messages m WHERE m.contact_id = c.id
          ORDER BY m.id DESC LIMIT 1) AS lastAuthorMember,
        (SELECT m.created_at FROM chat_messages m WHERE m.contact_id = c.id
          ORDER BY m.id DESC LIMIT 1) AS lastAt
         FROM contacts c
         LEFT JOIN contact_desktop cd ON cd.contact_id = c.id
         ORDER BY COALESCE(lastAt, 0) DESC, c.id ASC`
      )
      .all();
    // 群聊里最后一条是谁发的，补上成员昵称
    for (const r of rows) {
      if (r.kind === 'group' && r.lastAuthorMember) {
        const m = db.prepare('SELECT name FROM contacts WHERE id = ?').get(r.lastAuthorMember);
        r.lastAuthorName = m ? m.name : '';
      }
      // 特殊消息类型的列表摘要（text 存 JSON，不能直接展示）
      // 撤回的消息不展示占位文案，统一由前端显示「X 撤回了一条消息」
      if (!r.lastRecalled) {
        if (r.lastType === 'image') r.lastText = '[图片]';
        else if (r.lastType === 'sticker') r.lastText = '[表情包]';
        else if (r.lastType === 'companion_invite') r.lastText = '[陪伴邀请]';
        else if (r.lastType === 'listen_invite') r.lastText = '[一起听歌]';
        else if (r.lastType === 'voice') r.lastText = '[语音]';
        else if (r.lastType === 'redpacket') r.lastText = '[红包]';
        else if (r.lastType === 'call') {
          try {
            const c = JSON.parse(r.lastText || '{}');
            const result = c.result;
            r.lastText =
              result === 'rejected' ? '对方拒绝通话'
              :             result === 'declined' ? '已拒绝通话'
              : result === 'missed' ? '未接听通话'
              : result === 'hangup_by_them' ? '通话时长'
              : '[通话]';
          } catch (e) { r.lastText = '[通话]'; }
        }
        else if (r.lastType === 'question') {
          try {
            const q = JSON.parse(r.lastText || '{}');
            r.lastText = '[提问] ' + (q.question || '');
          } catch (e) { /* ignore */ }
        }
      }
    }
    ok(res, rows);
  } catch (e) {
    fail(res, e.message);
  }
});

// 搜索聊天记录（全库文本匹配，供聊天列表顶部搜索框使用）
// 可选 contactId：只搜某个聊天（会话内「相关聊天记录」用，保证老消息也能被搜到）
router.get('/chats/search', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const contactId = req.query.contactId ? Number(req.query.contactId) : null;
    if (!q) return ok(res, []);
    const rows = db
      .prepare(
        `SELECT m.id, m.contact_id AS contactId, m.sender, m.author_member_id AS authorMemberId,
        m.content_type AS contentType, m.asset_path AS assetPath, m.seq AS seq,
        m.text, m.created_at AS createdAt,
        c.name AS contactName, c.kind, c.avatar
         FROM chat_messages m JOIN contacts c ON c.id = m.contact_id
         WHERE m.content_type IN ('text', 'card') AND m.text LIKE ?
           AND (? IS NULL OR m.contact_id = ?)
         ORDER BY m.id DESC LIMIT 200`
      )
      .all(`%${q}%`, contactId, contactId);
    // 群聊命中消息补发消息人昵称，单人/我发的补「我：」由前端处理
    for (const r of rows) {
      if (r.kind === 'group' && r.authorMemberId && r.sender !== 'me') {
        const m = db.prepare('SELECT name FROM contacts WHERE id = ?').get(r.authorMemberId);
        r.authorName = m ? m.name : '';
      }
    }
    ok(res, rows);
  } catch (e) {
    fail(res, e.message);
  }
});

// 消息列表（游标分页，cursor 为最旧一条 id）
router.get('/contacts/:id/messages', (req, res) => {
  try {
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const rows = chatRepo.getMessages(Number(req.params.id), cursor);
    /* 关键：nextCursor 必须是「本页最旧一条」的 id（rows 已按 id 升序，rows[0] 即最旧），
       下次才能 WHERE id < 它，一次性捞出整整一页更早的消息。
       之前误用 rows[rows.length-1]（本页最新一条），导致每次上滑只多出 1 条新消息、
       其余全是已加载的重复 —— 表现为「一条一条加载」。 */
    const nextCursor = rows.length ? rows[0].id : null;
    ok(res, { messages: rows, nextCursor });
  } catch (e) {
    fail(res, e.message);
  }
});

// 发送用户消息 -> 触发回复（支持引用 quoteId）
router.post('/contacts/:id/messages', (req, res) => {
  try {
    const { text, quoteId } = req.body || {};
    if (!text) return fail(res, 'text required');
    const msg = chatService.sendUserMessage(db, Number(req.params.id), text, quoteId ? Number(quoteId) : null);
    ok(res, msg);
  } catch (e) {
    fail(res, e.message);
  }
});

// 让对方继续说：不等我发消息，对方先"正在输入"再回一条（聊天底部「…」）
router.post('/contacts/:id/continue', (req, res) => {
  try {
    ok(res, chatService.continueTalk(db, Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// 标记单条消息已读
router.patch('/messages/:id/read', (req, res) => {
  try {
    ok(res, chatRepo.markRead(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// 撤回我的消息（仅自己发的消息可撤回）：清空正文并标记 recalled
router.patch('/messages/:id/recall', (req, res) => {
  try {
    ok(res, chatRepo.recallMessage(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// 删除单条消息（从聊天记录中移除）
router.delete('/messages/:id', (req, res) => {
  try {
    ok(res, chatRepo.deleteMessage(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// 收藏某条消息：落库到 favorites，在「统计」页归集展示
router.post('/messages/:id/favorite', (req, res) => {
  try {
    ok(res, chatRepo.addFavorite(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// 收藏列表（「统计」页用）
router.get('/favorites', (req, res) => {
  try {
    ok(res, chatRepo.getFavorites());
  } catch (e) {
    fail(res, e.message);
  }
});

// 发送图片消息（相册选图上传后调用；contentType='sticker' 表示表情面板点发的表情包）
router.post('/contacts/:id/image', (req, res) => {
  try {
    const { assetPath, contentType } = req.body || {};
    if (!assetPath) return fail(res, 'assetPath required');
    const msg = chatService.sendImageMessage(db, Number(req.params.id), assetPath, contentType);
    ok(res, msg);
  } catch (e) {
    fail(res, e.message);
  }
});

// 发送红包（金额，支持预设/自定义 + 可选留言）
router.post('/contacts/:id/redpacket', (req, res) => {
  try {
    const { amount, note } = req.body || {};
    const msg = chatService.sendRedPacket(db, Number(req.params.id), amount, note);
    ok(res, msg);
  } catch (e) {
    fail(res, e.message);
  }
});

// 领取对方发来的红包（sender='contact' 且 status='unclaimed'）：我的余额 += 金额
router.post('/messages/:id/claim', (req, res) => {
  try {
    const r = chatService.claimRedPacket(db, Number(req.params.id));
    if (!r) return fail(res, '该红包不可领取');
    ok(res, r);
  } catch (e) {
    fail(res, e.message);
  }
});

// 退回对方发来的红包（sender='contact' 且 status='unclaimed'）：不改余额，状态置 returned
router.post('/messages/:id/return', (req, res) => {
  try {
    const r = chatService.returnRedPacket(db, Number(req.params.id));
    if (!r) return fail(res, '该红包不可退回');
    ok(res, r);
  } catch (e) {
    fail(res, e.message);
  }
});

// 保存通话记录（挂断后调用；duration 秒 + result 结果 + sender 发起方→气泡归属侧）
router.post('/contacts/:id/call', (req, res) => {
  try {
    const body = req.body || {};
    const msg = chatService.sendCallRecord(db, Number(req.params.id), {
      duration: body.duration,
      result: body.result,
      // 'me'=我方拨打(气泡在右) / 'contact'=对方来电(气泡在左)
      sender: body.sender === 'contact' ? 'contact' : 'me',
      // 群聊通话由某成员发起时，气泡归属该成员
      initiatorMemberId: body.initiatorMemberId
    });
    ok(res, msg);
  } catch (e) {
    fail(res, e.message);
  }
});

// 发送提问（type: single 单选 / multi 多选 / qa 问答），对方抽字卡回应，记录进「统计」
router.post('/contacts/:id/question', (req, res) => {
  try {
    const { type, question, options } = req.body || {};
    const msg = chatService.sendQuestion(db, Number(req.params.id), { type, question, options });
    ok(res, msg);
  } catch (e) {
    fail(res, e.message);
  }
});

// 清空某联系人的全部聊天记录（联系人设置页「清空聊天记录」）
router.delete('/contacts/:id/messages', (req, res) => {
  try {
    const contactId = Number(req.params.id);
    db.prepare('DELETE FROM chat_messages WHERE contact_id = ?').run(contactId);
    // 清空后刷新全局角标广播
    const badges = settingsRepo.getBadges();
    notification.broadcast('badge_update', badges);
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
