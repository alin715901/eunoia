/* 本地 API 层：把 server/src/routes 的全部处理器移植为纯函数。
 * 路由里的 SQL / 服务调用原样保留，仅把 req.params/query/body 换成函数参数，
 * fail(res, msg) 换成 throw new Error(msg)（与原来 http 拦截器 reject 的行为一致）。
 * 上层 web/src/api/*.js 只做薄封装再导出，stores 零改动。
 */
import db, { resetDb } from './db'
import * as chatRepo from './repositories/chat.repo'
import * as chatService from './services/chat.service'
import * as contactsRepo from './repositories/contacts.repo'
import * as walletRepo from './repositories/wallet.repo'
import * as settingsRepo from './repositories/settings.repo'
import * as desktopRepo from './repositories/desktop.repo'
import * as cardsRepo from './repositories/cards.repo'
import * as cardDrawService from './services/cardDraw.service'
import * as momentService from './services/moment.service'
import * as companionService from './services/companion.service'
import * as listenService from './services/listen.service'
import * as musicService from './services/music.service'
import * as musicCache from './services/musicCache'
import * as mochiService from './services/mochi.service'
import * as backupService from './services/backup.service'
import * as notification from './services/notification.service'

export { resetDb }

const fail = (msg) => {
  throw new Error(msg)
}

/* ─────────── 聊天 ─────────── */

// 聊天列表：所有联系人/群聊 + 最后一条消息摘要（微信式列表）
export async function getChatList() {
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
    .all()
  for (const r of rows) {
    if (r.kind === 'group' && r.lastAuthorMember) {
      const m = db.prepare('SELECT name FROM contacts WHERE id = ?').get(r.lastAuthorMember)
      r.lastAuthorName = m ? m.name : ''
    }
    if (!r.lastRecalled) {
      if (r.lastType === 'image') r.lastText = '[图片]'
      else if (r.lastType === 'sticker') r.lastText = '[表情包]'
      else if (r.lastType === 'companion_invite') r.lastText = '[陪伴邀请]'
      else if (r.lastType === 'listen_invite') r.lastText = '[一起听歌]'
      else if (r.lastType === 'voice') r.lastText = '[语音]'
      else if (r.lastType === 'redpacket') r.lastText = '[红包]'
      else if (r.lastType === 'call') {
        try {
          const c = JSON.parse(r.lastText || '{}')
          const result = c.result
          r.lastText =
            result === 'rejected' ? '对方拒绝通话'
            : result === 'declined' ? '已拒绝通话'
            : result === 'missed' ? '未接听通话'
            : result === 'hangup_by_them' ? '通话时长'
            : '[通话]'
        } catch (e) { r.lastText = '[通话]' }
      }
      else if (r.lastType === 'question') {
        try {
          const q = JSON.parse(r.lastText || '{}')
          r.lastText = '[提问] ' + (q.question || '')
        } catch (e) { /* ignore */ }
      }
    }
  }
  return rows
}

// 搜索聊天记录（全库文本匹配）
export async function searchMessages(q, contactId = null) {
  const kw = String(q || '').trim()
  const cid = contactId ? Number(contactId) : null
  if (!kw) return []
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
    .all(`%${kw}%`, cid, cid)
  for (const r of rows) {
    if (r.kind === 'group' && r.authorMemberId && r.sender !== 'me') {
      const m = db.prepare('SELECT name FROM contacts WHERE id = ?').get(r.authorMemberId)
      r.authorName = m ? m.name : ''
    }
  }
  return rows
}

// 消息列表（游标分页，cursor 为最旧一条 id）
export async function getMessages(contactId, cursor = null) {
  const cur = cursor ? Number(cursor) : null
  const rows = chatRepo.getMessages(Number(contactId), cur)
  const nextCursor = rows.length ? rows[0].id : null
  return { messages: rows, nextCursor }
}

// 发送用户消息 -> 触发回复（支持引用 quoteId）
export async function sendMessage(contactId, text, quoteId = null) {
  if (!text) fail('text required')
  return chatService.sendUserMessage(db, Number(contactId), text, quoteId ? Number(quoteId) : null)
}

// 让对方继续说
export async function continueTalk(contactId) {
  return chatService.continueTalk(db, Number(contactId))
}

export async function markMessageRead(messageId) {
  return chatRepo.markRead(Number(messageId))
}

export async function recallMessage(messageId) {
  return chatRepo.recallMessage(Number(messageId))
}

export async function deleteMessage(messageId) {
  return chatRepo.deleteMessage(Number(messageId))
}

export async function favoriteMessage(messageId) {
  return chatRepo.addFavorite(Number(messageId))
}

export async function getFavorites() {
  return chatRepo.getFavorites()
}

// 发送图片消息（assetPath 为 dataURL）
export async function sendImage(contactId, assetPath, contentType = 'image') {
  if (!assetPath) fail('assetPath required')
  return chatService.sendImageMessage(db, Number(contactId), assetPath, contentType)
}

// 发送红包（单聊走原逻辑；群聊走群红包：amount + count 份，成员随机领取）
export async function sendRedPacket(contactId, amount, note = '', count = 1) {
  const cid = Number(contactId)
  const c = db.prepare('SELECT kind FROM contacts WHERE id = ?').get(cid)
  if (c && c.kind === 'group') {
    return chatService.sendGroupRedPacket(db, cid, amount, count, note)
  }
  return chatService.sendRedPacket(db, cid, amount, note)
}

// 领取对方发来的红包：返回 { message, wallet }
export async function claimRedPacket(messageId) {
  const r = chatService.claimRedPacket(db, Number(messageId))
  if (!r) fail('该红包不可领取')
  return r
}

// 退回对方发来的红包：返回 { message }
export async function returnRedPacket(messageId) {
  const r = chatService.returnRedPacket(db, Number(messageId))
  if (!r) fail('该红包不可退回')
  return r
}

// 抢群红包（每人限领一份，金额随机）：返回 { message, wallet, grab }
export async function claimGroupRedPacket(messageId) {
  const r = chatService.grabGroupRedPacket(db, Number(messageId))
  if (!r) fail('该红包不可领取')
  return r
}

// 群红包详情：元数据 + 领取流水 + 我的领取情况/剩余/能否领取
export async function getGroupRedPacketDetail(messageId) {
  const r = chatService.getGroupRedPacketDetail(db, Number(messageId))
  if (!r) fail('红包不存在')
  return r
}

// 保存通话记录
export async function sendCallRecord(contactId, payload = {}) {
  return chatService.sendCallRecord(db, Number(contactId), {
    duration: payload.duration,
    result: payload.result,
    sender: payload.sender === 'contact' ? 'contact' : 'me',
    initiatorMemberId: payload.initiatorMemberId,
  })
}

