// 朋友圈：联系人主动发动态（按联系人的「朋友圈设置」调度，内容取该联系人的字卡库）
import db from '../db'
import { drawCards } from './cardDraw.service'
import * as notification from './notification.service'
import * as settingsRepo from '../repositories/settings.repo'
import { contactAvatar } from './contactAvatar'
import { pctToProb } from '@/utils/prob'

/* 内容来源：抽 n 张字卡「拼」成一条动态（拼字卡式，1~7 张随机）：
   文字卡的 content 拼成正文，图片/表情包卡的图收进 images；
   三种形态都可能出现 —— 只有文字、只有图、文字+图混合，与手动发朋友圈一致。
   纯文字但太短（如单字「行」）就再抽一次，避免动态空洞。 */
function drawContent(contactId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cards = drawCards(db, contactId, randInt(1, 7)) || [];
    const texts = [];
    const images = [];
    for (const card of cards) {
      if (!card) continue;
      const isVisual = card.category === 'image' || card.category === 'sticker';
      /* 视觉卡只出图（其 content 是字卡名/备注，不当正文）；文字卡进正文 */
      if (isVisual && card.asset_path && images.length < 9) {
        images.push(card.asset_path);
        continue;
      }
      const t = String(card.content || '').trim();
      if (t) texts.push(t);
    }
    const text = texts.join(' ');
    if (!text && !images.length) continue;
    if (!images.length && text.length < 2 && attempt === 0) continue;
    return { text, images };
  }
  return null;
}

/* 发一条：author='contact'，contact_id 留空 = 所有人可见 */
function postContactMoment(contactId) {
  const c = db.prepare('SELECT id, name, avatar FROM contacts WHERE id=?').get(contactId);
  if (!c) return null;
  const body = drawContent(contactId);
  if (!body) return null;
  const now = Date.now();
  const info = db
    .prepare(
      'INSERT INTO moments(contact_id, author, author_contact_id, text, images, created_at) VALUES(?,?,?,?,?,?)'
    )
    .run(null, 'contact', contactId, body.text, JSON.stringify(body.images), now);
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(info.lastInsertRowid);
  const payload = {
    ...m,
    images: m.images ? JSON.parse(m.images) : [],
    likes: 0,
    likeNames: [],
    liked: false,
    comments: []
  };
  notification.broadcast('moment_new', {
    moment: payload,
    contactId,
    name: c.name,
    avatar: contactAvatar(db, contactId)
  });
  /* 首页朋友圈图标角标 +1 */
  notification.broadcast('badge_update', settingsRepo.getBadges());
  return payload;
}

/* 当天已发条数（按作者联系人统计） */
function todayCount(contactId) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const r = db
    .prepare(
      "SELECT COUNT(*) c FROM moments WHERE author='contact' AND author_contact_id=? AND created_at>=?"
    )
    .get(contactId, d.getTime());
  return Number(r?.c || 0);
}

/* 该联系人最后一条动态的时间戳 */
function lastAt(contactId) {
  const r = db
    .prepare("SELECT MAX(created_at) t FROM moments WHERE author='contact' AND author_contact_id=?")
    .get(contactId);
  return Number(r?.t || 0);
}

const DAY = 24 * 60 * 60 * 1000;

/* 回复内容：随机抽 1~3 张字卡「凑一起」作为一条回复（可带图） */
function drawReplyContent(contactId) {
  const n = randInt(1, 3);
  const cards = drawCards(db, contactId, n) || [];
  const texts = [];
  const images = [];
  for (const card of cards) {
    if (!card) continue;
    const t = String(card.content || '').trim();
    if (t) texts.push(t);
    const isVisual = card.category === 'image' || card.category === 'sticker';
    if (isVisual && card.asset_path && images.length < 3) images.push(card.asset_path);
  }
  if (!texts.length && !images.length) return null;
  return { content: texts.join(' '), images };
}

function randInt(lo, hi) {
  const a = Math.max(0, Number(lo) || 0);
  const b = Math.max(a, Number(hi) || a);
  return a + Math.floor(Math.random() * (b - a + 1));
}

/* 朋友圈「评论速度」：对方给我朋友圈点赞 / 评论 / 回复的快慢（分钟区间）。
   慢=克制、适中=日常、快=活跃。返回点赞与评论两套延迟（毫秒，带随机抖动）。
   注：延迟经过实测校准 —— 早期版本 normal 20~90 分钟，用户根本等不到就看到「没回」，
   现在压缩到分钟级（到点由持久化队列补发，刷新/关页都不丢）。 */
