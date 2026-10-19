/**
 * 经期特殊关怀：随 60s tick 运行。
 * 遍历开启「特殊关怀」的未拉黑单人联系人，依据用户（全局）经期记录判断：
 *   - 今天正处于经期 → 发一句「经期中」关怀
 *   - 距预测开始日还有 2~3 天 → 发一句「快来啦」提醒
 * 同一自然日对同一联系人只发一次（contact_settings.period_care_last_date 去重）。
 */
import db from '../db'
import * as notification from './notification.service'
import { sendContactText } from './chat.service'
import { cyclesFromItems, careTrigger, fmtDate } from '../../utils/period'

const TODAY_MSGS = [
  '生理期来了吧？别碰凉的，多喝热水，不舒服就告诉我。',
  '今天身体还好吗？记得暖暖肚子，别太累着自己。',
  '来例假了记得照顾好自己，红糖水和暖宝宝备上～',
  '生理期的第一天，想提醒你别熬夜，我在这儿陪着你。',
  '例假第一天，肚子疼的话就歇着，别硬撑。',
]
const SOON_MSGS = [
  '过两天生理期可能要来了，提前把暖宝宝和红糖备好呀。',
  '算算日子，过两三天该来例假了，这两天别贪凉。',
  '提醒一下，生理期快到了，注意肚子别着凉～',
  '差不多该来例假了，这两天照顾好自己，我记着呢。',
  '再过两三天生理期就要来了，少喝冰的，对自己温柔点。',
]

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
      const text = trigger === 'today' ? pick(TODAY_MSGS) : pick(SOON_MSGS)
      const m = sendContactText(cid, text, { proactive: true })
      if (!m) continue
      db.prepare('UPDATE contact_settings SET period_care_last_date = ? WHERE contact_id = ?').run(today, cid)
      const info = db.prepare('SELECT name, avatar FROM contacts WHERE id = ?').get(cid)
      notification.broadcast('typing', { contactId: cid, typing: true })
      notification.broadcast('new_messages', {
        contactId: cid,
        messages: [m],
        avatar: (info && info.avatar) || '',
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