// 发送提问
export async function sendQuestion(contactId, payload = {}) {
  return chatService.sendQuestion(db, Number(contactId), {
    type: payload.type,
    question: payload.question,
    options: payload.options,
  })
}

// 清空某联系人的全部聊天记录
export async function clearMessages(contactId) {
  db.prepare('DELETE FROM chat_messages WHERE contact_id = ?').run(Number(contactId))
  notification.broadcast('badge_update', settingsRepo.getBadges())
  return null
}

/* ─────────── 联系人 ─────────── */

export async function getContacts() {
  return contactsRepo.listContacts()
}

export async function getRecentContacts(limit = 10) {
  return contactsRepo.getRecents(Number(limit) || 10)
}

export async function createContact(payload = {}) {
  if (!payload.name) fail('name required')
  return contactsRepo.createContact(payload)
}

export async function getContact(id) {
  const c = contactsRepo.getContact(Number(id))
  if (!c) fail('contact not found')
  return c
}

export async function updateContact(id, payload = {}) {
  const c = contactsRepo.updateContact(Number(id), payload)
  if (payload.name !== undefined) {
    notification.broadcast('contact_updated', { contactId: Number(id) })
  }
  return c
}

export async function deleteContact(id) {
  contactsRepo.deleteContact(Number(id))
  return null
}

export async function getContactSettings(id) {
  const s = contactsRepo.getSettings(Number(id))
  if (!s) fail('settings not found')
  return s
}

export async function updateContactSettings(id, payload = {}) {
  const body = { ...payload }
  // 通话概率联动：接听 + 拒听 合计 100%
  if (body.call_answer_prob != null && body.call_reject_prob == null) {
    body.call_reject_prob = 100 - Number(body.call_answer_prob || 0)
  } else if (body.call_reject_prob != null && body.call_answer_prob == null) {
    body.call_answer_prob = 100 - Number(body.call_reject_prob || 0)
  }
  const s = contactsRepo.updateSettings(Number(id), body)
  if (body.my_name !== undefined) {
    notification.broadcast('contact_updated', { contactId: Number(id) })
  }
  return s
}

export async function markContactRead(id) {
  contactsRepo.markReadAll(Number(id))
  notification.broadcast('badge_update', settingsRepo.getBadges())
  return null
}

// 红包钱包
export async function getWallet(contactId) {
  return walletRepo.getWallet(Number(contactId))
}

// 自定义「我的余额」（只改我的，对方余额不受影响）
export async function setMyBalance(contactId, value) {
  return walletRepo.setMyBalance(Number(contactId), value)
}

// 桌面配置
export async function getDesktop(id) {
  return desktopRepo.getDesktop(Number(id))
}

export async function updateDesktop(id, payload = {}) {
  const d = desktopRepo.updateDesktop(Number(id), payload)
  if (payload.my_name !== undefined || payload.partner_name !== undefined) {
    notification.broadcast('contact_updated', { contactId: Number(id) })
  }
  return d
}

/* ─────────── 群成员 ─────────── */

export async function getContactMembers(id) {
  return contactsRepo.listMembers(Number(id))
}

export async function addGroupMember(id, contactId) {
  return contactsRepo.addMember(Number(id), Number(contactId))
}

export async function addGroupMembers(id, contactIds) {
  const added = []
  for (const raw of contactIds || []) {
    const cid = Number(raw)
    if (cid) added.push(contactsRepo.addMember(Number(id), cid))
  }
  return added
}

export async function removeGroupMember(id, memberId) {
  contactsRepo.removeMember(Number(id), Number(memberId))
  return null
}

export async function getGroupMemberSettings(id) {
  return contactsRepo.getMemberSettings(Number(id))
}

export async function saveGroupMemberSettings(id, memberId, payload = {}) {
  return contactsRepo.upsertMemberSettings(Number(id), Number(memberId), payload)
}

export async function resetGroupMemberSettings(id, memberId) {
  contactsRepo.resetMemberSettings(Number(id), Number(memberId))
  return null
}

/* ─────────── 上传（本地版：File → dataURL，直接入库） ─────────── */

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('文件读取失败'))
    fr.readAsDataURL(file)
  })
}

// 通用文件上传，返回 { path }（path 即 dataURL）
export async function uploadFile(file) {
  if (!file) fail('no file')
  return { path: await readFileAsDataUrl(file) }
}

// 头像上传：读成 dataURL 后更新联系人，返回 { avatar }
export async function uploadAvatar(id, file) {
  if (!file) fail('no file')
  const dataUrl = await readFileAsDataUrl(file)
  contactsRepo.updateContact(Number(id), { avatar: dataUrl })
  return { avatar: dataUrl }
}

// 音乐本地文件上传，返回 { path }
export async function uploadMusicFile(formData) {
  const file = formData && typeof formData.get === 'function' ? formData.get('file') : null
  if (!file) fail('no file')
  return { path: await readFileAsDataUrl(file) }
}

/* ─────────── 字卡 ─────────── */

export async function getCardGroups({ scope, contactId, category } = {}) {
  return cardsRepo.listGroups({
    scope: scope || undefined,
    contactId: contactId ? Number(contactId) : undefined,
    category: category || undefined,
  })
}

export async function getCardGroupStats() {
  return cardsRepo.statsByScope()
}

export async function createCardGroup(payload = {}) {
  if (!payload.category || !payload.name) fail('category and name required')
  return cardsRepo.createGroup({
    category: payload.category,
    scope: payload.scope,
    ownerContactId: payload.ownerContactId ? Number(payload.ownerContactId) : null,
    name: payload.name,
    color: payload.color,
  })
}

export async function updateCardGroup(id, payload = {}) {
  let g
  if (payload.name !== undefined || payload.color !== undefined) {
    g = cardsRepo.updateGroup(Number(id), { name: payload.name, color: payload.color })
  }
  if (payload.blocked !== undefined) {
    g = cardsRepo.blockGroup(Number(id), payload.blocked ? 1 : 0)
  }
  if (!g) g = cardsRepo.updateGroup(Number(id), {})
  return g
}

export async function deleteCardGroup(id) {
  cardsRepo.deleteGroup(Number(id))
  return null
}

export async function getCards({ scope, contactId, category, groupId, includeBlocked } = {}) {
  return cardsRepo.listCards({
    scope: scope || undefined,
    contactId: contactId ? Number(contactId) : undefined,
    category: category || undefined,
    groupId: groupId ? Number(groupId) : undefined,
    includeBlocked: !!includeBlocked,
  })
}