const SPEED = {
  slow: { like: [8, 30], comment: [10, 40] },
  normal: { like: [2, 8], comment: [3, 10] },
  fast: { like: [0.5, 3], comment: [1, 4] }
}
function speedDelays(speed) {
  const s = SPEED[speed] || SPEED.normal;
  const r = (a, b) => (a + Math.random() * (b - a)) * 60 * 1000;
  return { likeDelay: r(s.like[0], s.like[1]), commentDelay: r(s.comment[0], s.comment[1]) };
}

/* 抽不到字卡时的兜底回复（全局卡为空也可能发生，保证「概率过了就一定回」） */
const FALLBACK_REPLIES = ['嗯嗯', '哈哈哈', '好呀', '在呢在呢', '收到～', '想你了'];

/* 入队一条待办（持久化）：due_at 到点后由 flushPendingMoments 发货 */
function enqueuePending(momentId, contactId, kind, content, images, dueAt) {
  db.prepare(
    'INSERT INTO moment_pending(moment_id, contact_id, kind, content, images, due_at, created_at) VALUES(?,?,?,?,?,?,?)'
  ).run(momentId, contactId, kind, content || '', JSON.stringify(images || []), dueAt, Date.now());
}

/* 每分钟跑一次：到点的联系人发一条（每天条数 / 间隔由设置控制） */
function momentTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Date.now();
    for (const c of rows) {
      const cid = c.id;
      const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(cid);
      if (!st || !Number(st.moment_enabled)) continue;
      if (Number(st.blocked)) continue;
      const lo = Number(st.moment_count_min ?? 0);
      const hi = Math.max(lo, Number(st.moment_count_max ?? 2));
      const target = randInt(lo, hi);
      if (target <= 0) continue;
      if (todayCount(cid) >= target) continue;
      // 间隔：一天平均摊开（带 0.6~1.4 的随机抖动），最少 10 分钟
      const gap = Math.max(10 * 60 * 1000, (DAY / target) * (0.6 + Math.random() * 0.8));
      if (now - lastAt(cid) < gap) continue;
      postContactMoment(cid);
    }
  } catch (e) {
    console.error('[momentTick]', e.message);
  }
}

/* 评论落库 + 广播（对方评论 / 回复共用） */
function insertComment(momentId, contactId, body, type = 'reply', replyTo = null) {
  const now = Date.now();
  const info = db
    .prepare(
      'INSERT INTO moment_interactions(moment_id, contact_id, type, content, images, reply_to, from_card, created_at) VALUES(?,?,?,?,?,?,1,?)'
    )
    .run(momentId, contactId, type, body.content || '', JSON.stringify(body.images || []), replyTo, now);
  const c = db.prepare('SELECT id, name, avatar FROM contacts WHERE id=?').get(contactId);
  notification.broadcast('moment_new', {
    momentId,
    contactId,
    name: c?.name || 'TA',
    avatar: contactAvatar(db, contactId),
    kind: type, /* 'comment' | 'reply'：前端据此显示「评论了我的朋友圈 / 回复了我的评论」 */
    content: body.content || ''
  });
  return info.lastInsertRowid;
}

/* 我评论了对方的动态（或回复了 TA 的评论）后，TA 按设置回复：抽 1~3 张字卡凑一条。
   「回复概率」决定是否回复（默认 80%）；回复内容在入队时抽好，
   到点由 flushPendingMoments 发货 —— 持久化队列，刷新、关页都不丢。 */
function scheduleMomentReplies(momentId, contactId) {
  try {
    if (!contactId) return;
    const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(contactId);
    if (!st || !Number(st.moment_reply_enabled)) return;
    if (Number(st.blocked)) return;
    /* 按「回复概率」决定是否回复：默认 80% 回复、20% 不回复 */
    if (Math.random() > pctToProb(st.moment_reply_prob ?? 80)) return;
    /* 入队时就把回复内容抽好：抽不到就用兜底文案，保证概率过了就一定有回复 */
    let body = drawReplyContent(contactId);
    if (!body) {
      body = { content: FALLBACK_REPLIES[randInt(0, FALLBACK_REPLIES.length - 1)], images: [] };
    }
    const d = speedDelays(st.moment_comment_speed || 'normal');
    enqueuePending(momentId, contactId, 'reply', body.content, body.images, Date.now() + d.commentDelay);
  } catch (e) {
    console.error('[scheduleMomentReplies]', e.message);
  }
}

