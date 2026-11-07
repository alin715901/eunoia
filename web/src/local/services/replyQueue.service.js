// 后台安全的「对方消息」投递队列
//
// 为什么需要它：
//   原「对方回复 / 接话 / 提问回答 / 拍一拍」一律用 JS 的 setTimeout 在 1~5 秒后生成消息并弹通知。
//   但安卓 WebView 退到后台时会暂停 JS 执行（Capacitor 在 onPause 就冻结 WebView，
//   appStateChange(false) 要到 onStop 才发），这些 setTimeout 会被冻结——
//   消息既不生成、也不弹通知；只有回到前台 WebView 恢复后才会触发，于是「后台没弹窗、点进去才有」。
//
// 解法（v2.3.10 起改为原生层投递）：
//   调度回复的当下就抽好内容（specs），同步发起一次原生插件调用，把「内容 + 送达延时」交给
//   ReplyNotifPlugin：它在原生主线程用 Handler 定时（WebView JS 冻结也照常触发），并用
//   setAlarmClock 兜底（进程被杀也能唤醒，且不受 Android 12+ 精确闹钟权限限制）。
//   到点由原生层用 Activity 生命周期标记判断前后台：后台直接弹系统通知，前台交给应用内横条。
//   JS 侧只负责消息落库（前台实时 / 回前台补投），不再参与「后台能否弹窗」的任何判断。
//   Web / PWA 无冻结问题，只走普通 setTimeout 投递。
import { App } from '@capacitor/app'
import db from '../db'
import * as settingsRepo from '../repositories/settings.repo'
import * as chatRepo from '../repositories/chat.repo'
import { isNativePlatform, isAppActive } from '@/composables/useLocalNotification'
import { postReplyNotification, cancelReplyNotification, consumeReplyRoute } from '@/composables/useReplyNotif'
import router from '@/router'
import * as notification from './notification.service'

function randInt(min, max) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}

const QUEUE_KEY = 'eunoia.replyQueue'
// 通知 id 段：400000~499999（与 proactive 100000~199999、即时 200000~299999、手动 900000+ 互不冲突）
const REPLY_NOTIF_BASE = 400000
// 原生定时器比 JS 前台定时器晚一点触发：前台时 JS 先落库走应用内横条，
// 原生到点检测到前台即跳过弹窗，避免悬浮重复。
const NATIVE_GRACE_MS = 400

/* ── 内存态 + 持久化 ── */
const queue = new Map() // id -> item
let seqCounter = 0
let loaded = false

function loadQueue() {
  if (loaded) return
  loaded = true
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(QUEUE_KEY) : null
    if (raw) {
      const arr = JSON.parse(raw) || []
      for (const it of arr) queue.set(it.id, it)
      // 取当前最大 id 作为自增起点，避免刷新后 id 碰撞
      let max = 0
      for (const it of queue.values()) if (it.id > max) max = it.id
      seqCounter = max
    }
  } catch (e) {
    /* 损坏则丢弃队列，不影响主流程 */
  }
}

function persist() {
  try {
    if (typeof window !== 'undefined') {
      const arr = []
      for (const it of queue.values()) arr.push(it)
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(arr))
    }
  } catch (e) {
    /* 隐私模式等场景忽略 */
  }
}

function nextId() {
  return ++seqCounter
}

/* 联系人的有效头像/名称（同步到聊天时用人物卡头像），弹窗与聊天界面一致 */
function effectiveContactInfo(contactId) {
  try {
    const c = db.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(contactId)
    if (!c) return { avatar: '', name: '对方' }
    let avatar = c.avatar || ''
    const desk = db
      .prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?')
      .get(contactId)
    if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar
    return { avatar, name: c.name || '对方' }
  } catch (e) {
    return { avatar: '', name: '对方' }
  }
}

function contactName(cid) {
  try {
    const c = db.prepare('SELECT name FROM contacts WHERE id = ?').get(cid)
    return (c && c.name) || '对方'
  } catch (e) {
    return '对方'
  }
}

/* 通知预览摘要（避免弹出原始 JSON / [object Object]） */
function previewOf(s) {
  const t = s && s.content_type
  const text = s && s.text
  if (t === 'redpacket') return '[红包]'
  if (t === 'call') return '[通话]'
  if (t === 'question') {
    try {
      const q = JSON.parse(text || '{}')
      return '[提问] ' + (q.question || '')
    } catch (e) {
      return '[提问]'
    }
  }
  if (t === 'image') return '[图片]'
  if (t === 'sticker') return '[表情包]'
  if (t === 'voice') return '[语音]'
  if (t === 'poke') return text || '拍了拍你'
  return text || '（一条消息）'
}

function getNextSeq(contactId) {
  const row = db
    .prepare('SELECT COALESCE(MAX(seq), 0) m FROM chat_messages WHERE contact_id = ?')
    .get(contactId)
  return (row.m || 0) + 1
}

