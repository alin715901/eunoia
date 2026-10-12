const express = require('express');
const router = express.Router();
const repo = require('../repositories/contacts.repo');
const walletRepo = require('../repositories/wallet.repo');
const upload = require('../middleware/upload');
const { assetUrl } = require('../services/file.service');
const notification = require('../services/notification.service');
const settingsRepo = require('../repositories/settings.repo');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

router.get('/', (req, res) => {
  try {
    ok(res, repo.listContacts());
  } catch (e) {
    fail(res, e.message);
  }
});

// 最近互动（必须注册在 /:id 之前，否则被当成 id）
router.get('/recents', (req, res) => {
  try {
    ok(res, repo.getRecents(Number(req.query.limit) || 10));
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/', (req, res) => {
  try {
    const { name, kind, avatar, memberIds } = req.body || {};
    if (!name) return fail(res, 'name required');
    const c = repo.createContact({ name, kind, avatar, memberIds });
    ok(res, c);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/:id', (req, res) => {
  try {
    const c = repo.getContact(Number(req.params.id));
    if (!c) return fail(res, 'contact not found');
    ok(res, c);
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = repo.updateContact(id, req.body || {});
    // 改了对方备注/昵称：广播让聊天列表、聊天顶部、引用摘要即时同步（不用手动刷新）
    if ((req.body || {}).name !== undefined) {
      notification.broadcast('contact_updated', { contactId: id });
    }
    ok(res, c);
  } catch (e) {
    fail(res, e.message);
  }
});

router.delete('/:id', (req, res) => {
  try {
    repo.deleteContact(Number(req.params.id));
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/:id/settings', (req, res) => {
  try {
    const s = repo.getSettings(Number(req.params.id));
    if (!s) return fail(res, 'settings not found');
    ok(res, s);
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/:id/settings', (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    // 通话概率联动：接听 + 拒听 合计 100%（只改其一时另一个自动补齐）
    if (body.call_answer_prob != null && body.call_reject_prob == null) {
      body.call_reject_prob = 100 - Number(body.call_answer_prob || 0);
    } else if (body.call_reject_prob != null && body.call_answer_prob == null) {
      body.call_answer_prob = 100 - Number(body.call_reject_prob || 0);
    }
    const id = Number(req.params.id);
    const s = repo.updateSettings(id, body);
    // 改了我的备注：服务端已重算历史引用摘要，广播让客户端即时 reload 显示新前缀
    if (body.my_name !== undefined) {
      notification.broadcast('contact_updated', { contactId: id });
    }
    ok(res, s);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/:id/read', (req, res) => {
  try {
    repo.markReadAll(Number(req.params.id));
    // 标记已读后广播最新角标，保证全局/列表红点即时更新
    notification.broadcast('badge_update', settingsRepo.getBadges());
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

// 红包钱包：我的余额 + 对方余额（仅单人联系人）
router.get('/:id/wallet', (req, res) => {
  try {
    ok(res, walletRepo.getWallet(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/:id/members', (req, res) => {
  try {
    ok(res, repo.listMembers(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

// 群成员增删（建群时可用 memberIds，之后用这两个接口维护；支持批量：传 contactIds 数组一次添加多人）
router.post('/:id/members', (req, res) => {
  try {
    const gid = Number(req.params.id);
    const ids = req.body?.contactIds;
    if (Array.isArray(ids) && ids.length) {
      const added = [];
      for (const raw of ids) {
        const cid = Number(raw);
        if (cid) added.push(repo.addMember(gid, cid));
      }
      return ok(res, added);
    }
    const memberId = Number(req.body?.contactId || req.body?.memberId);
    if (!memberId) return fail(res, 'contactId required');
    ok(res, repo.addMember(gid, memberId));
  } catch (e) {
    fail(res, e.message);
  }
});

router.delete('/:id/members/:memberId', (req, res) => {
  try {
    repo.removeMember(Number(req.params.id), Number(req.params.memberId));
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

// 群成员的独立回复/主动消息规则
router.get('/:id/members/settings', (req, res) => {
  try {
    ok(res, repo.getMemberSettings(Number(req.params.id)));
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/:id/members/:memberId/settings', (req, res) => {
  try {
    const s = repo.upsertMemberSettings(
      Number(req.params.id),
      Number(req.params.memberId),
      req.body || {}
    );
    ok(res, s);
  } catch (e) {
    fail(res, e.message);
  }
});

router.delete('/:id/members/:memberId/settings', (req, res) => {
  try {
    repo.resetMemberSettings(Number(req.params.id), Number(req.params.memberId));
    ok(res, null);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/:id/avatar', upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return fail(res, 'no file');
    const sub = require('../services/file.service').chooseSubdir(req.file.mimetype);
    const rel = assetUrl(req.file.filename, sub);
    repo.updateContact(Number(req.params.id), { avatar: rel });
    ok(res, { avatar: rel });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