/* 到点补发：把 moment_pending 里 due_at <= now 的待办发货（点赞/评论/回复）。
   页面开着时由 60s tick 驱动；关页期间到期的事项在下次开页立即补发。 */
function flushPendingMoments() {
  try {
    const rows = db.prepare('SELECT * FROM moment_pending WHERE due_at <= ? ORDER BY due_at').all(Date.now());
    for (const r of rows) {
      try {
        /* 动态已被删 → 丢弃待办 */
        const m = db.prepare('SELECT id FROM moments WHERE id=?').get(r.moment_id);
        if (!m) { db.prepare('DELETE FROM moment_pending WHERE id=?').run(r.id); continue }
        const st = db.prepare('SELECT blocked FROM contact_settings WHERE contact_id = ?').get(r.contact_id);
        if (st && Number(st.blocked)) { db.prepare('DELETE FROM moment_pending WHERE id=?').run(r.id); continue }
        const images = r.images ? JSON.parse(r.images) : [];
        if (r.kind === 'like') {
          const dup = db
            .prepare("SELECT 1 FROM moment_interactions WHERE moment_id=? AND contact_id=? AND type='like'")
            .get(r.moment_id, r.contact_id);
          if (!dup) {
            db.prepare(
              "INSERT INTO moment_interactions(moment_id, contact_id, type, created_at) VALUES(?,?,'like',?)"
            ).run(r.moment_id, r.contact_id, Date.now());
            const ct = db.prepare('SELECT id, name, avatar FROM contacts WHERE id=?').get(r.contact_id);
            notification.broadcast('moment_new', {
              momentId: r.moment_id,
              contactId: r.contact_id,
              name: ct?.name || 'TA',
              avatar: contactAvatar(db, r.contact_id),
              kind: 'like'
            });
          }
        } else {
          /* reply 语义：回复的是「我」的评论 → reply_to=0 显示成「TA 回复 我」。
             moment_new 广播由 insertComment 内部发出（带 kind，前端区分文案） */
          insertComment(r.moment_id, r.contact_id, { content: r.content, images }, r.kind, r.kind === 'reply' ? 0 : null);
        }
      } catch (err) {
        /* ignore */
      }
      db.prepare('DELETE FROM moment_pending WHERE id=?').run(r.id);
    }
    /* 本轮有发货则刷新首页角标 */
    notification.broadcast('badge_update', settingsRepo.getBadges());
  } catch (e) {
    console.error('[flushPendingMoments]', e.message);
  }
}

/* 我发朋友圈后：各位联系人按自己的「评论速度」选择性地点赞 / 评论（不会立即、也不会全点）。
   —— 事件驱动 + 持久化队列：点赞约 65% 概率；评论受「对方会回复评论」开关控制、约 55% 概率。
   二者各自独立，所以可能出现「只点赞不评论」或「只评论不点赞」的情况（可点也可不点）。
   入队后刷新/关页不丢，到点由 flushPendingMoments 补发。 */
function reactToMyMoments(momentId) {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Date.now();
    for (const c of rows) {
      const cid = c.id;
      const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(cid);
      if (!st) continue;
      if (Number(st.blocked)) continue;
      const d = speedDelays(st.moment_comment_speed || 'normal');
      /* 选择性点赞 */
      if (Math.random() < 0.65) {
        enqueuePending(momentId, cid, 'like', '', [], now + d.likeDelay);
      }
      /* 选择性评论：受「对方会回复评论」开关控制，不受赞影响，可点可不点 */
      if (Number(st.moment_reply_enabled) && Math.random() < 0.55) {
        let body = drawReplyContent(cid);
        if (!body) body = { content: FALLBACK_REPLIES[randInt(0, FALLBACK_REPLIES.length - 1)], images: [] };
        enqueuePending(momentId, cid, 'comment', body.content, body.images, now + d.commentDelay);
      }
    }
  } catch (e) {
    console.error('[reactToMyMoments]', e.message);
  }
}

export { postContactMoment, momentTick, scheduleMomentReplies, reactToMyMoments, flushPendingMoments }
