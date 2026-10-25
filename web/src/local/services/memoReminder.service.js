// 备忘录待办提醒：到点（或提前 N 分钟）触发。
// 触发时两路并发：
//   ① 选了联系人 → 以对方身份往聊天里发一条「提醒你{标题}」（无标题发「提醒你该完成待办事项了」），
//      走 chat_messages 落库 + 事件广播，与经期关怀等系统关怀同一套链路；
//   ② 不管选没选联系人 → 广播 memo_reminder 站内事件（useSSE 接住后弹 toast + 浏览器通知）。
// 触发后写 extra.remind.fired 防重复；用户在备忘里改存（save）会重置 fired 重新装弹。
// 由 ticks.js 的 60s 轮询驱动：关页期间到期的事件在下次开页时立即补发（时间戳天然支持离线补偿）。
import db from '../db'
import * as notification from './notification.service'
import { sendContactText } from './chat.service'

/* due: 'YYYY-MM-DD' 或 'YYYY-MM-DDTHH:mm' → 毫秒时间戳；只给了日期时按当天 09:00 算 */
export function dueToMs(s) {
  const str = String(s || '').trim()
  if (!str) return 0
  const d = new Date(str.includes('T') ? str : `${str}T09:00:00`)
  const t = d.getTime()
  return Number.isFinite(t) ? t : 0
}

/* 提醒时间（毫秒）= 截止时间 - 提前分钟数 */
export function remindAtMs(due, offsetMin) {
  const dueMs = dueToMs(due)
  if (!dueMs) return 0
  return dueMs - Math.max(0, Number(offsetMin) || 0) * 60000
}

export function memoReminderTick() {
  let rows = []
  try {
    rows = db.prepare("SELECT * FROM app_items WHERE module = 'memo'").all()
  } catch (e) {
    return
  }
  const now = Date.now()
  for (const r of rows) {
    let ex = {}
    try {
      ex = JSON.parse(r.extra || '{}')
    } catch (e) {
      continue
    }
    const rm = ex && ex.remind
    if (!rm || !Number(rm.on) || Number(rm.fired)) continue
    const at = remindAtMs(ex.due, rm.offset)
    if (!at || now < at) continue
    fireReminder(r, ex, rm)
  }
}

function fireReminder(row, ex, rm) {
  /* 有标题发「提醒你{标题}」，没有标题则发固定的「提醒你该完成待办事项了」 */
  const subject = String(row.title || '').trim()
  const text = subject ? `提醒你${subject}` : '提醒你该完成待办事项了'

  let contactName = ''
  const cid = Number(rm.contactId) || 0
  if (cid) {
    const c = db.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(cid)
    if (c) {
      contactName = c.name || ''
      const m = sendContactText(cid, text, { proactive: true })
      if (m) {
        const cid2 = cid
        notification.broadcast('typing', { contactId: cid2, typing: true })
        notification.broadcast('new_messages', {
          contactId: cid2,
          messages: [m],
          avatar: c.avatar || '',
          name: c.name || '对方'
        })
        notification.broadcast('badge_update', {})
        setTimeout(() => notification.broadcast('typing', { contactId: cid2, typing: false }), 2500)
      }
    }
  }

  /* 站内事件：useSSE 接住 → 弹 toast（可点进备忘录）+ 浏览器通知 */
  notification.broadcast('memo_reminder', {
    id: row.id,
    title: subject || '待办事项',
    text,
    contactName
  })

  /* 标记已触发，防止下个 tick 重复 */
  const nextEx = { ...ex, remind: { ...rm, fired: Math.floor(Date.now() / 1000) } }
  try {
    db.prepare('UPDATE app_items SET extra = ? WHERE id = ?').run(JSON.stringify(nextEx), row.id)
  } catch (e) {
    /* ignore */
  }
}
