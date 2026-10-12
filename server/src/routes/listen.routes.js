const router = require('express').Router();
const listen = require('../services/listen.service');
const settingsRepo = require('../repositories/settings.repo');
const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

/* ── 一起听累计时长（分钟）：全局累计，切换联系人/结束会话都不清零 ── */
const LISTEN_KEY = 'listen_minutes';
const readMinutes = () => Number(settingsRepo.getGlobal(LISTEN_KEY)) || 0;
router.get('/minutes', (req, res) => {
  ok(res, { minutes: readMinutes() });
});
router.post('/minutes', (req, res) => {
  const cur = readMinutes();
  const b = req.body || {};
  let v = cur;
  if (b.value !== undefined) v = Math.max(0, Number(b.value) || 0);
  else v = Math.max(0, cur + (Number(b.add) || 0));
  settingsRepo.setGlobal(LISTEN_KEY, v);
  ok(res, { minutes: v });
});

// 我邀请 TA 一起听：{contactId, song:{id,title,artist,cover}}
router.post('/invites', (req, res) => {
  const { contactId, song } = req.body || {};
  if (!contactId) return fail(res, '缺少联系人');
  const r = listen.sendInvite(Number(contactId), song || {});
  if (r.error) return fail(res, r.error);
  ok(res, r);
});

// 我响应 TA 的邀请：{accept: true/false}
router.post('/invites/:id/respond', (req, res) => {
  const accept = !!(req.body && req.body.accept);
  const r = listen.respond(Number(req.params.id), accept);
  if (r.error) return fail(res, r.error);
  ok(res, r);
});

// 我取消自己发出的邀请
router.post('/invites/:id/cancel', (req, res) => {
  const r = listen.cancel(Number(req.params.id));
  if (r.error) return fail(res, r.error);
  ok(res, r);
});

// 结束一起听（任一方）
router.post('/invites/:id/end', (req, res) => {
  const r = listen.end(Number(req.params.id));
  if (r.error) return fail(res, r.error);
  ok(res, r);
});

// 邀请列表（恢复等待/受邀状态用）
router.get('/invites', (req, res) => {
  ok(res, listen.listInvites(req.query.limit));
});

module.exports = router;
