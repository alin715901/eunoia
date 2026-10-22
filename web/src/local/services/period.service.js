/**
 * 经期特殊关怀：随 60s tick 运行。
 * 遍历开启「特殊关怀」的未拉黑单人联系人，依据用户（全局）经期记录判断：
 *   - 今天正处于经期 → 发一句「经期中」关怀
 *   - 距预测开始日还有 2~3 天 → 发一句「快来啦」提醒
 * 同一自然日对同一联系人只发一次（contact_settings.period_care_last_date 去重）。
 */
import db from '../db'
import * as notification from './notification.service'
import { contactAvatar } from './contactAvatar'
import { sendContactText } from './chat.service'
import { cyclesFromItems, careTrigger, fmtDate } from '../../utils/period'
import { careTexts } from '../../utils/careTexts'

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function periodCycles() {
  const rows = db
    .prepare("SELECT * FROM app_items WHERE module = 'period' AND (contact_id IS NULL OR contact_id = 0)")
    .all()
  return cyclesFromItems(rows)
}

export function periodCareTick() {
  try {
    const today = fmtDate(new Date())
    const cycles = periodCycles()
    const rows = db
      .prepare(
        `SELECT cs.contact_id, cs.period_care_enabled, cs.period_care_last_date, cs.blocked
         FROM contact_settings cs
         JOIN contacts c ON c.id = cs.contact_id
         WHERE c.kind != 'group'`
      )
      .all()
    for (const r of rows) {
      if (!Number(r.period_care_enabled)) continue
      if (Number(r.blocked)) continue
      if (String(r.period_care_last_date) === today) continue // 今天已关怀过
      const trigger = careTrigger(cycles, today)
      if (!trigger) continue

      const cid = r.contact_id
      const text = pick(careTexts(trigger === 'today' ? 'today' : 'soon'))
      const m = sendContactText(cid, text, { proactive: true })
      if (!m) continue
      db.prepare('UPDATE contact_settings SET period_care_last_date = ? WHERE contact_id = ?').run(today, cid)
      const info = db.prepare('SELECT name, avatar FROM contacts WHERE id = ?').get(cid)
      notification.broadcast('typing', { contactId: cid, typing: true })
      notification.broadcast('new_messages', {
        contactId: cid,
        messages: [m],
        avatar: contactAvatar(db, cid),
        name: (info && info.name) || '对方'
      })
      notification.broadcast('badge_update', {})
      const cid2 = cid
      setTimeout(() => notification.broadcast('typing', { contactId: cid2, typing: false }), 2500)
      console.log(`[periodCare] contact=${cid} 关怀(${trigger})：${text}`)
    }
  } catch (e) {
    console.error('[periodCareTick]', e.message)
  }
}