export async function createCard(payload = {}) {
  return cardsRepo.createCard({
    groupId: payload.groupId != null ? Number(payload.groupId) : null,
    category: payload.category,
    content: payload.content,
    scope: payload.scope,
    ownerContactId: payload.ownerContactId != null ? Number(payload.ownerContactId) : null,
    asset_path: payload.asset_path,
    duration: payload.duration,
    weight: payload.weight,
  })
}

// 批量建卡（单事务）
export async function createCardsBatch(cards) {
  const items = Array.isArray(cards) ? cards : []
  if (!items.length) fail('cards required')
  if (items.length > 20000) fail('单次最多导入 20000 张')
  return cardsRepo.createCardsBatch(items)
}

// 导入 mochi 字卡全量备份
export async function importMochi(json, ownerContactId = null) {
  if (!json || typeof json !== 'object') fail('缺少 mochi 备份数据(json)')
  return mochiService.importMochi(json, { ownerContactId })
}

export async function updateCard(id, payload = {}) {
  return cardsRepo.updateCard(Number(id), payload)
}

export async function deleteCard(id) {
  cardsRepo.deleteCard(Number(id))
  return null
}

// 抽卡预览（不落库）
export async function drawPreview({ contactId, count } = {}) {
  if (!contactId) fail('contactId required')
  return cardDrawService.drawCards(db, Number(contactId), Number(count) || 1)
}

/* ─────────── 朋友圈 / 动态 ─────────── */

export async function getMoments(contactId = null, viewer = 0, scope = 'contact', authorId = null) {
  const cid = contactId ? Number(contactId) : null
  const v = viewer === undefined || viewer === '' ? 0 : Number(viewer)
  const sc = scope || (cid ? 'contact' : 'all')
  const aid = authorId === undefined || authorId === '' || authorId === null
    ? null
    : Number(authorId)
  let rows = []
  if (aid !== null) {
    rows =
      aid > 0
        ? db.prepare("SELECT * FROM moments WHERE author='contact' AND author_contact_id=? ORDER BY created_at DESC").all(aid)
        : db.prepare("SELECT * FROM moments WHERE author='me' ORDER BY created_at DESC").all()
  } else if (sc === 'all') {
    rows = db.prepare('SELECT * FROM moments ORDER BY created_at DESC').all()
  } else {
    rows = db.prepare('SELECT * FROM moments WHERE contact_id = ? ORDER BY created_at DESC').all(cid)
  }
  const likeQ = db.prepare(
    "SELECT 1 FROM moment_interactions WHERE moment_id=? AND contact_id=? AND type='like'"
  )
  const cmtQ = db.prepare(
    "SELECT * FROM moment_interactions WHERE moment_id=? AND type IN ('comment','reply') ORDER BY created_at ASC"
  )
  const likeRowsQ = db.prepare(
    "SELECT contact_id FROM moment_interactions WHERE moment_id=? AND type='like' ORDER BY created_at ASC"
  )
  const contactNameQ = db.prepare('SELECT name FROM contacts WHERE id=?')
  return rows.map((m) => {
    const mine = likeQ.get(m.id, v)
    const likeNames = likeRowsQ.all(m.id).map((r) =>
      r.contact_id ? contactNameQ.get(r.contact_id)?.name || 'TA' : '我'
    )
    return {
      ...m,
      images: m.images ? JSON.parse(m.images) : [],
      likes: likeNames.length,
      likeNames,
      liked: !!mine,
      comments: cmtQ.all(m.id).map((c) => {
        let imgs = []
        try { imgs = c.images ? JSON.parse(c.images) : [] } catch (e) { imgs = [] }
        if (!Array.isArray(imgs)) imgs = []
        const replyName =
          c.reply_to === 0
            ? '我'
            : c.reply_to
              ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(c.reply_to)?.name || '')
              : ''
        return {
          ...c,
          images: imgs,
          replyToName: replyName,
          authorName: c.contact_id
            ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(c.contact_id)?.name || 'TA')
            : '我'
        }
      })
    }
  })
}

export async function createMoment(payload = {}) {
  const { contactId, author, authorContactId, text, images } = payload
  if (!text && (!images || !images.length)) fail('内容和图片至少填一项')
  const info = db
    .prepare('INSERT INTO moments(contact_id, author, author_contact_id, text, images, created_at) VALUES(?,?,?,?,?,?)')
    .run(
      contactId ? Number(contactId) : null,
      author || 'me',
      authorContactId ? Number(authorContactId) : null,
      text || '',
      JSON.stringify(images || []),
      Date.now()
    )
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(info.lastInsertRowid)
  return { ...m, images: m.images ? JSON.parse(m.images) : [], likes: 0, liked: false, comments: [] }
}

// 点赞/取消：按 viewer 隔离
export async function likeMoment(id, viewer = 0) {
  const mid = Number(id)
  const v = viewer === undefined || viewer === null ? 0 : Number(viewer)
  const exists = db
    .prepare("SELECT id FROM moment_interactions WHERE moment_id=? AND contact_id=? AND type='like'")
    .get(mid, v)
  if (exists) {
    db.prepare("DELETE FROM moment_interactions WHERE moment_id=? AND contact_id=? AND type='like'").run(mid, v)
  } else {
    db.prepare("INSERT INTO moment_interactions(moment_id, contact_id, type, created_at) VALUES(?,?,'like',?)").run(mid, v, Date.now())
  }
  const likes = db.prepare("SELECT COUNT(*) c FROM moment_interactions WHERE moment_id=? AND type='like'").get(mid).c
  return { likes, liked: !exists }
}

// 评论/回复：contact_id=viewer 表示是谁说的
export async function commentMoment(id, payload = {}) {
  const mid = Number(id)
  const viewer = payload.viewer === undefined || payload.viewer === null ? 0 : Number(payload.viewer)
  const content = String(payload.content || '').trim()
  let images = Array.isArray(payload.images) ? payload.images.slice(0, 9) : []
  images = images.map((x) => String(x || '')).filter(Boolean)
  const replyTo =
    payload.replyTo === undefined || payload.replyTo === null || payload.replyTo === ''
      ? null
      : Number(payload.replyTo)
  if (!content && !images.length) fail('评论内容不能为空')
  const type = payload.type === 'reply' || replyTo !== null ? 'reply' : 'comment'
  const info = db
    .prepare('INSERT INTO moment_interactions(moment_id, contact_id, type, content, images, reply_to, from_card, created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(mid, viewer, type, content, JSON.stringify(images), replyTo, payload.fromCard ? 1 : 0, Date.now())
  const row = db.prepare('SELECT * FROM moment_interactions WHERE id=?').get(info.lastInsertRowid)
  const authorName = viewer
    ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(viewer)?.name || 'TA')
    : '我'
  const replyToName = replyTo === 0 ? '我' : replyTo ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(replyTo)?.name || '') : ''
  // 我评论了对方的动态 → 对方按「朋友圈设置」回评论
  const m = db.prepare('SELECT author, author_contact_id FROM moments WHERE id=?').get(mid)
  if (m && m.author === 'contact' && m.author_contact_id && !viewer) {
    momentService.scheduleMomentReplies(mid, m.author_contact_id)
  }
  return { ...row, images, replyToName, authorName }
}

