const express = require('express');
const router = express.Router();
const settingsRepo = require('../repositories/settings.repo');
const db = require('../db');
const { UPLOAD_DIR } = require('../config');
const fs = require('fs');
const path = require('path');

const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

router.get('/settings', (req, res) => {
  try {
    const rows = settingsRepo.allGlobal();
    const obj = {};
    for (const r of rows) {
      try {
        obj[r.key] = JSON.parse(r.value);
      } catch (e) {
        obj[r.key] = r.value;
      }
    }
    ok(res, obj);
  } catch (e) {
    fail(res, e.message);
  }
});

router.patch('/settings', (req, res) => {
  try {
    const body = req.body || {};
    for (const [k, v] of Object.entries(body)) {
      settingsRepo.setGlobal(k, v);
    }
    const rows = settingsRepo.allGlobal();
    const obj = {};
    for (const r of rows) {
      try {
        obj[r.key] = JSON.parse(r.value);
      } catch (e) {
        obj[r.key] = r.value;
      }
    }
    ok(res, obj);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/badges', (req, res) => {
  try {
    ok(res, settingsRepo.getBadges());
  } catch (e) {
    fail(res, e.message);
  }
});

/* 内存数据：各数据表条数 + 数据库/上传文件占用（设置页「内存数据」二级页用） */
function dirSize(dir) {
  let total = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) total += dirSize(p);
      else total += st.size;
    }
  } catch (e) { /* 目录不存在则按 0 */ }
  return total;
}

router.get('/storage-stats', (req, res) => {
  try {
    const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    const tables = [
      { key: 'contacts', label: '联系人' },
      { key: 'chat_messages', label: '聊天消息' },
      { key: 'letters', label: '信件' },
      { key: 'moments', label: '朋友圈' },
      { key: 'cards', label: '字卡' },
      { key: 'favorites', label: '收藏' },
      { key: 'wallets', label: '钱包' },
      { key: 'anniversaries', label: '纪念日' },
      { key: 'app_items', label: '模块记录' },
      { key: 'divinations', label: '占卜' }
    ].map((t) => ({ ...t, count: count(t.key) }));
    const pageSize = db.pragma('page_size', { simple: true });
    const pageCount = db.pragma('page_count', { simple: true });
    const dbSize = pageSize * pageCount;
    const uploadsSize = dirSize(UPLOAD_DIR);
    ok(res, { tables, dbSize, uploadsSize });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
