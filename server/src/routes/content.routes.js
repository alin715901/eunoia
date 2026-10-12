const express = require('express');
const router = express.Router();
const db = require('../db');
const momentService = require('../services/moment.service');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

// ---------- 朋友圈 / 动态 ----------
// viewer=当前以"谁的身份"在看（0=我，>0=联系人id），用于隔离点赞/评论状态
router.get('/moments', (req, res) => {
  try {
    const contactId = req.query.contactId ? Number(req.query.contactId) : null;
    const viewer = req.query.viewer === undefined || req.query.viewer === '' ? 0 : Number(req.query.viewer);
    const scope = req.query.scope || (contactId ? 'contact' : 'all');
    /* authorId：只看某个作者的朋友圈（>0=该联系人，0=我），点头像进来看用 */
    const authorId = req.query.authorId === undefined || req.query.authorId === '' || req.query.authorId === null
      ? null
      : Number(req.query.authorId);
    let rows = [];
    if (authorId !== null) {
      rows =
        authorId > 0
          ? db.prepare("SELECT * FROM moments WHERE author='contact' AND author_contact_id=? ORDER BY created_at DESC").all(authorId)
          : db.prepare("SELECT * FROM moments WHERE author='me' ORDER BY created_at DESC").all();
    } else if (scope === 'all') {
      rows = db.prepare('SELECT * FROM moments ORDER BY created_at DESC').all();
    } else {
      rows = db
        .prepare('SELECT * FROM moments WHERE contact_id = ? ORDER BY created_at DESC')
        .all(contactId);
    }
    const likeQ = db.prepare(
      "SELECT 1 FROM moment_interactions WHERE moment_id=? AND contact_id=? AND type='like'"
    );
    /* 评论不再按浏览身份隔离：一条动态下的所有评论/回复都显示 */
    const cmtQ = db.prepare(
      "SELECT * FROM moment_interactions WHERE moment_id=? AND type IN ('comment','reply') ORDER BY created_at ASC"
    );
    /* 点赞人列表（按时间正序），0=我 → 显示「我」 */
    const likeRowsQ = db.prepare(
      "SELECT contact_id FROM moment_interactions WHERE moment_id=? AND type='like' ORDER BY created_at ASC"
    );
    const contactNameQ = db.prepare('SELECT name FROM contacts WHERE id=?');
    const list = rows.map((m) => {
      const mine = likeQ.get(m.id, viewer);
      const likeNames = likeRowsQ.all(m.id).map((r) =>
        r.contact_id ? contactNameQ.get(r.contact_id)?.name || 'TA' : '我'
      );
      return {
        ...m,
        images: m.images ? JSON.parse(m.images) : [],
        likes: likeNames.length,
        likeNames,
        liked: !!mine,
        comments: cmtQ.all(m.id).map((c) => {
          let imgs = [];
          try { imgs = c.images ? JSON.parse(c.images) : []; } catch (e) { imgs = []; }
          if (!Array.isArray(imgs)) imgs = [];
          const replyName =
            c.reply_to === 0
              ? '我'
              : c.reply_to
                ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(c.reply_to)?.name || '')
                : '';
          return {
            ...c,
            images: imgs,
            replyToName: replyName,
            authorName: c.contact_id
              ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(c.contact_id)?.name || 'TA')
              : '我'
          };
        })
      };
    });
    ok(res, list);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/moments', (req, res) => {
  try {
    const { contactId, author, authorContactId, text, images } = req.body || {};
    if (!text && (!images || !images.length)) return fail(res, '内容和图片至少填一项');
    const info = db
      .prepare('INSERT INTO moments(contact_id, author, author_contact_id, text, images, created_at) VALUES(?,?,?,?,?,?)')
      .run(
        contactId ? Number(contactId) : null,
        author || 'me',
        authorContactId ? Number(authorContactId) : null,
        text || '',
        JSON.stringify(images || []),
        Date.now()
      );
    const m = db.prepare('SELECT * FROM moments WHERE id=?').get(info.lastInsertRowid);
    ok(res, { ...m, images: m.images ? JSON.parse(m.images) : [], likes: 0, liked: false, comments: [] });
  } catch (e) {
    fail(res, e.message);
  }
});

