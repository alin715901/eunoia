// 前端调度器：原服务端 cron.js + index.js 两个 setInterval 的本地化移植。
// 纯静态部署下没有服务端常驻进程，所有「到点触发」逻辑改由页面内的定时器驱动：
//   1) 60s 轮询：主动消息 / 朋友圈 / 信件 / 陪伴邀请 / 一起听邀请 / 联系人收藏歌 / 红包
//      —— 各 tick 内部按 DB 时间戳（proactive_next_at / letter_next_at 等）节流，
//         关页期间到期的事件会在下次开页时立即补发（时间戳天然支持离线补偿）。
//   2) 60min 来电邀请：概率按「每小时一次」计，用 localStorage 记住上次摇签时间，
//      避免每次开页都摇一次；关页超过 1 小时再开页会补摇一次（不补摇期间全部次数）。
//   3) visibilitychange：页面从后台切回前台时立即补跑一轮 60s tick
//      （后台标签页定时器会被浏览器节流，睡眠唤醒后定时器也会停摆）。
import db from './db'
import * as notification from './services/notification.service'
import { proactiveTick, redpacketTick } from './services/chat.service'
import { momentTick } from './services/moment.service'
import { letterTick } from './services/letter.service'
import { contactInviteTick as companionInviteTick } from './services/companion.service'
import { contactInviteTick as listenInviteTick } from './services/listen.service'
import { contactInviteTick as cinemaInviteTick } from './services/cinema-together.service'
import { contactInviteTick as gameInviteTick } from './services/games.service'
import { contactFavTick } from './services/music.service'

const TICK_MS = 60 * 1000
const CALL_CHECK_MS = 60 * 60 * 1000
const CALL_CHECK_KEY = 'eunoia:last_call_check_at'

let timer = null
let started = false

// —— 60s 轮询的各项 tick（与 cron.js 一一对应，redpacketTick 原在 index.js 独立 interval）——
function runMinuteTicks() {
  try {
    proactiveTick()
  } catch (e) {
    /* ignore */
  }
  try {
    momentTick()
  } catch (e) {
    /* ignore */
  }
  try {
    letterTick()
  } catch (e) {
    /* ignore */
  }
  try {
    companionInviteTick()
    listenInviteTick()
    cinemaInviteTick()
    gameInviteTick()
  } catch (e) {
    /* ignore */
  }
  try {
    contactFavTick()
  } catch (e) {
    /* ignore */
  }
  try {
    redpacketTick()
  } catch (e) {
    /* ignore */
  }
}

// —— 每小时来电邀请（移植自服务端 index.js，群聊来电由代码随机选一名成员发起）——
function runCallInviteCheck() {
  try {
    const rows = db
      .prepare(
        `SELECT cs.contact_id, cs.call_incoming_prob
         FROM contact_settings cs
         JOIN contacts c ON c.id = cs.contact_id
         WHERE c.kind != 'group' AND cs.call_enabled = 1 AND IFNULL(cs.blocked, 0) = 0`
      )
      .all()
    for (const r of rows) {
      if (Math.random() * 100 < Number(r.call_incoming_prob || 0)) {
        const c = db.prepare('SELECT name, avatar FROM contacts WHERE id = ?').get(r.contact_id)
        const desk = db
          .prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?')
          .get(r.contact_id)
        let avatar = (c && c.avatar) || ''
        if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar
        notification.broadcast('call_invite', {
          contactId: r.contact_id,
          name: (c && c.name) || '对方',
          avatar
        })
      }
    }
    // 群聊：按概率随机选一位成员作为发起人（群聊默认开启主动来电）
    const groups = db.prepare("SELECT id, name FROM contacts WHERE kind = 'group'").all()
    for (const g of groups) {
      const gs = db.prepare('SELECT call_enabled, call_incoming_prob FROM contact_settings WHERE contact_id = ?').get(g.id)
      const enabled = gs ? Number(gs.call_enabled) : 1
      const prob = gs ? Number(gs.call_incoming_prob || 10) : 10
      if (!enabled || Math.random() * 100 >= prob) continue
      const members = db
        .prepare(
          `SELECT m.id, m.name, m.avatar FROM contact_members cm
           JOIN contacts m ON m.id = cm.member_id WHERE cm.group_id = ?`
        )
        .all(g.id)
      if (!members.length) continue
      const mem = members[Math.floor(Math.random() * members.length)]
      notification.broadcast('call_invite', {
        groupId: g.id,
        contactId: mem.id,
        name: g.name,
        memberName: mem.name,
        avatar: mem.avatar || '',
        isGroup: true
      })
    }
  } catch (e) {
    /* ignore */
  }
}

function maybeRunCallInviteCheck() {
  let last = 0
  try {
    last = Number(window.localStorage.getItem(CALL_CHECK_KEY)) || 0
  } catch (e) {
    /* ignore */
  }
  const now = Date.now()
  if (now - last >= CALL_CHECK_MS) {
    runCallInviteCheck()
    try {
      window.localStorage.setItem(CALL_CHECK_KEY, String(now))
    } catch (e) {
      /* ignore */
    }
  }
}

function runAll() {
  runMinuteTicks()
  maybeRunCallInviteCheck()
}

// —— 启动：延迟几秒首跑（等应用挂载、事件监听就绪），之后 60s 循环；前台恢复立即补跑 ——
export function startTicks() {
  if (started) return
  started = true

  setTimeout(runAll, 3000)

  timer = setInterval(runAll, TICK_MS)

  const onVisible = () => {
    if (document.visibilityState === 'visible') runAll()
  }
  document.addEventListener('visibilitychange', onVisible)
  // 页面卸载前不再需要持久化（db.js 的 flush 已兜底），这里只清理定时器
  window.addEventListener('pagehide', () => stopTicks(), { once: true })
}

export function stopTicks() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}
