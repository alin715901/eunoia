// 后台安全的「对方消息」投递队列
//
// 为什么需要它：
//   原「对方回复 / 接话 / 提问回答 / 拍一拍」一律用 JS 的 setTimeout 在 1~5 秒后生成消息并弹通知。
//   但安卓 WebView 退到后台时会暂停 JS 执行（onPause），这些 setTimeout 会被冻结——
//   消息既不生成、也不弹通知；只有回到前台 WebView 恢复后才会触发，于是「后台没弹窗、点进去才有」。
//
// 解法（与主动消息 proactive 同思路，但覆盖「实时回复」）：
//   调度回复的当下就抽好内容（specs），按「送达时刻」写进安卓系统闹钟（AlarmManager），
//   即使进程被杀 / 后台也能由系统弹出真实内容；回到前台或点通知时再把消息落库（幂等）。
//   Web / PWA 无此冻结问题（后台定时器仅被节流，仍会触发），故只走普通 setTimeout 投递，不预约闹钟。
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import db from '../db'
import * as settingsRepo from '../repositories/settings.repo'
import * as chatRepo from '../repositories/chat.repo'
import { isNativePlatform, MESSAGE_CHANNEL_ID, isAppActive } from '@/composables/useLocalNotification'
import * as notification from './notification.service'

function randInt(min, max) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}

const QUEUE_KEY = 'eunoia.replyQueue'
// 预约通知 id 段：400000~499999（与 proactive 100000~199999、即时 200000~299999、手动 900000+ 互不冲突）
// initLocalNotifications 只自动取消 100000~199999 的预约，本段一律保留，由本模块显式取消。
const REPLY_NOTIF_BASE = 400000

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

/* 预约一条系统通知（写进安卓闹钟，后台/被杀都能弹）。
   at 比送达时刻晚 400ms：保证「前台 setTimeout」总是先触发并取消闹钟（前台走应用内横条，
   不弹悬浮窗）；只有前台定时器被冻结（用户已切后台/被杀）时，闹钟才真正弹出。 */
const ALARM_GRACE_MS = 400
async function scheduleAlarm(item) {
  if (!isNativePlatform()) return
  try {
    const id = REPLY_NOTIF_BASE + item.id
    const preview = item.specs && item.specs.length ? previewOf(item.specs[item.specs.length - 1]) : '（一条消息）'
    const title = item.groupId ? contactName(item.groupId) : contactName(item.contactId)
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body: preview,
          schedule: { at: new Date(item.deliverAtMs + ALARM_GRACE_MS), allowWhileIdle: true },
          channelId: MESSAGE_CHANNEL_ID, // HIGH：离开应用悬浮弹出
          // 只带 replyId（供本模块点击时补落库）与 route（供点击跳会话）。
          // 刻意不带 contactId：避免 initLocalNotifications 的 action 处理器
          // 在 push(route) 之外又调用 onOpenChat 造成同一路由重复跳转。
          extra: {
            replyId: String(item.id),
            route: `/contacts/${item.contactId}/chat`
          }
        }
      ]
    })
  } catch (e) {
    /* ignore */
  }
}

/* id 是否属于本队列预约的通知段（供 initLocalNotifications 判定） */
export function isReplyNotificationId(id) {
  return id != null && id >= REPLY_NOTIF_BASE && id < REPLY_NOTIF_BASE + 100000
}

async function cancelAlarm(item) {
  if (!isNativePlatform()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REPLY_NOTIF_BASE + item.id }] })
  } catch (e) {
    /* ignore */
  }
}

/* 投递一条已到期的回复：落库 + 广播 + 通知 + 清理闹钟（幂等）。
   mode：
     'live'     = 前台定时器实时投递 → 正常弹应用内横条 + 静默渠道系统通知（与旧行为一致）
     'backfill' = 后台闹钟已弹过、回前台/点通知时补落库 → silent，只更新数据，
                  不再弹横条、不再发系统通知，避免重复打扰（列表/角标仍刷新）。 */
