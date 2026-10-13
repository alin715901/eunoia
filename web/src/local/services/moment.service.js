// 朋友圈：联系人主动发动态（按联系人的「朋友圈设置」调度，内容取该联系人的字卡库）
import db from '../db'
import { drawCards } from './cardDraw.service'
import * as notification from './notification.service'

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
    avatar: c.avatar || ''
  });
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
    avatar: c?.avatar || ''
  });
  return info.lastInsertRowid;
}

/* 我评论了对方的动态后，TA 按设置回复：抽 1~3 张字卡凑一条；有小概率不回复 */
function scheduleMomentReplies(momentId, contactId) {
  try {
    if (!contactId) return;
    const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(contactId);
    if (!st || !Number(st.moment_reply_enabled)) return;
    if (Number(st.blocked)) return;
    /* 小概率不回复（约 20%） */
    if (Math.random() < 0.2) return;
    setTimeout(() => {
      try {
        const body = drawReplyContent(contactId);
        if (!body) return;
        /* 回复的是「我」的评论 → 显示成「TA 回复 我：…」 */
        insertComment(momentId, contactId, body, 'reply', 0);
      } catch (err) {
        /* ignore */
      }
    }, (2 + Math.random() * 4) * 1000);
  } catch (e) {
    console.error('[scheduleMomentReplies]', e.message);
  }
}

/* 对方在我的朋友圈下评论（不会去其他联系人的动态下评论） */
const COMMENT_GAP = 8 * 60 * 60 * 1000;
function momentCommentTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Date.now();
    for (const c of rows) {
      const cid = c.id;
      const st = db.prepare('SELECT * FROM contact_settings WHERE contact_id = ?').get(cid);
      if (!st || !Number(st.moment_reply_enabled)) continue;
      if (Number(st.blocked)) continue;
      /* 我发的动态里挑一条最近的（只看我的，不碰其他联系人的） */
      const mine = db
        .prepare("SELECT id FROM moments WHERE author='me' ORDER BY created_at DESC LIMIT 3")
        .all();
      if (!mine.length) continue;
      const last = db
        .prepare(
          "SELECT MAX(created_at) t FROM moment_interactions WHERE contact_id=? AND type='comment'"
        )
        .get(cid);
      if (Number(last?.t || 0) && now - Number(last.t) < COMMENT_GAP) continue;
      /* 到点了也有小概率不评论（约 30%） */
      if (Math.random() < 0.3) continue;
      const target = mine[Math.floor(Math.random() * mine.length)];
      const body = drawReplyContent(cid);
      if (!body) continue;
      insertComment(target.id, cid, body, 'comment');
    }
  } catch (e) {
    console.error('[momentCommentTick]', e.message);
  }
}

export { postContactMoment, momentTick, momentCommentTick, scheduleMomentReplies }