/* 把一组已抽好的内容 spec 落库为「对方」发来的消息，返回落库后的消息对象数组 */
function insertSpecs(contactId, specs, createdAtSec) {
  const out = []
  for (const s of specs) {
    const info = db
      .prepare(
        `INSERT INTO chat_messages(contact_id, sender, content_type, card_id, text, asset_path, duration, author_member_id, is_proactive, read_receipt, read, seq, created_at, quote_id, quote_text, quote_image, voice_src)
         VALUES(?, 'contact', ?, ?, ?, ?, ?, ?, ?, 'delivered', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        contactId,
        s.content_type || 'text',
        s.card_id != null ? s.card_id : null,
        s.text != null ? s.text : '',
        s.asset_path != null ? s.asset_path : '',
        s.duration != null ? s.duration : null,
        s.author_member_id != null ? s.author_member_id : null,
        s.is_proactive ? 1 : 0,
        s.read ? 1 : 0,
        getNextSeq(contactId),
        createdAtSec,
        s.quote_id != null ? s.quote_id : null,
        s.quote_text != null ? s.quote_text : '',
        s.quote_image != null ? s.quote_image : '',
        s.voice_src || ''
      )
    out.push(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid))
  }
  return out
}

/* 对方小概率收藏我的消息（与 chat.service.maybeContactFavorite 同语义） */
function maybeContactFavorite(contactId) {
  try {
    if (Math.random() >= 0.15) return
    const rows = db
      .prepare(
        `SELECT * FROM chat_messages
         WHERE contact_id = ? AND sender = 'me' AND content_type IN ('text','card')
           AND text IS NOT NULL AND TRIM(text) != ''
         ORDER BY id DESC LIMIT 10`
      )
      .all(contactId)
    if (!rows.length) return
    const target = rows[Math.floor(Math.random() * rows.length)]
    const dup = db
      .prepare("SELECT id FROM favorites WHERE message_id = ? AND IFNULL(fav_by, 'me') = 'contact'")
      .get(target.id)
    if (!dup) {
      db.prepare(
        `INSERT INTO favorites(message_id, contact_id, sender, content_type, text, asset_path, quote_text, quote_image, created_at, fav_by)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'contact')`
      ).run(
        target.id, contactId, target.sender, target.content_type, target.text,
        target.asset_path || '', target.quote_text || '', target.quote_image || '',
        Math.floor(Date.now() / 1000)
      )
    }
    const info = effectiveContactInfo(contactId)
    notification.broadcast('contact_favorite', {
      contactId,
      name: info.name,
      avatar: info.avatar,
      text: String(target.text || '').slice(0, 40)
    })
  } catch (e) {
    /* ignore */
  }
}

/* 把一条回复交给原生层调度（同步发起 bridge 调用，不等 Promise）。
   原生层会在 delayMs 后自行判断前后台并弹窗，JS 随后切后台 / 被冻结都不影响。 */
function dispatchToNative(item, delayMs) {
  const last = item.specs && item.specs.length ? item.specs[item.specs.length - 1] : null
  postReplyNotification({
    id: REPLY_NOTIF_BASE + item.id,
    delayMs: Math.max(500, delayMs + NATIVE_GRACE_MS),
    title: item.groupId ? contactName(item.groupId) : contactName(item.contactId),
    body: previewOf(last),
    route: `/contacts/${item.contactId}/chat`
  })
}

/* 投递一条已到期的回复：落库 + 广播（幂等）。
   注意：这里「不」取消原生通知——后台能否弹窗完全由原生层决定，
   JS 侧的前后台标记（appStateChange 在切后台时可能来不及更新）不再参与判断，
   否则又会出现「误判前台 → 取消通知 → 后台不弹窗」的老问题。
   mode：
     'live'     = 前台实时投递 → 正常弹应用内横条
     'backfill' = 回前台 / 点通知时补落库 → silent，只更新数据，不重复弹横条/通知 */
async function flushItem(id, mode = 'backfill') {
  loadQueue()
  const item = queue.get(id)
  if (!item || item.inserted) return false
  // 联系人可能已被删除/清空：丢弃队列，并撤销原生层尚未弹出的通知
  const alive = db.prepare('SELECT id FROM contacts WHERE id = ?').get(item.contactId)
  if (!alive) {
    item.inserted = true
    queue.delete(id)
    persist()
    cancelReplyNotification(REPLY_NOTIF_BASE + item.id)
    return false
  }
  try {
    const createdAtSec = Math.floor(item.deliverAtMs / 1000)
    // 对方来回复 = 已读我的消息（落库前标已读，与 chat.service.emitCards 一致）
    db.prepare(
      "UPDATE chat_messages SET read = 1, read_receipt = 'read' WHERE contact_id = ? AND sender = 'me' AND read_receipt != 'read'"
    ).run(item.contactId)
    const messages = insertSpecs(item.contactId, item.specs, createdAtSec)
    const info = effectiveContactInfo(item.contactId)
    notification.broadcast('typing', { contactId: item.contactId, typing: false })
    notification.broadcast('new_messages', {
      contactId: item.contactId,
      messages,
      avatar: info.avatar,
      name: info.name,
      silent: mode === 'backfill'
    })
    notification.broadcast('badge_update', settingsRepo.getBadges())
    if (item.meta && item.meta.favorite) maybeContactFavorite(item.contactId)
    // 对方小概率撤回刚发出的这条回复（与 chat.service.maybeContactRecall 同语义：
    // 需开启 contact_recall_enabled 开关 + 10% 概率 + 2~6 秒后撤回）
    if (item.meta && item.meta.recall) {
      const rst = db.prepare('SELECT contact_recall_enabled FROM contact_settings WHERE contact_id = ?').get(item.contactId)
      const target = messages.find((m) => ['text', 'card'].includes(m.content_type) && m.text)
      if (rst && Number(rst.contact_recall_enabled) && target && Math.random() < 0.1) {
        setTimeout(() => {
          try {
            const row = chatRepo.recallMessage(target.id)
            if (row) {
              notification.broadcast('message_update', { contactId: item.contactId, message: row })
              notification.broadcast('badge_update', settingsRepo.getBadges())
            }
          } catch (e) {
            /* ignore */
          }
        }, randInt(2000, 6000))
      }
    }
    item.inserted = true
    queue.delete(id)
    persist()
    return true
  } catch (e) {
    console.error('[replyQueue] flushItem failed', e)
    return false
  }
}

/* 投递所有已到期的回复（回到前台 / 启动 / 周期巡检时调用） */
export async function flushDue() {
  loadQueue()
  if (!queue.size) return
  const now = Date.now()
  const due = []
  for (const it of queue.values()) {
    if (!it.inserted && it.deliverAtMs <= now) due.push(it.id)
  }
  for (const id of due) {
    try {
      await flushItem(id, 'backfill')
    } catch (e) {
      /* ignore */
    }
  }
}

/* 按 replyId 补落库（点击通知等场景，确保进会话前消息已入库） */
export async function flushByReplyId(replyId, mode = 'backfill') {
  loadQueue()
  const id = Number(replyId)
  if (Number.isFinite(id)) return flushItem(id, mode)
  return false
}

/* 调度一条回复：提前抽好内容（specs），交给原生层定时投递。
   竞态自洽（关键是「后台弹窗不依赖 JS」）：
     - 前台：JS setTimeout 到点落库 + 应用内横条；原生定时器稍后触发，检测到前台即跳过弹窗；
     - 切后台 / 被杀：JS 定时器冻结不再触发，原生 Handler（或 setAlarmClock）照常弹系统通知；
     - 回前台 / 点通知：flushDue 以 'backfill' 静默补落库，列表与角标刷新，不重复打扰。 */
export function enqueueReply({ contactId, groupId = null, deliverAtMs, specs, meta = {} }) {
  if (!contactId || !Array.isArray(specs) || !specs.length) return null
  loadQueue()
  const id = nextId()
  const item = {
    id,
    contactId: Number(contactId),
    groupId: groupId != null ? Number(groupId) : null,
    deliverAtMs: Math.max(Date.now() + 500, deliverAtMs || Date.now() + 500),
    specs,
    meta,
    inserted: false
  }
  queue.set(id, item)
  persist()
  const delay = Math.max(0, item.deliverAtMs - Date.now())
  if (isNativePlatform()) {
    // 同步发起原生调度：此刻仍在前台，bridge 调用立即到达 native 并登记定时器/闹钟，
    // 用户随后立刻切后台也不会漏（这是「后台收不到弹窗」的核心修复点）。
    dispatchToNative(item, delay)
    // 前台实时投递仅负责落库与应用内横条，绝不取消原生通知。
    setTimeout(() => {
      if (!isAppActive()) return
      // 定时器若曾被后台冻结、恢复执行时已明显晚于送达时刻，说明原生通知很可能已弹出过，
      // 改为静默补投，避免回前台再弹一次横条。
      const lateBy = Date.now() - item.deliverAtMs
      const mode = lateBy > NATIVE_GRACE_MS + 300 ? 'backfill' : 'live'
      flushItem(id, mode).catch(() => {})
    }, delay)
  } else {
    // Web / PWA：后台定时器仅被节流不冻结，普通 setTimeout 即可
    setTimeout(() => { flushItem(id, 'live').catch(() => {}) }, delay)
  }
  return id
}

function openReplyRoute(route) {
  if (!route) return
  try { router.push(String(route)) } catch (e) { /* ignore */ }
}

/* 初始化前后台同步（App boot 调用一次）：
   1) 冷/温启动立即补投已到期但未落库的回复（进程被杀后重开也不会丢消息）；
   2) 回到前台（Capacitor appStateChange）立即补投 + 消费点击通知带来的会话路由；
   3) 启动时消费「点击通知拉起 App」的路由。
   独立于 initLocalNotifications，避免模块循环依赖。 */
let syncInitialized = false
export function initReplyQueueSync() {
  if (syncInitialized) return
  syncInitialized = true
  flushDue().catch(() => {}) // 启动补投
  consumeReplyRoute().then(openReplyRoute).catch(() => {})
  if (!isNativePlatform()) return
  try {
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      flushDue().catch(() => {})
      consumeReplyRoute().then(openReplyRoute).catch(() => {})
    })
  } catch (e) {
    /* ignore */
  }
}

export const __replyQueue = { queue, REPLY_NOTIF_BASE }
