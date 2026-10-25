// 备忘录待办提醒：到点（或提前 N 分钟）触发。按提醒人配置分两路：
//   ① 选了联系人 → 以对方身份往聊天里发一条「提醒你{标题}」（无标题发「提醒你该完成待办事项了」），
//      走 chat_messages 落库 + 事件广播（typing/new_messages/badge_update），
//      界面呈现为「对方发来一条消息」的自然消息提示，不再额外弹站内提示；
//   ② 选「无」→ 广播 memo_reminder 站内事件，由 MemoReminderDialog 弹屏幕中间的系统级弹窗
//      （不是顶部 toast）；页面在后台时改发浏览器通知，回到前台再补弹。
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

  const cid = Number(rm.contactId) || 0
  if (cid) {
    const c = db.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(cid)
    if (c) {
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
      /* 选了提醒人：由对方发消息提醒我（界面已是自然消息提示），不再弹站内提示 */
      markFired(row, ex, rm)
      return
    }
    /* 联系人已不存在：降级为站内弹窗提醒 */
  }

  /* 选「无」（或联系人失效）：广播站内事件 → MemoReminderDialog 弹屏幕中间的系统弹窗 */
  notification.broadcast('memo_reminder', {
    id: row.id,
    title: String(row.title || '').trim() || '待办事项',
    text,
    contactName: ''
  })

  markFired(row, ex, rm)
}

/* 标记已触发，防止下个 tick 重复 */
function markFired(row, ex, rm) {
  const nextEx = { ...ex, remind: { ...rm, fired: Math.floor(Date.now() / 1000) } }
  try {
    db.prepare('UPDATE app_items SET extra = ? WHERE id = ?').run(JSON.stringify(nextEx), row.id)
  } catch (e) {
    /* ignore */
  }
}
