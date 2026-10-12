const express = require('express');
const router = express.Router();
const db = require('../db');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

const ALLOWED = [
  'diary', 'memo', 'mood', 'period', 'album', 'music', 'cinema', 'game', 'archive',
];

function parseExtra(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch (e) {
    return {};
  }
}

function shape(row) {
  if (!row) return row;
  return { ...row, extra: parseExtra(row.extra) };
}

// ---------- 列表 ----------
// GET /api/items?module=diary&contactId=1
router.get('/items', (req, res) => {
  try {
    const { module: mod, contactId } = req.query;
    if (!mod || !ALLOWED.includes(mod)) return fail(res, 'unknown module');
    const cid = contactId != null && contactId !== '' ? Number(contactId) : null;
    const rows =
      cid == null
        ? db.prepare('SELECT * FROM app_items WHERE module = ? ORDER BY sort ASC, id DESC').all(mod)
        : db
            .prepare(
              'SELECT * FROM app_items WHERE module = ? AND (contact_id = ? OR contact_id IS NULL) ORDER BY sort ASC, id DESC'
            )
            .all(mod, cid);
    ok(res, rows.map(shape));
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 新建 ----------
router.post('/items', (req, res) => {
  try {
    const b = req.body || {};
    if (!ALLOWED.includes(b.module)) return fail(res, 'unknown module');
    const now = Math.floor(Date.now() / 1000);
    const info = db
      .prepare(
        `INSERT INTO app_items(module, contact_id, title, body, extra, done, sort, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        b.module,
        b.contactId != null && b.contactId !== '' ? Number(b.contactId) : null,
        String(b.title || ''),
        String(b.body || ''),
        JSON.stringify(b.extra || {}),
        b.done ? 1 : 0,
        Number(b.sort || 0),
        now,
        now
      );
    ok(res, shape(db.prepare('SELECT * FROM app_items WHERE id = ?').get(info.lastInsertRowid)));
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 修改 ----------
router.patch('/items/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const sets = [];
    const params = [];
    const map = { title: 'title', body: 'body', done: 'done', sort: 'sort', contactId: 'contact_id' };
    for (const [k, col] of Object.entries(map)) {
      if (b[k] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(col === 'done' ? (b[k] ? 1 : 0) : b[k]);
      }
    }
    if (b.extra !== undefined) {
      sets.push('extra = ?');
      params.push(JSON.stringify(b.extra || {}));
    }
    if (sets.length) {
      sets.push('updated_at = ?');
      params.push(Math.floor(Date.now() / 1000));
      params.push(id);
      db.prepare(`UPDATE app_items SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }
    ok(res, shape(db.prepare('SELECT * FROM app_items WHERE id = ?').get(id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 删除 ----------
router.delete('/items/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM app_items WHERE id = ?').run(Number(req.params.id));
    ok(res, true);
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