// 删除动态（仅限我发的）
export async function deleteMoment(id) {
  const mid = Number(id)
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(mid)
  if (!m) fail('动态不存在')
  if (m.author !== 'me') fail('只能删除自己发布的动态')
  db.prepare('DELETE FROM moment_interactions WHERE moment_id=?').run(mid)
  db.prepare('DELETE FROM moments WHERE id=?').run(mid)
  return null
}

export async function deleteMomentComment(cid) {
  const row = db.prepare('SELECT * FROM moment_interactions WHERE id=?').get(Number(cid))
  if (!row) fail('评论不存在')
  if (Number(row.contact_id) !== 0) fail('只能删除自己的评论')
  db.prepare('DELETE FROM moment_interactions WHERE id=?').run(row.id)
  return null
}

/* ─────────── 信件 ─────────── */

// 信箱枢纽
export async function getLettersHub() {
  return db
    .prepare(
      `SELECT c.id, c.kind, c.name,
      CASE WHEN d.sync_chat_avatar = 1 AND IFNULL(d.partner_avatar, '') != ''
           THEN d.partner_avatar ELSE c.avatar END AS avatar,
      (SELECT COUNT(*) FROM letters l WHERE l.contact_id = c.id) AS total,
      (SELECT COUNT(*) FROM letters l WHERE l.contact_id = c.id AND l.is_read = 0) AS unread,
      (SELECT l.opening FROM letters l WHERE l.contact_id = c.id ORDER BY l.id DESC LIMIT 1) AS lastOpening,
      (SELECT l.created_at FROM letters l WHERE l.contact_id = c.id ORDER BY l.id DESC LIMIT 1) AS lastAt
       FROM contacts c
       LEFT JOIN contact_desktop d ON d.contact_id = c.id
       WHERE c.kind != 'group'
       ORDER BY COALESCE(lastAt, 0) DESC, c.id ASC`
    )
    .all()
}

export async function getLetters(contactId = null) {
  const cid = contactId ? Number(contactId) : null
  const rows = db
    .prepare('SELECT * FROM letters WHERE (? IS NULL OR contact_id = ?) ORDER BY created_at DESC')
    .all(cid, cid)
  const repliedQ = db.prepare('SELECT id FROM letters WHERE reply_to = ? LIMIT 1')
  const origQ = db.prepare('SELECT id, sender, opening, sentences FROM letters WHERE id = ?')
  const parseArr = (s) => { try { return s ? JSON.parse(s) : [] } catch (e) { return [] } }
  return rows.map((l) => {
    const hasReply = !!repliedQ.get(l.id)
    let replyOrig = null
    if (l.reply_to) {
      const o = origQ.get(l.reply_to)
      if (o) {
        const os = parseArr(o.sentences)
        replyOrig = { id: o.id, sender: o.sender, excerpt: os[0] || o.opening || '' }
      }
    }
    return { ...l, sentences: parseArr(l.sentences), hasReply, replyOrig }
  })
}