// 点赞/取消：按 viewer 隔离，谁看就记谁点的赞
router.post('/moments/:id/like', (req, res) => {
  try {
    const id = Number(req.params.id);
    const viewer = req.body?.viewer === undefined || req.body?.viewer === null ? 0 : Number(req.body.viewer);
    const exists = db
      .prepare("SELECT id FROM moment_interactions WHERE moment_id=? AND contact_id=? AND type='like'")
      .get(id, viewer);
    if (exists) {
      db.prepare("DELETE FROM moment_interactions WHERE moment_id=? AND contact_id=? AND type='like'").run(id, viewer);
    } else {
      db.prepare("INSERT INTO moment_interactions(moment_id, contact_id, type, created_at) VALUES(?,?,'like',?)").run(id, viewer, Date.now());
    }
    const likes = db.prepare("SELECT COUNT(*) c FROM moment_interactions WHERE moment_id=? AND type='like'").get(id).c;
    ok(res, { likes, liked: !exists });
  } catch (e) {
    fail(res, e.message);
  }
});

// 评论/回复：contact_id=viewer 表示是谁说的
router.post('/moments/:id/comments', (req, res) => {
  try {
    const id = Number(req.params.id);
    const viewer = req.body?.viewer === undefined || req.body?.viewer === null ? 0 : Number(req.body.viewer);
    const content = String(req.body?.content || '').trim();
    let images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 9) : [];
    images = images.map((x) => String(x || '')).filter(Boolean);
    /* 回复某条评论：replyTo 是被回复者的 contact_id（0=我） */
    const replyTo =
      req.body?.replyTo === undefined || req.body?.replyTo === null || req.body?.replyTo === ''
        ? null
        : Number(req.body.replyTo);
    if (!content && !images.length) return fail(res, '评论内容不能为空');
    const type = req.body?.type === 'reply' || replyTo !== null ? 'reply' : 'comment';
    const info = db
      .prepare('INSERT INTO moment_interactions(moment_id, contact_id, type, content, images, reply_to, from_card, created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, viewer, type, content, JSON.stringify(images), replyTo, req.body?.fromCard ? 1 : 0, Date.now());
    const row = db.prepare('SELECT * FROM moment_interactions WHERE id=?').get(info.lastInsertRowid);
    const authorName = viewer
      ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(viewer)?.name || 'TA')
      : '我';
    const replyToName = replyTo === 0 ? '我' : replyTo ? (db.prepare('SELECT name FROM contacts WHERE id=?').get(replyTo)?.name || '') : '';
    /* 我评论了对方的动态 → 对方按「朋友圈设置」回评论（内容取他的字卡库） */
    const m = db.prepare('SELECT author, author_contact_id FROM moments WHERE id=?').get(id);
    if (m && m.author === 'contact' && m.author_contact_id && !viewer) {
      momentService.scheduleMomentReplies(id, m.author_contact_id);
    }
    ok(res, { ...row, images, replyToName, authorName });
  } catch (e) {
    fail(res, e.message);
  }
});

