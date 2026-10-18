// 自动寄信：按联系人「信件设置」（主动寄信开关 + 每周封数 + 句数 + 开头结尾）
// 定时从 TA 的字卡库（专属库 + 通用库）抽句，生成一封「对方寄来的信」。
import db from '../db'
import { drawCards } from './cardDraw.service'
import * as notification from './notification.service'
import * as settingsRepo from '../repositories/settings.repo'

function randInt(lo, hi) {
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 0;
  if (hi < lo) [lo, hi] = [hi, lo];
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

// 把「每周封数」换算成两次寄信之间的间隔（秒）。
// 最频繁（weekMax 封/周）时最短间隔，最稀疏（weekMin 封/周）时最长间隔；
// weekMin 为 0 时封顶 2 周，避免出现无限长的空档。
function nextLetterIntervalSec(st) {
  const wMin = Number(st && st.letter_week_min) || 0;
  const wMax = Number(st && st.letter_week_max) || 0;
  if (wMax <= 0) return null; // 频率为 0，视为关闭
  const weekMinutes = 7 * 24 * 60;
  const lo = Math.max(1, Math.round(weekMinutes / wMax));
  let hi = wMin > 0 ? Math.round(weekMinutes / wMin) : 14 * 24 * 60;
  if (hi < lo) hi = lo;
  return randInt(lo, hi) * 60;
}

// 把信件模板里的 {name} 换成合适的人名：
// 抬头（opening）是「对方写给我」的称呼，{name}=收件人（我的）名字；
// 落款（closing）是签名，{name}=发件人（联系人）名字。
// 收件人名字优先用联系人设置里的「我的备注」，未设置时回落到人物卡名字，再回落「我」。
function resolveNames(cid) {
  const cs = db.prepare('SELECT my_name FROM contact_settings WHERE contact_id = ?').get(cid) || {};
  const dk = db.prepare('SELECT my_name FROM contact_desktop WHERE contact_id = ?').get(cid) || {};
  const contact = db.prepare('SELECT name FROM contacts WHERE id = ?').get(cid) || {};
  let recipient = (cs.my_name && String(cs.my_name).trim() && cs.my_name !== '我' && cs.my_name) || null;
  if (!recipient) recipient = (dk.my_name && String(dk.my_name).trim()) || '我';
  const sender = (contact.name && String(contact.name).trim()) || 'TA';
  return { recipient, sender };
}

function fillTemplate(text, name) {
  if (!text) return text;
  return String(text).replace(/\{name\}/g, name);
}

// 为单个联系人生成一封来信（已确认开启且到时间）。
function generateForContact(cid, st) {
  const id = composeLetter(cid, st, null)
  if (!id) return null
  const now = Math.floor(Date.now() / 1000)
  const nextAt = now + (nextLetterIntervalSec(st) || 7 * 24 * 3600);
  db.prepare('UPDATE contact_settings SET letter_next_at = ? WHERE contact_id = ?').run(nextAt, cid);
  return id
}

// 信件的生成核心：从 TA 的字卡库抽句 + 开头结尾组装入库。
// replyTo 非空时这是一封回信（指向我寄出的信）；为空时是主动来信。
// 返回新信 id；字卡库不可用等异常时返回 null。
function composeLetter(cid, st, replyTo) {
  try {
    let sMin = Number(st && st.letter_sentences_min) || 1;
    let sMax = Number(st && st.letter_sentences_max) || 1;
    if (sMax < sMin) [sMin, sMax] = [sMax, sMin];
    const count = randInt(Math.max(1, sMin), Math.max(1, sMax));

    // 从 TA 的字卡库（专属 + 通用，按 gen_ratio/权重混抽）抽 count 条
    const cards = drawCards(db, cid, count);
    const sentences = (cards || [])
      .map((c) => (c && c.content ? String(c.content).trim() : ''))
      .filter(Boolean);
    if (!sentences.length) {
      sentences.push('今天也想跟你说说话，哪怕只是写写闲事。');
    }

    // 开头结尾：设置里填了就用设置的（替换 {name}），否则给个温柔默认
    const { recipient, sender } = resolveNames(cid);
    const openingRaw = (st && st.letter_opening && String(st.letter_opening).trim()) || '亲爱的，';
    const closingRaw = (st && st.letter_closing && String(st.letter_closing).trim()) || '';
    let opening = fillTemplate(openingRaw, recipient);
    // 收件人未设真名时（回落到「我」），"致我" 不通顺，改用通用称呼
    if (recipient === '我' && opening === '致我') opening = '亲爱的，';
    const closing = fillTemplate(closingRaw, sender);

    const info = db
      .prepare(
        'INSERT INTO letters(contact_id, sender, opening, closing, sentences, reply_to, created_at) VALUES(?,?,?,?,?,?,?)'
      )
      .run(cid, 'contact', opening, closing, JSON.stringify(sentences), replyTo ? Number(replyTo) : null, Date.now());
    return info.lastInsertRowid;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[composeLetter]', cid, e.message);
    return null;
  }
}

// 每分钟由 cron 调用一次：扫描所有单人联系人，到点就自动寄信。
function letterTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Math.floor(Date.now() / 1000);
    for (const c of rows) {
      const cid = c.id;
      const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(cid);
      if (st && st.blocked) continue;
      // 未建设置行（或 letter_enabled 关闭）的联系人跳过
      const enabled = st ? Number(st.letter_enabled) : 0;
      if (!enabled) continue;
      const wMax = Number(st && st.letter_week_max) || 0;
      if (wMax <= 0) continue;

      let next = st ? Number(st.letter_next_at) || 0 : 0;
      if (!next) {
        // 从未调度过：用「上一封对方来信时间 + 一个间隔」补算，保证重启不补发；
        // 若 TA 从未寄过信，才允许本轮立即寄一封作为起点。
        const lastRow = db
          .prepare('SELECT MAX(created_at) AS t FROM letters WHERE contact_id = ? AND sender = ?')
          .get(cid, 'contact');
        const lastSent = lastRow && lastRow.t ? Math.floor(Number(lastRow.t) / 1000) : 0;
        if (lastSent) {
          next = lastSent + (nextLetterIntervalSec(st) || 7 * 24 * 3600);
          db.prepare('UPDATE contact_settings SET letter_next_at = ? WHERE contact_id = ?').run(next, cid);
        } else {
          next = 0; // 首次：立刻寄一封
        }
      }
      if (next && now < next) continue;

      const id = generateForContact(cid, st);
      if (id) {
        // eslint-disable-next-line no-console
        console.log(`[letter] contact=${cid} 自动寄出一封（id=${id}）`);
        notification.broadcast('badge_update', settingsRepo.getBadges());
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[letterTick]', e.message);
  }
}

// 每分钟由 cron 调用一次：我寄出的信到点后，对方回一封。
// 回信时间窗 48 小时（reply_due_at 由 createLetter 随机排定），
// 关页期间到点的信会在下次开页时立即补回（时间戳天然支持离线补偿）。
// 只回还没被回过的信（NOT EXISTS reply_to），群聊不参与，屏蔽的联系人跳过。
function replyTick() {
  try {
    const now = Date.now();
    const pendings = db
      .prepare(
        `SELECT l.id, l.contact_id FROM letters l
         WHERE l.sender = 'me'
           AND l.reply_due_at IS NOT NULL
           AND l.reply_due_at <= ?
           AND NOT EXISTS (SELECT 1 FROM letters r WHERE r.reply_to = l.id)
         ORDER BY l.reply_due_at ASC
         LIMIT 5`
      )
      .all(now);
    for (const p of pendings) {
      const c = db.prepare('SELECT id, kind FROM contacts WHERE id = ?').get(p.contact_id);
      if (!c || c.kind === 'group') continue;
      const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(p.contact_id);
      if (st && st.blocked) continue;
      // 回信不要求对方开启「主动来信」：回复我寄出的信是基本互动，与主动频率设置无关
      const id = composeLetter(p.contact_id, st, p.id);
      if (id) {
        db.prepare('UPDATE letters SET reply_due_at = NULL WHERE id = ?').run(p.id);
        // eslint-disable-next-line no-console
        console.log(`[letter] contact=${p.contact_id} 回复了我寄出的信（原信 id=${p.id}，回信 id=${id}）`);
        notification.broadcast('badge_update', settingsRepo.getBadges());
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[replyTick]', e.message);
  }
}

export { letterTick, replyTick, generateForContact }