export async function createLetter(payload = {}) {
  const { contactId, sender, opening, closing, sentences, replyTo } = payload
  const arr = Array.isArray(sentences) ? sentences : String(sentences || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const info = db
    .prepare('INSERT INTO letters(contact_id, sender, opening, closing, sentences, reply_to, created_at) VALUES(?,?,?,?,?,?,?)')
    .run(
      contactId ? Number(contactId) : null,
      sender || 'me',
      opening || '',
      closing || '',
      JSON.stringify(arr),
      replyTo ? Number(replyTo) : null,
      Date.now()
    )
  const l = db.prepare('SELECT * FROM letters WHERE id=?').get(info.lastInsertRowid)
  return { ...l, sentences: l.sentences ? JSON.parse(l.sentences) : [] }
}

export async function markLetterRead(id) {
  db.prepare('UPDATE letters SET is_read=1 WHERE id=?').run(Number(id))
  return null
}

export async function deleteLetter(id) {
  db.prepare('DELETE FROM letters WHERE id=?').run(Number(id))
  return null
}

// 收藏/取消收藏信件（可来回切换）
export async function favoriteLetter(id) {
  const l = db.prepare('SELECT * FROM letters WHERE id=?').get(Number(id))
  if (!l) fail('信件不存在')
  if (l.favorite) {
    db.prepare('UPDATE letters SET favorite = 0 WHERE id = ?').run(l.id)
    db.prepare("DELETE FROM favorites WHERE letter_id = ? AND content_type = 'letter'").run(l.id)
    return { favorite: 0 }
  }
  const text = [l.opening, ...(l.sentences ? JSON.parse(l.sentences) : []), l.closing].filter(Boolean).join('\n')
  db.prepare(
    `INSERT INTO favorites(letter_id, contact_id, sender, content_type, text, asset_path, quote_text, quote_image, created_at)
     VALUES(?,?,?,?,?,?,?,?,?)`
  ).run(l.id, l.contact_id, l.sender, 'letter', text, null, null, null, Date.now())
  db.prepare('UPDATE letters SET favorite = 1 WHERE id = ?').run(l.id)
  return { favorite: 1 }
}

/* ─────────── 占卜记录 ─────────── */

export async function getDivinations() {
  return db.prepare('SELECT * FROM divinations ORDER BY created_at DESC LIMIT 50').all()
}

export async function saveDivination(payload = {}) {
  const info = db
    .prepare('INSERT INTO divinations(method, spread, drawn, reflection, created_at) VALUES(?,?,?,?,?)')
    .run(
      payload.method || 'tarot',
      payload.spread || '',
      JSON.stringify(payload.drawn || []),
      payload.reflection || '',
      Date.now()
    )
  return { id: info.lastInsertRowid }
}

export async function clearDivinations() {
  db.prepare('DELETE FROM divinations').run()
  return { ok: true }
}

export async function deleteDivination(id) {
  db.prepare('DELETE FROM divinations WHERE id = ?').run(Number(id))
  return { ok: true }
}

/* ─────────── 音乐 ─────────── */

const musicNow = () => Math.floor(Date.now() / 1000)

function insertSong(m) {
  const r = db
    .prepare(
      `INSERT INTO songs (title, artist, cover, lyric, duration, source, source_id, audio, plist, vip, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      m.title || '未知歌曲', m.artist || '', m.cover || '', m.lyric || '', m.duration || 0,
      m.source || 'local', m.source_id || '', m.audio || '', m.plist || '',
      m.vip ? 1 : 0, m.note || '', musicNow()
    )
  return r.lastInsertRowid
}

function songExists(source, sourceId) {
  if (!sourceId || (source !== 'netease' && source !== 'kugou')) return false
  return !!db.prepare('SELECT 1 FROM songs WHERE source = ? AND source_id = ?').get(source, sourceId)
}

// 曲库列表（带指定联系人的收藏标记）
export async function getMusicSongs(contactId = 0) {
  const cid = Number(contactId || 0)
  const songs = db.prepare('SELECT * FROM songs ORDER BY id DESC').all()
  let favIds = new Set()
  if (cid) {
    favIds = new Set(
      db.prepare('SELECT song_id FROM song_favs WHERE contact_id = ?').all(cid).map((r) => r.song_id)
    )
  }
  return {
    songs: songs.map((s) => ({ ...s, fav: favIds.has(s.id) })),
    favIds: [...favIds],
  }
}

// 某个联系人的收藏 id 列表（contactId = 0 表示「我」自己的收藏）
export async function getFavIds(contactId) {
  const cid = Number(contactId)
  if (!Number.isInteger(cid) || cid < 0) fail('缺少联系人')
  const favIds = db.prepare('SELECT song_id FROM song_favs WHERE contact_id = ?').all(cid).map((r) => r.song_id)
  return { contactId: cid, favIds }
}

// 链接导入：网易云歌曲/歌单、酷狗、音频直链
export async function importMusic(url, note = '') {
  if (!url) fail('请先粘贴链接')
  const result = await musicService.resolveImport(url)
  const songs = result.songs || []
  const ids = []
  let skipped = 0
  let unplayable = 0
  const fresh = []
  for (const m of songs) {
    if (note) m.note = note
    if (songExists(m.source, m.source_id)) { skipped++; continue }
    ids.push(insertSong(m))
    fresh.push({ id: ids[ids.length - 1], ...m })
    if (!m.audio) unplayable++
  }
  /* 歌词后台缓存：不阻塞导入结果返回（并发受限的队列里慢慢抓） */
  for (const s of fresh) musicCache.enqueueLyric(s)
  return { imported: ids.length, skipped, playlist: result.name || '', unplayable, ids }
}

// 手动导入（歌名/歌手/音频链接）
export async function addMusicManual(payload = {}) {
  const { title, artist, audio, cover, note } = payload
  if (!title || !title.trim()) fail('填一下歌曲名称')
  if (!audio || !String(audio).trim()) fail('需要音频链接或先上传本地文件')
  const a = String(audio).trim()
  const isLocal = a.startsWith('data:') || a.startsWith('blob:')
  const id = insertSong({
    title: title.trim(),
    artist: (artist || '').trim(),
    cover: cover || '',
    audio: a,
    source: isLocal ? 'local' : 'link',
    note: note || '',
  })
  return { id }
}

// 编辑歌曲
export async function updateMusicSong(id, payload = {}) {
  const s = db.prepare('SELECT * FROM songs WHERE id = ?').get(Number(id))
  if (!s) fail('歌曲不存在')
  const next = {
    title: payload.title !== undefined ? String(payload.title) : s.title,
    artist: payload.artist !== undefined ? String(payload.artist) : s.artist,
    cover: payload.cover !== undefined ? String(payload.cover) : s.cover,
    audio: payload.audio !== undefined ? String(payload.audio) : s.audio,
    note: payload.note !== undefined ? String(payload.note) : s.note,
    plist: payload.plist !== undefined ? String(payload.plist) : s.plist,
    vip: payload.audio !== undefined && payload.audio && !s.audio ? 0 : s.vip,
  }
  db.prepare('UPDATE songs SET title=?, artist=?, cover=?, audio=?, note=?, plist=?, vip=? WHERE id=?').run(
    next.title, next.artist, next.cover, next.audio, next.note, next.plist, next.vip, s.id
  )
  return { id: s.id }
}

// 删除（单条）
export async function deleteMusicSong(id) {
  db.prepare('DELETE FROM songs WHERE id = ?').run(Number(id))
  db.prepare('DELETE FROM song_favs WHERE song_id = ?').run(Number(id))
  return { id: Number(id) }
}

// 删除（批量）
export async function batchDeleteMusicSongs(ids) {
  const list = Array.isArray(ids) ? ids : []
  const del = db.prepare('DELETE FROM songs WHERE id = ?')
  const delFav = db.prepare('DELETE FROM song_favs WHERE song_id = ?')
  const tx = db.transaction(() => {
    list.forEach((id) => { del.run(id); delFav.run(id) })
  })
  tx()
  return { deleted: list.length }
}

// 清理会员/无法播放的歌曲
// mode: 'unplayable'（默认，删无音源的云端歌）| 'vip'（删会员付费云端歌，哪怕能试听30秒）
export async function clearUnplayableSongs(mode = 'unplayable') {
  /* 与歌曲行 chip 对齐且两类互斥：
     会员 = vip 且有音频（可试听）；不可播 = 无音频（含无音源的会员歌）。
     local/link 是用户自己的文件/直链，一律不删 */
  const where = mode === 'vip'
    ? "vip = 1 AND audio <> '' AND source NOT IN ('local','link')"
    : "audio = '' AND source NOT IN ('local','link')"
  const r = db.prepare(`DELETE FROM songs WHERE ${where}`).run()
  return { deleted: r.changes }
}

// 播放时自动识别到的时长回写（补齐导入时缺失的时长：Meting 歌单/手动导入都不带时长）
export async function updateSongDuration(id, duration) {
  const d = Math.max(0, Math.round(Number(duration) || 0))
  if (!d) return
  /* 只补空缺，不覆盖已有时长（会员试听只有 30 秒，不代表歌曲真实长度） */
  db.prepare('UPDATE songs SET duration = ? WHERE id = ? AND (duration IS NULL OR duration <= 0)').run(d, Number(id))
}

/* 一键补全缺失时长（设置页用）：扫曲库里没时长的歌，按来源批量补——
   网易云走 song/detail（顺带补会员标志），酷狗走歌词检索反查；
   local/link 来源没有可查的元数据，跳过（播放时会自动识别兜底）。
   onProgress(done, total) 用于界面进度显示。 */
export async function backfillSongDurations(onProgress) {
  const rows = db.prepare(
    "SELECT id, source, source_id FROM songs WHERE (duration IS NULL OR duration <= 0) AND source IN ('netease','kugou') AND source_id <> ''"
  ).all()
  const total = rows.length
  let done = 0
  let filled = 0
  const tick = () => { done++; if (onProgress) onProgress(done, total) }

  /* 网易云：20 个一批查 song/detail，拿 duration + fee（会员标志） */
  const ne = rows.filter((r) => r.source === 'netease')
  for (let i = 0; i < ne.length; i += 20) {
    const batch = ne.slice(i, i + 20)
    const map = await musicService.neBatchDetail(batch.map((r) => r.source_id))
    for (const r of batch) {
      const m = map.get(String(r.source_id))
      if (m && m.duration > 0) {
        /* vip 只升不降：接口说是会员就标上，不把已有标志清掉 */
        db.prepare('UPDATE songs SET duration = ?, vip = MAX(vip, ?) WHERE id = ?').run(m.duration, m.vip, r.id)
        filled++
      }
      tick()
    }
  }

  /* 酷狗：歌词检索接口按 hash 反查时长（4 个并发） */
  const kg = rows.filter((r) => r.source === 'kugou')
  let cursor = 0
  const worker = async () => {
    while (cursor < kg.length) {
      const r = kg[cursor++]
      const d = await musicService.kugouSongDuration(r.source_id).catch(() => 0)
      if (d > 0) {
        db.prepare('UPDATE songs SET duration = ? WHERE id = ?').run(d, r.id)
        filled++
      }
      tick()
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, kg.length) }, worker))

  return { total, filled }
}

// 收藏（按联系人切换）
export async function favMusicSong(id, contactId) {
  /* contact_id = 0 是「我」自己的收藏（联系人 id 自增从 1 开始，0 不会冲突）；
     各联系人的收藏（含 TA 自动收藏的）只归各自，互不串门 */
  const cid = Number(contactId)
  if (!Number.isInteger(cid) || cid < 0) fail('缺少联系人')
  const songId = Number(id)
  const exists = db.prepare('SELECT 1 FROM song_favs WHERE song_id = ? AND contact_id = ?').get(songId, cid)
  if (exists) {
    db.prepare('DELETE FROM song_favs WHERE song_id = ? AND contact_id = ?').run(songId, cid)
    return { fav: false }
  }
  db.prepare('INSERT INTO song_favs (song_id, contact_id, created_at) VALUES (?,?,?)').run(songId, cid, musicNow())
  return { fav: true }
}

// 歌词：优先读本地缓存；没有才按歌曲源抓取，并顺手入库（下次离线也能看）
export async function getMusicLyric(id) {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(Number(id))
  if (!song) fail('歌曲不存在')
  if (song.lyric && song.lyric.trim()) return { lyric: song.lyric }
  let lyric = ''
  if (song.source === 'netease' && song.source_id) {
    lyric = await musicService.neGetLyric(song.source_id).catch(() => '')
  } else if (song.source === 'kugou' && song.source_id) {
    lyric = await musicService.kugouGetLyric(song.source_id).catch(() => '')
  }
  if (lyric && lyric.trim()) {
    db.prepare('UPDATE songs SET lyric = ? WHERE id = ?').run(lyric, Number(id))
  }
  return { lyric }
}

// 播放地址过期重解析：拿到新地址则更新库存并返回（调用方用返回的地址重播）
export async function refreshSongAudio(id) {
  const s = db.prepare('SELECT * FROM songs WHERE id = ?').get(Number(id))
  if (!s) fail('歌曲不存在')
  const url = await musicService.refreshAudioUrl(s)
  if (!url) return { audio: s.audio || '' }
  db.prepare('UPDATE songs SET audio = ? WHERE id = ?').run(url, Number(id))
  return { audio: url }
}

/* ─── 音乐缓存队列（封面/歌词本地化） ─── */

// 把一首歌的封面/歌词缓存任务入队（幂等，已缓存的自动跳过）
export function enqueueMusicCache(song) {
  return musicCache.enqueueSong(song)
}

// 全量补抓（设置页「一键缓存」用）：返回入队的歌曲数
export function backfillMusicCache() {
  return musicCache.backfillAll()
}

// 队列快照（设置页展示「缓存中 x 首」）
export function getMusicCacheStats() {
  return musicCache.cacheStats()
}

// 缓存完成回调（封面/歌词入库后同步内存行，供 store 注册）
export function setMusicCacheUpdateListener(fn) {
  musicCache.setCacheUpdateListener(fn)
}

// 播放地址：本地版数据库在内存里，直接同步取（audio 为导入时解析到的直链/dataURL）
export function streamUrl(id) {
  const s = db.prepare('SELECT audio FROM songs WHERE id = ?').get(Number(id))
  return (s && s.audio) || ''
}

// 播放/唱片设置（按联系人）
export async function getMusicSettings(contactId = 0) {
  const cid = Number(contactId || 0)
  if (!cid) fail('缺少联系人')
  const row = db
    .prepare(
      'SELECT play_mode, music_vinyl, music_floating, music_playlists, music_card_bg, music_card_bg_op FROM contact_desktop WHERE contact_id = ?'
    )
    .get(cid)
  let playlists = []
  try { playlists = JSON.parse((row && row.music_playlists) || '[]') } catch (e) { playlists = [] }
  if (!Array.isArray(playlists)) playlists = []
  return {
    play_mode: (row && row.play_mode) || 'list',
    vinyl: (row && row.music_vinyl) || '',
    floating: row ? (row.music_floating ? 1 : 0) : 1,
    playlists,
    musicBg: (row && row.music_card_bg) || '',
    musicBgOpacity: row && row.music_card_bg_op != null ? Number(row.music_card_bg_op) : 100,
  }
}

export async function saveMusicSettings(payload = {}) {
  const contactId = Number(payload.contactId || 0)
  if (!contactId) fail('缺少联系人')
  const cols = db.prepare('PRAGMA table_info(contact_desktop)').all().map((r) => r.name)
  const row = db.prepare('SELECT * FROM contact_desktop WHERE contact_id = ?').get(contactId)
  if (!row) {
    db.prepare('INSERT INTO contact_desktop (contact_id) VALUES (?)').run(contactId)
  }
  if (payload.play_mode !== undefined && cols.includes('play_mode')) {
    db.prepare('UPDATE contact_desktop SET play_mode = ? WHERE contact_id = ?').run(String(payload.play_mode), contactId)
  }
  if (payload.vinyl !== undefined && cols.includes('music_vinyl')) {
    db.prepare('UPDATE contact_desktop SET music_vinyl = ? WHERE contact_id = ?').run(String(payload.vinyl || ''), contactId)
  }
  if (payload.floating !== undefined && cols.includes('music_floating')) {
    db.prepare('UPDATE contact_desktop SET music_floating = ? WHERE contact_id = ?').run(payload.floating ? 1 : 0, contactId)
  }
  if (payload.playlists !== undefined && cols.includes('music_playlists')) {
    const arr = Array.isArray(payload.playlists) ? payload.playlists : []
    db.prepare('UPDATE contact_desktop SET music_playlists = ? WHERE contact_id = ?').run(JSON.stringify(arr), contactId)
  }
  if (payload.musicBg !== undefined && cols.includes('music_card_bg')) {
    db.prepare('UPDATE contact_desktop SET music_card_bg = ? WHERE contact_id = ?').run(String(payload.musicBg || ''), contactId)
  }
  if (payload.musicBgOpacity !== undefined && cols.includes('music_card_bg_op')) {
    const v = Math.max(0, Math.min(100, Number(payload.musicBgOpacity) || 0))
    db.prepare('UPDATE contact_desktop SET music_card_bg_op = ? WHERE contact_id = ?').run(v, contactId)
  }
  return { contactId }
}

/* ─────────── 设置 ─────────── */

function readGlobalSettings() {
  const obj = {}
  for (const r of settingsRepo.allGlobal()) {
    try { obj[r.key] = JSON.parse(r.value) } catch (e) { obj[r.key] = r.value }
  }
  return obj
}

export async function getSettings() {
  return readGlobalSettings()
}

export async function saveSettings(payload = {}) {
  for (const [k, v] of Object.entries(payload)) {
    settingsRepo.setGlobal(k, v)
  }
  return readGlobalSettings()
}

/* ─────────── 数据备份 / 恢复 ─────────── */

// 导出弹窗概览：板块（含条数）/ 联系人（含关联条数）/ 全量总条数
export async function getBackupOverview() {
  return backupService.backupOverview()
}

// 生成备份对象（JSON 可序列化）；scope 见 backup.service.buildBackup
export async function buildBackup(scope) {
  return backupService.buildBackup(scope)
}

// 导入备份：mode 'merge' 合并 / 'overwrite' 覆盖
export async function importBackup(payload, mode) {
  return backupService.importBackup(payload, mode)
}

// 备份文件预校验（导入前用，错误信息直接展示；同步，因为底层校验是纯函数）
export function validateBackupFile(payload) {
  return backupService.validateBackup(payload)
}

export async function getBadges() {
  return settingsRepo.getBadges()
}

// 内存数据：各数据表条数 + 估算字节 + 数据库占用（本地版图片音频都在库里，无独立上传目录）
export async function getStorageStats() {
  const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
  // 按表估算字节：所有列 CAST 成 TEXT 后 LENGTH 求和（BLOB 即字节数，dataURL 为 ASCII 文本亦准确）
  const bytesOf = (t) => {
    try {
      const row = db.prepare(`SELECT * FROM "${t}" LIMIT 1`).get()
      const cols = row ? Object.keys(row) : []
      if (!cols.length) return 0
      const expr = cols.map((n) => `COALESCE(LENGTH(CAST("${n}" AS TEXT)),0)`).join('+')
      const s = db.prepare(`SELECT COALESCE(SUM(${expr}),0) AS b FROM "${t}"`).get()
      return s ? Number(s.b) || 0 : 0
    } catch (e) {
      return 0
    }
  }
  const tables = [
    { key: 'contacts', label: '联系人' },
    { key: 'chat_messages', label: '聊天消息' },
    { key: 'letters', label: '信件' },
    { key: 'moments', label: '朋友圈' },
    { key: 'cards', label: '字卡' },
    { key: 'favorites', label: '收藏' },
    { key: 'wallets', label: '钱包' },
    { key: 'anniversaries', label: '纪念日' },
    { key: 'app_items', label: '模块记录' },
    { key: 'divinations', label: '占卜' },
  ].map((t) => ({ ...t, count: count(t.key), bytes: bytesOf(t.key) }))
  const sumBytes = (keys) => keys.reduce((s, k) => s + bytesOf(k), 0)
  const sumCount = (keys) => keys.reduce((s, k) => s + count(k), 0)
  const CONTENT = ['songs', 'song_favs', 'cards', 'card_groups', 'letters', 'moments', 'moment_interactions',
    'favorites', 'wallets', 'anniversaries', 'divinations', 'app_items', 'companion_invites', 'listen_together']
  const SETTINGS = ['contacts', 'contact_members', 'contact_settings', 'contact_desktop',
    'global_settings', 'proactive_jobs', 'group_member_settings']
  return {
    tables,
    dbSize: db.size || 0,
    uploadsSize: 0,
    groups: {
      chat: { bytes: bytesOf('chat_messages'), count: count('chat_messages') },
      content: { bytes: sumBytes(CONTENT), count: sumCount(CONTENT) },
      settings: { bytes: sumBytes(SETTINGS), count: sumCount(SETTINGS) },
    },
  }
}

/* ─────────── 一起听 ─────────── */

const LISTEN_KEY = 'listen_minutes'
const readMinutes = () => Number(settingsRepo.getGlobal(LISTEN_KEY)) || 0

export async function getListenMinutes() {
  return { minutes: readMinutes() }
}

export async function addListenMinutes(add) {
  const v = Math.max(0, readMinutes() + (Number(add) || 0))
  settingsRepo.setGlobal(LISTEN_KEY, v)
  return { minutes: v }
}

export async function setListenMinutes(value) {
  const v = Math.max(0, Number(value) || 0)
  settingsRepo.setGlobal(LISTEN_KEY, v)
  return { minutes: v }
}

export async function sendListenInvite(contactId, song) {
  if (!contactId) fail('缺少联系人')
  const r = listenService.sendInvite(Number(contactId), song || {})
  if (r.error) fail(r.error)
  return r
}

export async function respondListenInvite(id, accept) {
  const r = listenService.respond(Number(id), !!accept)
  if (r.error) fail(r.error)
  return r
}

export async function cancelListenInvite(id) {
  const r = listenService.cancel(Number(id))
  if (r.error) fail(r.error)
  return r
}

export async function endListen(id) {
  const r = listenService.end(Number(id))
  if (r.error) fail(r.error)
  return r
}

export async function getListenInvites(limit = 50) {
  return listenService.listInvites(limit)
}

/* ─────────── 陪伴邀请 ─────────── */

export async function sendCompanionInvite(payload = {}) {
  if (!payload.contactId) fail('缺少联系人')
  const r = companionService.sendInvite(Number(payload.contactId), payload)
  if (r.error) fail(r.error)
  return r
}

export async function respondCompanionInvite(id, accept) {
  const r = companionService.respond(Number(id), !!accept)
  if (r.error) fail(r.error)
  return r
}

export async function cancelCompanionInvite(id) {
  const r = companionService.cancel(Number(id))
  if (r.error) fail(r.error)
  return r
}

export async function getCompanionInvites(limit = 50) {
  return companionService.listInvites(limit)
}

/* ─────────── 通用模块（日记/备忘录/心情/经期/相册/音乐/影视/游戏/档案） ─────────── */

const ITEM_MODULES = ['diary', 'memo', 'mood', 'period', 'album', 'music', 'cinema', 'game', 'archive']

function parseExtra(v) {
  if (v == null) return {}
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch (e) { return {} }
}

function shapeItem(row) {
  if (!row) return row
  return { ...row, extra: parseExtra(row.extra) }
}

export async function listItems(module, contactId = null) {
  if (!module || !ITEM_MODULES.includes(module)) fail('unknown module')
  const cid = contactId != null && contactId !== '' ? Number(contactId) : null
  const rows =
    cid == null
      ? db.prepare('SELECT * FROM app_items WHERE module = ? ORDER BY sort ASC, id DESC').all(module)
      : db.prepare('SELECT * FROM app_items WHERE module = ? AND (contact_id = ? OR contact_id IS NULL) ORDER BY sort ASC, id DESC').all(module, cid)
  return rows.map(shapeItem)
}

export async function createItem(payload = {}) {
  if (!ITEM_MODULES.includes(payload.module)) fail('unknown module')
  const now = Math.floor(Date.now() / 1000)
  const info = db
    .prepare(
      `INSERT INTO app_items(module, contact_id, title, body, extra, done, sort, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.module,
      payload.contactId != null && payload.contactId !== '' ? Number(payload.contactId) : null,
      String(payload.title || ''),
      String(payload.body || ''),
      JSON.stringify(payload.extra || {}),
      payload.done ? 1 : 0,
      Number(payload.sort || 0),
      now,
      now
    )
  return shapeItem(db.prepare('SELECT * FROM app_items WHERE id = ?').get(info.lastInsertRowid))
}

export async function updateItem(id, payload = {}) {
  const iid = Number(id)
  const sets = []
  const params = []
  const map = { title: 'title', body: 'body', done: 'done', sort: 'sort', contactId: 'contact_id' }
  for (const [k, col] of Object.entries(map)) {
    if (payload[k] !== undefined) {
      sets.push(`${col} = ?`)
      params.push(col === 'done' ? (payload[k] ? 1 : 0) : payload[k])
    }
  }
  if (payload.extra !== undefined) {
    sets.push('extra = ?')
    params.push(JSON.stringify(payload.extra || {}))
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    params.push(Math.floor(Date.now() / 1000))
    params.push(iid)
    db.prepare(`UPDATE app_items SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  return shapeItem(db.prepare('SELECT * FROM app_items WHERE id = ?').get(iid))
}

export async function removeItem(id) {
  db.prepare('DELETE FROM app_items WHERE id = ?').run(Number(id))
  return true
}

/* ─────────── 纪念日 ─────────── */

/** 计算某纪念日的"已过天数"与"距下次发生的天数" */
function decorateAnniversary(a) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const start = new Date(`${a.date}T00:00:00`)
  if (Number.isNaN(start.getTime())) {
    return { ...a, days_passed: null, days_until: null }
  }
  const daysPassed = Math.floor((today.setHours(0, 0, 0, 0) - start.getTime()) / 86400000) + 1
  let daysUntil = null
  if (a.repeat_yearly) {
    const now = new Date()
    let next = new Date(now.getFullYear(), start.getMonth(), start.getDate())
    if (next.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      next = new Date(now.getFullYear() + 1, start.getMonth(), start.getDate())
    }
    daysUntil = Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
  }
  return { ...a, days_passed: daysPassed >= 0 ? daysPassed : 0, days_until: daysUntil, today: todayStr }
}

export async function getAnniversaries(params = {}) {
  const cid = params.contactId != null && params.contactId !== '' ? Number(params.contactId) : null
  let rows
  if (cid != null) {
    rows = db.prepare('SELECT * FROM anniversaries WHERE contact_id = ? OR contact_id IS NULL ORDER BY date ASC').all(cid)
  } else {
    rows = db.prepare('SELECT * FROM anniversaries ORDER BY date ASC').all()
  }
  return rows.map(decorateAnniversary)
}

export async function createAnniversary(payload = {}) {
  const { title, date, icon, repeat_yearly, note, contactId, type, calendar } = payload
  if (!title || !title.trim()) fail('请填写纪念日名称')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('日期格式应为 YYYY-MM-DD')
  const annType = type === 'countdown' ? 'countdown' : 'anniversary'
  const annCal = calendar === 'lunar' ? 'lunar' : 'solar'
  const info = db
    .prepare(
      'INSERT INTO anniversaries(contact_id, title, date, icon, repeat_yearly, type, calendar, note, created_at) VALUES(?,?,?,?,?,?,?,?,?)'
    )
    .run(
      contactId != null ? Number(contactId) : null,
      title.trim(),
      date,
      icon || 'calendar',
      repeat_yearly === false || repeat_yearly === 0 ? 0 : 1,
      annType,
      annCal,
      note || '',
      Date.now()
    )
  return decorateAnniversary(db.prepare('SELECT * FROM anniversaries WHERE id=?').get(info.lastInsertRowid))
}

export async function updateAnniversary(id, payload = {}) {
  const iid = Number(id)
  const cur = db.prepare('SELECT * FROM anniversaries WHERE id=?').get(iid)
  if (!cur) fail('纪念日不存在')
  db.prepare('UPDATE anniversaries SET title=?, date=?, icon=?, repeat_yearly=?, type=?, calendar=?, note=? WHERE id=?').run(
    payload.title != null ? payload.title : cur.title,
    payload.date != null ? payload.date : cur.date,
    payload.icon != null ? payload.icon : cur.icon,
    payload.repeat_yearly != null ? (payload.repeat_yearly ? 1 : 0) : cur.repeat_yearly,
    payload.type != null ? (payload.type === 'countdown' ? 'countdown' : 'anniversary') : cur.type,
    payload.calendar != null ? (payload.calendar === 'lunar' ? 'lunar' : 'solar') : cur.calendar,
    payload.note != null ? payload.note : cur.note,
    iid
  )
  return decorateAnniversary(db.prepare('SELECT * FROM anniversaries WHERE id=?').get(iid))
}

export async function deleteAnniversary(id) {
  db.prepare('DELETE FROM anniversaries WHERE id=?').run(Number(id))
  return { id: Number(id) }
}