// 删除动态（仅限我发的）：连同点赞、评论一并删除
router.delete('/moments/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const m = db.prepare('SELECT * FROM moments WHERE id=?').get(id);
    if (!m) return fail(res, '动态不存在');
    if (m.author !== 'me') return fail(res, '只能删除自己发布的动态');
    db.prepare('DELETE FROM moment_interactions WHERE moment_id=?').run(id);
    db.prepare('DELETE FROM moments WHERE id=?').run(id);
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

router.delete('/moments/comments/:cid', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM moment_interactions WHERE id=?').get(Number(req.params.cid));
    if (!row) return fail(res, '评论不存在');
    /* 只能删自己的评论（contact_id=0 是我） */
    if (Number(row.contact_id) !== 0) return fail(res, '只能删除自己的评论');
    db.prepare('DELETE FROM moment_interactions WHERE id=?').run(row.id);
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 信件 ----------
// 信箱枢纽：每位联系人一格（未读数/封数/最近一封时间）；群聊没有信箱，不参与
router.get('/letters/hub', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT c.id, c.kind, c.name,
        CASE WHEN d.sync_chat_avatar = 1 AND IFNULL(d.partner_avatar, '') != ''
             THEN d.partner_avatar ELSE c.avatar END AS avatar,
        (SELECT COUNT(*) FROM letters l WHERE l.contact_id = c.id) AS total,
        (SELECT COUNT(*) FROM letters l WHERE l.contact_id = c.id AND l.is_read = 0) AS unread,
        (SELECT l.opening FROM letters l WHERE l.contact_id = c.id ORDER BY l.id DESC LIMIT 1) AS lastOpening,
        (SELECT l.created_at FROM letters l WHERE l.contact_id = c.id ORDER BY l.id DESC LIMIT 1) AS lastAt
         FROM contacts c
         LEFT JOIN contact_desktop d ON d.contact_id = c.id
         WHERE c.kind != 'group'
         ORDER BY COALESCE(lastAt, 0) DESC, c.id ASC`
      )
      .all();
    ok(res, rows);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/letters', (req, res) => {
  try {
    const contactId = req.query.contactId ? Number(req.query.contactId) : null;
    const rows = db
      .prepare('SELECT * FROM letters WHERE (? IS NULL OR contact_id = ?) ORDER BY created_at DESC')
      .all(contactId, contactId);
    /* hasReply：这封信是否已被回复（我回的或对方回的）→ 显示「已回复」标识
       replyOrig：这封信回复的原信摘要（展开后可点击跳转查看） */
    const repliedQ = db.prepare('SELECT id FROM letters WHERE reply_to = ? LIMIT 1');
    const origQ = db.prepare('SELECT id, sender, opening, sentences FROM letters WHERE id = ?');
    const parseArr = (s) => { try { return s ? JSON.parse(s) : []; } catch (e) { return []; } };
    const list = rows.map((l) => {
      const hasReply = !!repliedQ.get(l.id);
      let replyOrig = null;
      if (l.reply_to) {
        const o = origQ.get(l.reply_to);
        if (o) {
          const os = parseArr(o.sentences);
          replyOrig = { id: o.id, sender: o.sender, excerpt: os[0] || o.opening || '' };
        }
      }
      return { ...l, sentences: parseArr(l.sentences), hasReply, replyOrig };
    });
    ok(res, list);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/letters', (req, res) => {
  try {
    const { contactId, sender, opening, closing, sentences, replyTo } = req.body || {};
    const arr = Array.isArray(sentences) ? sentences : String(sentences || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const info = db
      .prepare('INSERT INTO letters(contact_id, sender, opening, closing, sentences, reply_to, created_at) VALUES(?,?,?,?,?,?,?)')
      .run(contactId ? Number(contactId) : null, sender || 'me', opening || '', closing || '', JSON.stringify(arr), replyTo ? Number(replyTo) : null, Date.now());
    const l = db.prepare('SELECT * FROM letters WHERE id=?').get(info.lastInsertRowid);
    ok(res, { ...l, sentences: l.sentences ? JSON.parse(l.sentences) : [] });
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/letters/:id/read', (req, res) => {
  try {
    db.prepare('UPDATE letters SET is_read=1 WHERE id=?').run(Number(req.params.id));
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

router.delete('/letters/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM letters WHERE id=?').run(Number(req.params.id));
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/letters/:id/favorite', (req, res) => {
  try {
    const l = db.prepare('SELECT * FROM letters WHERE id=?').get(Number(req.params.id));
    if (!l) return fail(res, '信件不存在');
    /* 收藏/取消收藏：可来回切换 */
    if (l.favorite) {
      db.prepare('UPDATE letters SET favorite = 0 WHERE id = ?').run(l.id);
      db.prepare("DELETE FROM favorites WHERE letter_id = ? AND content_type = 'letter'").run(l.id);
      return ok(res, { favorite: 0 });
    }
    const text = [l.opening, ...(l.sentences ? JSON.parse(l.sentences) : []), l.closing].filter(Boolean).join('\n');
    db.prepare(
      `INSERT INTO favorites(letter_id, contact_id, sender, content_type, text, asset_path, quote_text, quote_image, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`
    ).run(l.id, l.contact_id, l.sender, 'letter', text, null, null, null, Date.now());
    /* 在信件上标记收藏，前端信名旁显示星星 */
    db.prepare('UPDATE letters SET favorite = 1 WHERE id = ?').run(l.id);
    ok(res, { favorite: 1 });
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 占卜记录（可选留存） ----------
router.get('/divinations', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM divinations ORDER BY created_at DESC LIMIT 50').all();
    ok(res, rows);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/divinations', (req, res) => {
  try {
    const { method, spread, drawn, reflection } = req.body || {};
    const info = db
      .prepare('INSERT INTO divinations(method, spread, drawn, reflection, created_at) VALUES(?,?,?,?,?)')
      .run(method || 'tarot', spread || '', JSON.stringify(drawn || []), reflection || '', Date.now());
    ok(res, { id: info.lastInsertRowid });
  } catch (e) {
    fail(res, e.message);
  }
});

// 清空全部占卜记录
router.delete('/divinations', (req, res) => {
  try {
    db.prepare('DELETE FROM divinations').run();
    ok(res, { ok: true });
  } catch (e) {
    fail(res, e.message);
  }
});

// 删除单条占卜记录
router.delete('/divinations/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM divinations WHERE id = ?').run(Number(req.params.id));
    ok(res, { ok: true });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
