const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../config');
const { createDb } = require('./engine');

const DB_PATH = path.join(DATA_DIR, 'app.db');

const db = createDb(DB_PATH);

function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
}

// 对已有数据库补齐新字段（新增列用 ALTER，避免破坏旧数据）
function migrate() {
  const addCol = (table, col, type) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
    if (!cols.includes(col)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
    }
  };
  addCol('contacts', 'pinned', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'my_name', 'TEXT');
  addCol('contact_settings', 'my_avatar', 'TEXT');
  addCol('contact_settings', 'avatar_shape', 'TEXT DEFAULT \'circle\'');
  addCol('contact_settings', 'avatar_radius', 'INTEGER DEFAULT 12');
  addCol('contact_settings', 'avatar_size', 'INTEGER DEFAULT 36');
  addCol('contact_settings', 'avatar_pos', "TEXT DEFAULT 'bottom'");
  addCol('contact_settings', 'chat_bg', 'TEXT');
  addCol('contact_settings', 'bubble_style', 'TEXT');
  addCol('anniversaries', 'contact_id', 'INTEGER DEFAULT NULL');
  addCol('divinations', 'contact_id', 'INTEGER DEFAULT NULL');
  addCol('contact_desktop', 'love', 'INTEGER DEFAULT 0');
  addCol('contact_desktop', 'play_mode', "TEXT DEFAULT 'list'");
  addCol('contact_desktop', 'sync_chat_avatar', 'INTEGER DEFAULT 0');
  addCol('contact_desktop', 'card_bg_opacity', 'INTEGER DEFAULT 100');
  /* 回复设置：拼字卡（回复时把多张字卡拼成一条消息） */
  addCol('contact_settings', 'reply_merge_enabled', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'reply_merge_min', 'INTEGER DEFAULT 1');
  addCol('contact_settings', 'reply_merge_max', 'INTEGER DEFAULT 3');
  /* 朋友圈评论/回复：可带图片或表情包，可针对某条评论回复 */
  addCol('moment_interactions', 'images', 'TEXT');
  addCol('moment_interactions', 'reply_to', 'INTEGER DEFAULT NULL');
  addCol('anniversaries', 'type', "TEXT DEFAULT 'anniversary'");
  addCol('anniversaries', 'calendar', "TEXT DEFAULT 'solar'");
  addCol('chat_messages', 'author_member_id', 'INTEGER DEFAULT NULL');
  addCol('moments', 'author_contact_id', 'INTEGER DEFAULT NULL');
  addCol('contacts', 'pronoun', "TEXT DEFAULT ''");
  // 联系人设置页：拉黑 / 聊天背景模糊 / 聊天字体 / 已读回执开关与样式（text=已读文字 check=对勾）
  addCol('contact_settings', 'blocked', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'chat_bg_blur', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'chat_font', "TEXT DEFAULT ''");
  addCol('contact_settings', 'chat_font_css', "TEXT DEFAULT ''");
  // 已读后对方不回消息（按概率）开关
  addCol('contact_settings', 'read_no_reply', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'show_read_receipt', 'INTEGER DEFAULT 1');
  addCol('contact_settings', 'read_receipt_style', "TEXT DEFAULT 'text'");
  // 回答问题时长：对方回答「提问」的回复速度（秒），缺省回落 reply_delay
  addCol('contact_settings', 'answer_delay_min', 'INTEGER DEFAULT 1');
  addCol('contact_settings', 'answer_delay_max', 'INTEGER DEFAULT 5');
  addCol('group_member_settings', 'answer_delay_min', 'INTEGER DEFAULT 1');
  addCol('group_member_settings', 'answer_delay_max', 'INTEGER DEFAULT 5');
  // 主动消息：条数范围 + 间隔范围（分钟）
  addCol('contact_settings', 'proactive_count_min', 'INTEGER DEFAULT 1');
  addCol('contact_settings', 'proactive_count_max', 'INTEGER DEFAULT 3');
  addCol('contact_settings', 'proactive_interval_max', 'INTEGER DEFAULT 180');
  // 主动消息调度持久化：上次发出时间（秒）+ 下次可发时间（秒），避免服务重启后立刻补发
  addCol('contact_settings', 'proactive_last_at', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'proactive_next_at', 'INTEGER DEFAULT 0');
  // 朋友圈设置：每天条数范围 + 回评论开关与条数范围
  addCol('contact_settings', 'moment_count_min', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'moment_count_max', 'INTEGER DEFAULT 2');
  addCol('contact_settings', 'moment_reply_enabled', 'INTEGER DEFAULT 1');
  addCol('contact_settings', 'moment_reply_min', 'INTEGER DEFAULT 1');
  addCol('contact_settings', 'moment_reply_max', 'INTEGER DEFAULT 2');
  // 信件设置：每周封数范围
  addCol('contact_settings', 'letter_week_min', 'INTEGER DEFAULT 0');
  addCol('contact_settings', 'letter_week_max', 'INTEGER DEFAULT 1');
  // 信件设置：主动寄信的下次调度时间（秒），NULL/0 表示尚未调度
  addCol('contact_settings', 'letter_next_at', 'INTEGER DEFAULT 0');
  // 聊天里是否显示昵称（群成员昵称等），关闭后气泡旁不显示名字
  addCol('contact_settings', 'show_names', 'INTEGER DEFAULT 1');
  // 聊天消息：撤回标记 + 引用（被引用消息 id 与去规范化摘要）
  addCol('chat_messages', 'recalled', 'INTEGER DEFAULT 0');
  addCol('chat_messages', 'quote_id', 'INTEGER DEFAULT NULL');
  addCol('chat_messages', 'quote_text', 'TEXT DEFAULT \'\'');
  addCol('chat_messages', 'quote_image', 'TEXT DEFAULT \'\'');
  // 通话设置：主动来电开关与概率（接听/拒绝/挂断），以及全局通话概率默认值
  addCol('contact_settings', 'call_enabled', 'INTEGER DEFAULT 0');
  // 主动来电概率 = 每小时触发来电的概率（默认 10%）
  addCol('contact_settings', 'call_incoming_prob', 'INTEGER DEFAULT 10');
  addCol('contact_settings', 'call_answer_prob', 'INTEGER DEFAULT 85');
  addCol('contact_settings', 'call_reject_prob', 'INTEGER DEFAULT 10');
  addCol('contact_settings', 'call_hangup_prob', 'INTEGER DEFAULT 10');
  // 对方小概率撤回消息的开关（内定概率 10%，开关在「主动消息」设置页）
  addCol('contact_settings', 'contact_recall_enabled', 'INTEGER DEFAULT 0');
  // 字卡分组：自定义颜色（新建/编辑分组时选取，未设置则按 id 兜底配色）
  addCol('card_groups', 'color', "TEXT DEFAULT ''");
  // 信件：收藏标记（收藏后在信名旁显示星星）+ 回信关联（指向被回复的原信 id）
  addCol('letters', 'favorite', 'INTEGER DEFAULT 0');
  addCol('letters', 'reply_to', 'INTEGER DEFAULT NULL');
  // 收藏表记录来源信件 id（取消收藏用，避免与聊天消息 id 混用 message_id）
  addCol('favorites', 'letter_id', 'INTEGER DEFAULT NULL');

  // ─── 音乐模块重建 ───
  // 曲库：网易云/酷狗导入、本地音频上传、直链添加
  db.exec(`CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT DEFAULT '',
    cover TEXT DEFAULT '',
    duration INTEGER DEFAULT 0,
    source TEXT DEFAULT 'local',
    source_id TEXT DEFAULT '',
    audio TEXT DEFAULT '',
    plist TEXT DEFAULT '',
    vip INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    created_at INTEGER
  )`);
  // 按联系人的收藏（「我的收藏」「XX的收藏」tab）
  db.exec(`CREATE TABLE IF NOT EXISTS song_favs (
    song_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    created_at INTEGER,
    PRIMARY KEY (song_id, contact_id)
  )`);
  // 桌面音乐设置：自定义唱片封面 / 悬浮播放小框
  addCol('contact_desktop', 'music_vinyl', "TEXT DEFAULT ''");
  addCol('contact_desktop', 'music_floating', 'INTEGER DEFAULT 1');
  /* 自定义歌单名列表（JSON 数组，支持空歌单） */
  addCol('contact_desktop', 'music_playlists', "TEXT DEFAULT '[]'");
  /* 音乐卡背景图 + 透明度 */
  addCol('contact_desktop', 'music_card_bg', "TEXT DEFAULT ''");
  addCol('contact_desktop', 'music_card_bg_op', 'INTEGER DEFAULT 100');

  // 一次性迁移：清空旧音乐设计（app_items 里 module='music' 的「正在听」标记数据）
  const musicReset = db.prepare("SELECT 1 FROM _migrations WHERE key = 'music_rebuild_v1'").get();
  if (!musicReset) {
    try { db.prepare("DELETE FROM app_items WHERE module = 'music'").run(); } catch (e) { /* 表不存在则忽略 */ }
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('music_rebuild_v1')").run();
  }

  // 陪伴邀请：我邀 TA / TA 邀我，状态 pending→accepted/rejected/cancelled/expired。
  // 邀请同时在聊天里落一条 content_type='companion_invite' 的卡片消息（text 存 JSON 元数据）
  db.exec(`CREATE TABLE IF NOT EXISTS companion_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    from_side TEXT NOT NULL DEFAULT 'me',
    activity TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'up',
    duration_sec INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    message_id INTEGER,
    created_at INTEGER
  )`);

  // 一起听歌：我邀 TA / TA 邀我，状态 pending→accepted/rejected/cancelled/ended。
  // 邀请同时在聊天里落一条 content_type='listen_invite' 的卡片消息（text 存 JSON 元数据）
  db.exec(`CREATE TABLE IF NOT EXISTS listen_together (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    from_side TEXT NOT NULL DEFAULT 'me',
    song_id INTEGER DEFAULT 0,
    song_title TEXT DEFAULT '',
    song_artist TEXT DEFAULT '',
    song_cover TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    message_id INTEGER,
    created_at INTEGER
  )`);

  // 一次性迁移：存量联系人「主动消息」从未配置过（proactive_enabled=0），统一默认开启。
  // 用 _migrations 标记表保证只跑一次，之后用户在前端手动关闭的开关不会被重启覆盖。
  db.exec('CREATE TABLE IF NOT EXISTS _migrations(key TEXT PRIMARY KEY)');
  const migrated = db.prepare("SELECT 1 FROM _migrations WHERE key = 'proactive_default_on'").get();
  if (!migrated) {
    db.prepare("UPDATE contact_settings SET proactive_enabled = 1 WHERE proactive_enabled = 0 OR proactive_enabled IS NULL").run();
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('proactive_default_on')").run();
  }

  // 主题色 / 通知开关改回全局，contact_desktop 上遗留的列直接删掉
  const dropCol = (table, col) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
    if (cols.includes(col)) {
      try {
        db.prepare(`ALTER TABLE ${table} DROP COLUMN ${col}`).run();
      } catch (e) {
        /* 老版本 SQLite 不支持 DROP COLUMN，忽略即可 */
      }
    }
  };
  dropCol('contact_desktop', 'theme');
  dropCol('contact_desktop', 'notify_enabled');
}

initSchema();
migrate();

module.exports = db;

