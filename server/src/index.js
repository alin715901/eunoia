const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const db = require('./db');
const runSeed = require('./db/seed');
const notification = require('./services/notification.service');

const contactsRoutes = require('./routes/contacts.routes');
const desktopRoutes = require('./routes/desktop.routes');
const chatRoutes = require('./routes/chat.routes');
const cardsRoutes = require('./routes/cards.routes');
const settingsRoutes = require('./routes/settings.routes');
const streamRoutes = require('./routes/stream.routes');
const uploadRoutes = require('./routes/upload.routes');
const contentRoutes = require('./routes/content.routes');
const anniversaryRoutes = require('./routes/anniversary.routes');
const itemsRoutes = require('./routes/items.routes');
const importRoutes = require('./routes/import.routes');

const { errorHandler, apiNotFound } = require('./middleware/error');
const cron = require('./scheduler/cron');
const worker = require('./scheduler/worker');
const chatService = require('./services/chat.service');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 静态资源：上传文件
app.use(config.ASSET_BASE, express.static(config.UPLOAD_DIR));

// API 路由
app.use('/api/contacts', contactsRoutes);
app.use('/api/contacts', desktopRoutes);
app.use('/api', chatRoutes);
app.use('/api', cardsRoutes);
app.use('/api', settingsRoutes);
app.use('/api', streamRoutes);
app.use('/api', uploadRoutes);
app.use('/api', contentRoutes);
app.use('/api', anniversaryRoutes);
app.use('/api', itemsRoutes);
app.use('/api/companion', require('./routes/companion.routes'));
app.use('/api/listen', require('./routes/listen.routes'));
app.use('/api/import', importRoutes);
app.use('/api', require('./routes/music.routes'));

// 前端构建产物（SPA）托管：仅在存在时启用
const dist = path.resolve(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  // index.html 不缓存：发新版后手机能立刻拿到新 bundle，避免美化/设置改动「不生效」
  const noCacheHtml = {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  };
  app.use(express.static(dist, noCacheHtml));
  // 构建版本号：前端每隔一段时间拉取，发现新版本部署就自动刷新，
  // 解决微信内置浏览器缓存旧 bundle 导致「设置改了不生效」的问题
  app.get('/api/version', (req, res) => {
    let v = null;
    try {
      const f = path.join(dist, 'version.json');
      if (fs.existsSync(f)) v = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { /* ignore */ }
    if (!v) v = { v: String(process.env.APP_VERSION || 'dev'), ts: new Date().toISOString() };
    res.json(v);
  });
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ code: 1, msg: 'Not found' });
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// 未匹配 API 返回 JSON
app.use(apiNotFound);
app.use(errorHandler);

// 启动时自动建表 + 种子
runSeed(db);

// 启动调度器（P1 占位）
cron.start();
worker.start();

/* 主动来电调度：开启「对方主动来电」的联系人，每 1 小时按概率发起来电邀请（SSE call_invite）。
   概率即"每小时的触发概率"（call_incoming_prob，默认 10%）；命中后前端弹出"对方来电"界面（可接听/拒绝）。
   群聊：由代码按概率从群成员中随机选定一位作为发起人，发起群聊通话，来电提示为"群聊来电"。
   与用户手动拨出的通话共用全局通话组件。 */
setInterval(() => {
  try {
    // 单人联系人来电
    const rows = db
      .prepare(
        `SELECT cs.contact_id, cs.call_incoming_prob
         FROM contact_settings cs
         JOIN contacts c ON c.id = cs.contact_id
         WHERE c.kind != 'group' AND cs.call_enabled = 1 AND IFNULL(cs.blocked, 0) = 0`
      )
      .all();
    for (const r of rows) {
      if (Math.random() * 100 < Number(r.call_incoming_prob || 0)) {
        const c = db.prepare('SELECT name, avatar FROM contacts WHERE id = ?').get(r.contact_id);
        const desk = db
          .prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?')
          .get(r.contact_id);
        let avatar = c?.avatar || '';
        if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar;
        notification.broadcast('call_invite', {
          contactId: r.contact_id,
          name: c?.name || '对方',
          avatar
        });
      }
    }
    // 群聊：由代码按概率从群成员中随机选定一位作为发起人，发起群聊通话（群聊默认开启主动来电）
    const groups = db.prepare("SELECT id, name FROM contacts WHERE kind = 'group'").all();
    for (const g of groups) {
      const gs = db.prepare('SELECT call_enabled, call_incoming_prob FROM contact_settings WHERE contact_id = ?').get(g.id);
      const enabled = gs ? Number(gs.call_enabled) : 1;
      const prob = gs ? Number(gs.call_incoming_prob || 10) : 10;
      if (!enabled || Math.random() * 100 >= prob) continue;
      const members = db
        .prepare(
          `SELECT m.id, m.name, m.avatar FROM contact_members cm
           JOIN contacts m ON m.id = cm.member_id WHERE cm.group_id = ?`
        )
        .all(g.id);
      if (!members.length) continue;
      const mem = members[Math.floor(Math.random() * members.length)];
      notification.broadcast('call_invite', {
        groupId: g.id,
        contactId: mem.id,
        name: g.name,
        memberName: mem.name,
        avatar: mem.avatar || '',
        isGroup: true
      });
    }
  } catch (e) {
    /* ignore */
  }
}, 60 * 60 * 1000); // 每小时一轮：下面的概率就是"每小时触发来电"的概率

/* 红包调度：对方钱包随机自动增资（数额不限），并按概率给我发红包。
   每分钟一轮：从未给我发过红包的联系人高概率尽快演示；发过的低频持续。 */
setInterval(() => {
  try {
    chatService.redpacketTick();
  } catch (e) {
    /* ignore */
  }
}, 60 * 1000);

app.listen(config.PORT, () => {
  console.log(`Server: http://localhost:${config.PORT}`);
  console.log('API: /api');
});
