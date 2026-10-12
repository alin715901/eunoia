const express = require('express');
const router = express.Router();
const repo = require('../repositories/desktop.repo');
const notification = require('../services/notification.service');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

router.get('/:id/desktop', (req, res) => {
  try {
    ok(res, repo.getDesktop(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/:id/desktop', (req, res) => {
  try {
    const id = Number(req.params.id);
    const d = repo.updateDesktop(id, req.body || {});
    // 人物卡里的名字（我的备注/TA 的名字）变更：同步到聊天里的引用摘要等显示
    const b = req.body || {};
    if (b.my_name !== undefined || b.partner_name !== undefined) {
      notification.broadcast('contact_updated', { contactId: id });
    }
    ok(res, d);
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
