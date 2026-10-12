const router = require('express').Router();
const companion = require('../services/companion.service');
const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

// 我邀请 TA：{contactId, activity, mode, durationSec}
router.post('/invites', (req, res) => {
  const { contactId, activity, mode, durationSec } = req.body || {};
  if (!contactId) return fail(res, '缺少联系人');
  const r = companion.sendInvite(Number(contactId), { activity, mode, durationSec });
  if (r.error) return fail(res, r.error);
  ok(res, r);
});

// 我响应 TA 的邀请：{accept: true/false}
router.post('/invites/:id/respond', (req, res) => {
  const accept = !!(req.body && req.body.accept);
  const r = companion.respond(Number(req.params.id), accept);
  if (r.error) return fail(res, r.error);
  ok(res, r);
});

// 我取消自己发出的邀请
router.post('/invites/:id/cancel', (req, res) => {
  const r = companion.cancel(Number(req.params.id));
  if (r.error) return fail(res, r.error);
  ok(res, r);
});

// 邀请列表（恢复等待/受邀状态用）
router.get('/invites', (req, res) => {
  ok(res, companion.listInvites(req.query.limit));
});

module.exports = router;
