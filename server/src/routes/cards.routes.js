const express = require('express');
const router = express.Router();
const cardsRepo = require('../repositories/cards.repo');
const { drawCards } = require('../services/cardDraw.service');
const db = require('../db');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

router.get('/cards', (req, res) => {
  try {
    const { scope, contactId, category, groupId, includeBlocked } = req.query;
    const list = cardsRepo.listCards({
      scope: scope || undefined,
      contactId: contactId ? Number(contactId) : undefined,
      category: category || undefined,
      groupId: groupId ? Number(groupId) : undefined,
      includeBlocked: includeBlocked === '1' || includeBlocked === 'true',
    });
    ok(res, list);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/card-groups', (req, res) => {
  try {
    const { scope, contactId, category } = req.query;
    const list = cardsRepo.listGroups({
      scope: scope || undefined,
      contactId: contactId ? Number(contactId) : undefined,
      category: category || undefined,
    });
    ok(res, list);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/card-groups/stats', (req, res) => {
  try {
    ok(res, cardsRepo.statsByScope());
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/card-groups', (req, res) => {
  try {
    const { category, scope, ownerContactId, name, color } = req.body || {};
    if (!category || !name) return fail(res, 'category and name required');
    const g = cardsRepo.createGroup({
      category,
      scope,
      ownerContactId: ownerContactId ? Number(ownerContactId) : null,
      name,
      color,
    });
    ok(res, g);
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/card-groups/:id', (req, res) => {
  try {
    const { name, color, blocked } = req.body || {};
    let g;
    if (name !== undefined || color !== undefined) g = cardsRepo.updateGroup(Number(req.params.id), { name, color });
    if (blocked !== undefined) g = cardsRepo.blockGroup(Number(req.params.id), blocked ? 1 : 0);
    if (!g) g = cardsRepo.updateGroup(Number(req.params.id), {});
    ok(res, g);
  } catch (e) {
    fail(res, e.message);
  }
});

router.delete('/card-groups/:id', (req, res) => {
  try {
    cardsRepo.deleteGroup(Number(req.params.id));
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/cards', (req, res) => {
  try {
    const { groupId, category, content, scope, ownerContactId, asset_path, duration, weight } = req.body || {};
    // groupId 允许为空（归入「未分组」）
    const card = cardsRepo.createCard({
      groupId: groupId != null ? Number(groupId) : null,
      category,
      content,
      scope,
      ownerContactId: ownerContactId != null ? Number(ownerContactId) : null,
      asset_path,
      duration,
      weight,
    });
    ok(res, card);
  } catch (e) {
    fail(res, e.message);
  }
});

// 批量建卡：导入大量字卡时一次请求全部插入（单事务），避免逐条请求过慢
router.post('/cards/batch', (req, res) => {
  try {
    const items = Array.isArray(req.body && req.body.cards) ? req.body.cards : [];
    if (!items.length) return fail(res, 'cards required');
    if (items.length > 20000) return fail(res, '单次最多导入 20000 张');
    ok(res, cardsRepo.createCardsBatch(items));
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/cards/:id', (req, res) => {
  try {
    const card = cardsRepo.updateCard(Number(req.params.id), req.body || {});
    ok(res, card);
  } catch (e) {
    fail(res, e.message);
  }
});

router.delete('/cards/:id', (req, res) => {
  try {
    cardsRepo.deleteCard(Number(req.params.id));
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

// 抽卡预览（不落库）
router.post('/draw/preview', (req, res) => {
  try {
    const { contactId, count } = req.body || {};
    if (!contactId) return fail(res, 'contactId required');
    const result = drawCards(db, Number(contactId), Number(count) || 1);
    ok(res, result);
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
