const express = require('express');
const router = express.Router();
const { importMochi } = require('../services/mochi.service');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

/**
 * 导入 mochi 字卡全量备份。
 * body: { json: <解析后的 mochi 对象>, ownerContactId: <number|null> }
 *   ownerContactId 用于绑定 "专属字卡 / 题库 / 情话 / 寻踪"；不传则归通用库。
 */
router.post('/mochi', (req, res) => {
  try {
    const body = req.body || {};
    const json = body.json;
    const ownerContactId = body.ownerContactId != null ? Number(body.ownerContactId) : null;
    if (!json || typeof json !== 'object') return fail(res, '缺少 mochi 备份数据(json)');
    const r = importMochi(json, { ownerContactId });
    ok(res, r);
  } catch (e) {
    fail(res, e.message || '导入失败');
  }
});

module.exports = router;
