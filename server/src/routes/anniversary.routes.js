const express = require('express');
const router = express.Router();
const db = require('../db');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

/** 计算某纪念日的"已过天数"与"距下次发生的天数" */
function decorate(a) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const start = new Date(`${a.date}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return { ...a, days_passed: null, days_until: null };
  }
  // 已过天数（起始日算第 1 天）
  const daysPassed = Math.floor((today.setHours(0, 0, 0, 0) - start.getTime()) / 86400000) + 1;

  let daysUntil = null;
  if (a.repeat_yearly) {
    // 下一个周年日
    const now = new Date();
    let next = new Date(now.getFullYear(), start.getMonth(), start.getDate());
    if (next.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      next = new Date(now.getFullYear() + 1, start.getMonth(), start.getDate());
    }
    daysUntil = Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  }
  return { ...a, days_passed: daysPassed >= 0 ? daysPassed : 0, days_until: daysUntil, today: todayStr };
}

// ---------- 纪念日列表 ----------
// 支持 ?contactId=：返回「该联系人专属 + 通用(NULL)」两类
router.get('/anniversaries', (req, res) => {
  try {
    const cid = req.query.contactId != null && req.query.contactId !== '' ? Number(req.query.contactId) : null;
    let rows;
    if (cid != null) {
      rows = db
        .prepare(
          'SELECT * FROM anniversaries WHERE contact_id = ? OR contact_id IS NULL ORDER BY date ASC'
        )
        .all(cid);
    } else {
      rows = db.prepare('SELECT * FROM anniversaries ORDER BY date ASC').all();
    }
    ok(res, rows.map(decorate));
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 新建纪念日 ----------
router.post('/anniversaries', (req, res) => {
  try {
    const { title, date, icon, repeat_yearly, note, contactId, type, calendar } = req.body || {};
    if (!title || !title.trim()) return fail(res, '请填写纪念日名称');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, '日期格式应为 YYYY-MM-DD');
    const annType = type === 'countdown' ? 'countdown' : 'anniversary';
    const annCal = calendar === 'lunar' ? 'lunar' : 'solar';
    const info = db
      .prepare(
        'INSERT INTO anniversaries(contact_id, title, date, icon, repeat_yearly, type, calendar, note, created_at) VALUES(?,?,?,?,?,?,?,?,?)'
      )
      .run(
        contactId != null ? Number(contactId) : null,
        title.trim(),
        date,
        icon || 'calendar',
        repeat_yearly === false || repeat_yearly === 0 ? 0 : 1,
        annType,
        annCal,
        note || '',
        Date.now()
      );
    const row = db.prepare('SELECT * FROM anniversaries WHERE id=?').get(info.lastInsertRowid);
    ok(res, decorate(row));
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 更新纪念日 ----------
router.patch('/anniversaries/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM anniversaries WHERE id=?').get(id);
    if (!cur) return fail(res, '纪念日不存在');
    const { title, date, icon, repeat_yearly, note, type, calendar } = req.body || {};
    db.prepare('UPDATE anniversaries SET title=?, date=?, icon=?, repeat_yearly=?, type=?, calendar=?, note=? WHERE id=?').run(
      title != null ? title : cur.title,
      date != null ? date : cur.date,
      icon != null ? icon : cur.icon,
      repeat_yearly != null ? (repeat_yearly ? 1 : 0) : cur.repeat_yearly,
      type != null ? (type === 'countdown' ? 'countdown' : 'anniversary') : cur.type,
      calendar != null ? (calendar === 'lunar' ? 'lunar' : 'solar') : cur.calendar,
      note != null ? note : cur.note,
      id
    );
    ok(res, decorate(db.prepare('SELECT * FROM anniversaries WHERE id=?').get(id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// ---------- 删除纪念日 ----------
router.delete('/anniversaries/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM anniversaries WHERE id=?').run(id);
    ok(res, { id });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;