async function flushItem(id, mode = 'backfill') {
  loadQueue()
  const item = queue.get(id)
  if (!item || item.inserted) return false
  // 联系人可能已被删除/清空：直接丢弃，绝不向僵尸联系人落库
  const alive = db.prepare('SELECT id FROM contacts WHERE id = ?').get(item.contactId)
  if (!alive) {
    item.inserted = true
    queue.delete(id)
    persist()
    await cancelAlarm(item)
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
    await cancelAlarm(item)
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

/* 按 replyId 投递（用户点击通知 / 前台收到闹钟时调用，确保进会话前消息已落库）。
   mode 默认 'backfill'（点击通知：系统已弹过，静默补落库）；前台兜底可传 'live'。 */
export async function flushByReplyId(replyId, mode = 'backfill') {
  loadQueue()
  const id = Number(replyId)
  if (Number.isFinite(id)) return flushItem(id, mode)
  return false
}

/* 调度一条回复：提前抽好内容（specs），按送达时刻预约/投递。
   核心竞态自洽：
     - 前台：setTimeout 存活，到点先触发 flushItem('live') 并取消闹钟 → 走应用内横条，不弹悬浮窗；
     - 切后台/被杀：setTimeout 被冻结不再触发 → 闹钟（at=送达+400ms）照常由系统弹出真实内容；
     - 回前台 / 点通知：flushDue / flushByReplyId 以 'backfill' 静默补落库，不重复弹通知。 */
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
    // 无论当前是否前台都预约系统闹钟——覆盖「调度后立刻切后台 / 直接被杀」的情形
    scheduleAlarm(item).catch(() => {})
    // 额外排一个更早的实时投递：触发时仍在前台才走应用内横条并取消闹钟。
    // 若此刻已切后台（部分 ROM 后台定时器被延迟而非冻结仍会执行），则不再实时投递，
    // 交由系统闹钟弹出，避免「应用内 notify + 系统闹钟」双重弹窗。回前台 flushDue 再补落库。
    setTimeout(() => {
      if (!isAppActive()) return
      // 定时器若曾被后台冻结、恢复执行时已明显晚于送达时刻，说明系统闹钟很可能已经在
      // 后台弹出过（用户已看过弹窗），改为静默补投，避免回前台再弹一次横条/系统通知。
      const lateBy = Date.now() - item.deliverAtMs
      const mode = lateBy > ALARM_GRACE_MS + 300 ? 'backfill' : 'live'
      flushItem(id, mode).catch(() => {})
    }, delay)
  } else {
    // Web / PWA：后台定时器仅被节流不冻结，普通 setTimeout 即可；不预约系统闹钟
    setTimeout(() => { flushItem(id, 'live').catch(() => {}) }, delay)
  }
  return id
}

/* 初始化前后台同步（App boot 调用一次）：
   1) 冷/温启动立即补投已到期但未落库的回复（进程被杀后重开也不会丢消息）；
   2) 回到前台（Capacitor appStateChange，比 WebView visibilitychange 可靠）立即补投；
   3) 点击系统通知：按 replyId 补落库，再进会话；
   4) 前台收到本队列预约通知（极少数竞态）：取消并从托盘移除，避免前台悬浮窗残留。
   独立于 initLocalNotifications，避免模块循环依赖。 */
let syncInitialized = false
export function initReplyQueueSync() {
  if (syncInitialized) return
  syncInitialized = true
  flushDue().catch(() => {}) // 启动补投
  if (!isNativePlatform()) return
  try {
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) flushDue().catch(() => {})
    })
  } catch (e) {
    /* ignore */
  }
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', (n) => {
      const extra = (n && n.notification && n.notification.extra) || {}
      if (extra.replyId != null) flushByReplyId(extra.replyId).catch(() => {})
    })
    LocalNotifications.addListener('localNotificationReceived', (n) => {
      const id = n && n.id
      // 前台收到本队列预约通知：说明前台定时器恰好没抢先取消；从托盘移除避免前台悬浮残留，
      // 并以 'live' 补投（应用内横条 + 静默渠道），保持前台体验一致
      if (isReplyNotificationId(id) && isAppActive()) {
        LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {})
        const extra = (n && n.extra) || {}
        if (extra.replyId != null) flushByReplyId(extra.replyId, 'live').catch(() => {})
      }
    })
  } catch (e) {
    /* ignore */
  }
}

export const __replyQueue = { queue, REPLY_NOTIF_BASE }
