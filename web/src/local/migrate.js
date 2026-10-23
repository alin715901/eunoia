/* 本地版 migrate：与 server/src/db/index.js 的 migrate() 一致。
 * schema.sql 是初始结构，后续新增的表/列都在这里补齐（全新库也会完整跑一遍）。
 * 注意：原代码在全新库上先 SELECT _migrations 再建表有顺序缺陷，这里先把 _migrations 建好。
 */
import db from './db'

export function migrate() {
  const addCol = (table, col, type) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name)
    if (!cols.includes(col)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run()
    }
  }

  addCol('contacts', 'pinned', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'my_name', 'TEXT')
  addCol('contact_settings', 'my_avatar', 'TEXT')
  addCol('contact_settings', 'avatar_shape', "TEXT DEFAULT 'circle'")
  addCol('contact_settings', 'avatar_radius', 'INTEGER DEFAULT 12')
  addCol('contact_settings', 'avatar_size', 'INTEGER DEFAULT 36')
  addCol('contact_settings', 'avatar_pos', "TEXT DEFAULT 'bottom'")
  addCol('contact_settings', 'chat_bg', 'TEXT')
  addCol('contact_settings', 'bubble_style', 'TEXT')
  addCol('anniversaries', 'contact_id', 'INTEGER DEFAULT NULL')
  addCol('divinations', 'contact_id', 'INTEGER DEFAULT NULL')
  addCol('contact_desktop', 'love', 'INTEGER DEFAULT 0')
  addCol('contact_desktop', 'play_mode', "TEXT DEFAULT 'list'")
  addCol('contact_desktop', 'sync_chat_avatar', 'INTEGER DEFAULT 0')
  addCol('contact_desktop', 'card_bg_opacity', 'INTEGER DEFAULT 100')
  /* 回复设置：拼字卡（回复时把多张字卡拼成一条消息） */
  addCol('contact_settings', 'reply_merge_enabled', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'reply_merge_min', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'reply_merge_max', 'INTEGER DEFAULT 3')
  /* 朋友圈评论/回复：可带图片或表情包，可针对某条评论回复 */
  addCol('moment_interactions', 'images', 'TEXT')
  addCol('moment_interactions', 'reply_to', 'INTEGER DEFAULT NULL')
  addCol('anniversaries', 'type', "TEXT DEFAULT 'anniversary'")
  addCol('anniversaries', 'calendar', "TEXT DEFAULT 'solar'")
  addCol('chat_messages', 'author_member_id', 'INTEGER DEFAULT NULL')
  addCol('moments', 'author_contact_id', 'INTEGER DEFAULT NULL')
  addCol('contacts', 'pronoun', "TEXT DEFAULT ''")
  // 联系人设置页：拉黑 / 聊天背景模糊 / 聊天字体 / 已读回执开关与样式
  addCol('contact_settings', 'blocked', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'chat_bg_blur', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'chat_font', "TEXT DEFAULT ''")
  addCol('contact_settings', 'chat_font_css', "TEXT DEFAULT ''")
  // 已读后对方不回消息（按概率）开关
  addCol('contact_settings', 'read_no_reply', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'show_read_receipt', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'read_receipt_style', "TEXT DEFAULT 'text'")
  // 回答问题时长
  addCol('contact_settings', 'answer_delay_min', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'answer_delay_max', 'INTEGER DEFAULT 5')
  addCol('group_member_settings', 'answer_delay_min', 'INTEGER DEFAULT 1')
  addCol('group_member_settings', 'answer_delay_max', 'INTEGER DEFAULT 5')
  // 主动消息：条数范围 + 间隔范围（分钟）
  addCol('contact_settings', 'proactive_count_min', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'proactive_count_max', 'INTEGER DEFAULT 3')
  addCol('contact_settings', 'proactive_interval_max', 'INTEGER DEFAULT 180')
  // 朋友圈「评论速度」：对方给我朋友圈点赞/评论/回复的快慢
  addCol('contact_settings', 'moment_comment_speed', "TEXT DEFAULT 'normal'")
  // 主动消息调度持久化
  addCol('contact_settings', 'proactive_last_at', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'proactive_next_at', 'INTEGER DEFAULT 0')
  // 朋友圈设置
  addCol('contact_settings', 'moment_count_min', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'moment_count_max', 'INTEGER DEFAULT 2')
  addCol('contact_settings', 'moment_reply_enabled', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'moment_reply_min', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'moment_reply_max', 'INTEGER DEFAULT 2')
  // 信件设置：每周封数范围 + 主动寄信调度时间
  addCol('contact_settings', 'letter_week_min', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'letter_week_max', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'letter_next_at', 'INTEGER DEFAULT 0')
  // 聊天里是否显示昵称
  addCol('contact_settings', 'show_names', 'INTEGER DEFAULT 1')
  // 聊天消息：撤回标记 + 引用
  addCol('chat_messages', 'recalled', 'INTEGER DEFAULT 0')
  addCol('chat_messages', 'quote_id', 'INTEGER DEFAULT NULL')
  addCol('chat_messages', 'quote_text', "TEXT DEFAULT ''")
  addCol('chat_messages', 'quote_image', "TEXT DEFAULT ''")
  // MiniMax 生成的语音消息标记（'mm'）：前端据此默认显示转写文字 + 伪语音播放
  addCol('chat_messages', 'voice_src', "TEXT DEFAULT ''")
  // 经期特殊关怀：开关 + 最近一次关怀日期（按自然日去重，避免同一天反复发）
  addCol('contact_settings', 'period_care_enabled', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'period_care_last_date', "TEXT DEFAULT ''")
  // 通话设置
  addCol('contact_settings', 'call_enabled', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'call_incoming_prob', 'INTEGER DEFAULT 10')
  addCol('contact_settings', 'call_answer_prob', 'INTEGER DEFAULT 85')
  addCol('contact_settings', 'call_reject_prob', 'INTEGER DEFAULT 10')
  addCol('contact_settings', 'call_hangup_prob', 'INTEGER DEFAULT 10')
  // 对方小概率撤回消息的开关
  addCol('contact_settings', 'contact_recall_enabled', 'INTEGER DEFAULT 0')
  // 字卡分组：自定义颜色
  addCol('card_groups', 'color', "TEXT DEFAULT ''")
  // 信件：收藏标记 + 回信关联
  addCol('letters', 'favorite', 'INTEGER DEFAULT 0')
  addCol('letters', 'reply_to', 'INTEGER DEFAULT NULL')
  // 信件：我寄出的信，对方回信的截止时刻（ms）；到点由 letterTick 的 replyTick 生成回信
  addCol('letters', 'reply_due_at', 'INTEGER DEFAULT NULL')
  // 收藏表记录来源信件 id
  addCol('favorites', 'letter_id', 'INTEGER DEFAULT NULL')

  // ─── 音乐模块 ───
  db.exec(`CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT DEFAULT '',
    cover TEXT DEFAULT '',
    lyric TEXT DEFAULT '',
    duration INTEGER DEFAULT 0,
    source TEXT DEFAULT 'local',
    source_id TEXT DEFAULT '',
    audio TEXT DEFAULT '',
    plist TEXT DEFAULT '',
    vip INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    created_at INTEGER
  )`)
  // 歌词本地缓存（导入/首次打开歌词页时抓取入库，之后离线可用）
  addCol('songs', 'lyric', "TEXT DEFAULT ''")
  db.exec(`CREATE TABLE IF NOT EXISTS song_favs (
    song_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    created_at INTEGER,
    PRIMARY KEY (song_id, contact_id)
  )`)
  addCol('contact_desktop', 'music_vinyl', "TEXT DEFAULT ''")
  addCol('contact_desktop', 'music_floating', 'INTEGER DEFAULT 1')
  addCol('contact_desktop', 'music_playlists', "TEXT DEFAULT '[]'")
  addCol('contact_desktop', 'music_card_bg', "TEXT DEFAULT ''")
  addCol('contact_desktop', 'music_card_bg_op', 'INTEGER DEFAULT 100')

  // ─── 陪伴邀请 / 一起听歌 ───
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
  )`)
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
  )`)
  // 群红包领取记录（每人限领一份，唯一索引保证）
  db.exec(`CREATE TABLE IF NOT EXISTS red_packet_grabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    grabber TEXT NOT NULL,
    amount REAL DEFAULT 0,
    created_at INTEGER,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
  )`)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_rpg_msg_grabber ON red_packet_grabs(message_id, grabber)')
  // 一起观影：我邀请联系人一起看某部影片 / TA 邀我。邀请落 cinema_together 表，
  // 并在聊天里落一条 content_type='cinema_invite' 的卡片消息。
  db.exec(`CREATE TABLE IF NOT EXISTS cinema_together (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    from_side TEXT NOT NULL DEFAULT 'me',
    film_title TEXT DEFAULT '',
    film_url TEXT DEFAULT '',
    play_src TEXT DEFAULT '',
    play_kind TEXT DEFAULT 'iframe',
    status TEXT NOT NULL DEFAULT 'pending',
    message_id INTEGER,
    created_at INTEGER
  )`)
  // 游戏邀请：我邀请联系人一起玩某款小游戏 / TA 邀我。邀请落 game_invites 表，
  // 并在聊天里落一条 content_type='game_invite' 的卡片消息。
  db.exec(`CREATE TABLE IF NOT EXISTS game_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    from_side TEXT NOT NULL DEFAULT 'me',
    game_kind TEXT NOT NULL DEFAULT 'memory',
    status TEXT NOT NULL DEFAULT 'pending',
    message_id INTEGER,
    created_at INTEGER
  )`)

  // 一次性迁移标记表
  db.exec('CREATE TABLE IF NOT EXISTS _migrations(key TEXT PRIMARY KEY)')

  // ─── 拍一拍独立成库 ───
  db.exec(`CREATE TABLE IF NOT EXISTS poke_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    weight REAL DEFAULT 1,
    blocked INTEGER DEFAULT 0,
    created_at INTEGER
  )`)
  // 一次性迁移：把历史 cards 表里 category='poke' 的字卡搬到独立的 poke_library，
  // 让「拍一拍库」与「字卡库」彻底分开（保留用户已有的拍一拍短语）。
  const pokeMig = db.prepare("SELECT 1 FROM _migrations WHERE key = 'poke_separate_v1'").get()
  if (!pokeMig) {
    db.exec(
      `INSERT INTO poke_library(content, weight, created_at)
       SELECT content, COALESCE(weight, 1), COALESCE(created_at, CAST(strftime('%s','now') AS INTEGER))
       FROM cards WHERE category = 'poke'`
    )
    db.exec("DELETE FROM cards WHERE category = 'poke'")
    db.exec("DELETE FROM card_groups WHERE category = 'poke' AND id NOT IN (SELECT group_id FROM cards WHERE group_id IS NOT NULL)")
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('poke_separate_v1')").run()
  }

  // 一次性迁移：撤掉双击拍一拍功能早期自动播种的 5 条默认短语（脑袋/肩膀/头/脸/手），
  // 「我」的拍一拍库此后由用户自行添加、初始为空。
  // 注意：只清这批播种默认值——字卡库拍一拍专区（category='poke'）是用户自己的数据，
  // 当年被误并进 poke_library，由下面的 poke_split_v2 原样迁回，绝不清用户数据。
  const pokeWipe = db.prepare("SELECT 1 FROM _migrations WHERE key = 'poke_wipe_v1'").get()
  if (!pokeWipe) {
    db.exec("DELETE FROM poke_library WHERE content IN ('脑袋','肩膀','头','脸','手')")
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('poke_wipe_v1')").run()
  }

  // 一次性迁移：拍一拍一分为二（修正早期把两个库合并的误操作）
  //   字卡库 category='poke' 专区 = 「对方」拍我用的（有分组，走 cards 表，恢复原状）
  //   poke_library            = 「我」的拍一拍库（聊天双击头像弹窗用，无分组）
  // 早期版本曾把字卡库的拍一拍并入 poke_library 并清空；这里把其后用户在拍一拍库里
  // 添加的条目迁回字卡库（category='poke'，归入未分组），再把「我」的库清空，
  // 两个库从此各走各的表、互不相通。
  const pokeSplit = db.prepare("SELECT 1 FROM _migrations WHERE key = 'poke_split_v2'").get()
  if (!pokeSplit) {
    db.exec(
      `INSERT INTO cards(scope, owner_contact_id, group_id, category, content, asset_path, duration, weight, blocked, created_at)
       SELECT 'general', NULL, NULL, 'poke', content, NULL, NULL, COALESCE(weight, 1), COALESCE(blocked, 0), COALESCE(created_at, CAST(strftime('%s','now') AS INTEGER))
       FROM poke_library`
    )
    db.exec('DELETE FROM poke_library')
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('poke_split_v2')").run()
  }

  // 一次性迁移：清空旧音乐设计（app_items 里 module='music' 的「正在听」标记数据）
  const musicReset = db.prepare("SELECT 1 FROM _migrations WHERE key = 'music_rebuild_v1'").get()
  if (!musicReset) {
    try { db.prepare("DELETE FROM app_items WHERE module = 'music'").run() } catch (e) { /* 表不存在则忽略 */ }
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('music_rebuild_v1')").run()
  }

  // 一次性迁移：默契翻牌改为单人计时局后，旧版纪录（title='best' 存 {steps, seconds}）
  // 并入新的 best_<kind> 纪录体系（title='best_memory' 存 {value: 最少步数}）
  const memRec = db.prepare("SELECT 1 FROM _migrations WHERE key = 'game_record_memory_v1'").get()
  if (!memRec) {
    const old = db.prepare("SELECT id, extra FROM app_items WHERE module = 'game' AND title = 'best'").get()
    if (old) {
      let steps = 0
      try { steps = Number(JSON.parse(old.extra || '{}').steps) || 0 } catch (e) { /* ignore */ }
      if (steps > 0) {
        db.prepare(
          "INSERT OR IGNORE INTO app_items(module, title, extra, created_at) VALUES('game', 'best_memory', ?, ?)"
        ).run(JSON.stringify({ value: steps }), Math.floor(Date.now() / 1000))
      }
      db.prepare('DELETE FROM app_items WHERE id = ?').run(old.id)
    }
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('game_record_memory_v1')").run()
  }

  // 一次性迁移：存量联系人「主动消息」默认开启
  const migrated = db.prepare("SELECT 1 FROM _migrations WHERE key = 'proactive_default_on'").get()
  if (!migrated) {
    db.prepare('UPDATE contact_settings SET proactive_enabled = 1 WHERE proactive_enabled = 0 OR proactive_enabled IS NULL').run()
    db.prepare("INSERT OR IGNORE INTO _migrations(key) VALUES('proactive_default_on')").run()
  }

  // 主题色 / 通知开关改回全局，contact_desktop 上遗留的列直接删掉
  const dropCol = (table, col) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name)
    if (cols.includes(col)) {
      try {
        db.prepare(`ALTER TABLE ${table} DROP COLUMN ${col}`).run()
      } catch (e) {
        /* 老版本 SQLite 不支持 DROP COLUMN，忽略即可 */
      }
    }
  }
  dropCol('contact_desktop', 'theme')
  dropCol('contact_desktop', 'notify_enabled')

  // ─── 相册：照片墙 ───
  db.exec(`CREATE TABLE IF NOT EXISTS photo_walls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover TEXT DEFAULT '',
    page_count INTEGER DEFAULT 1,
    width INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS photo_wall_elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wall_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    scale REAL DEFAULT 1,
    rotation REAL DEFAULT 0,
    z INTEGER DEFAULT 0,
    content TEXT DEFAULT '',
    created_at INTEGER,
    FOREIGN KEY (wall_id) REFERENCES photo_walls(id) ON DELETE CASCADE
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pwe_wall ON photo_wall_elements(wall_id)`)
  // ─── 电子手账重构：底纸 / 字体 / 相框 ───
  addCol('photo_walls', 'bg', "TEXT DEFAULT 'cream'")
  addCol('photo_wall_elements', 'font', "TEXT DEFAULT ''")
  addCol('photo_wall_elements', 'frame', "TEXT DEFAULT ''")
  // 四边拉伸：横向/纵向拉伸系数（1=不拉伸；选中框四边箭头拖动调整）
  addCol('photo_wall_elements', 'stretch_x', 'REAL DEFAULT 1')
  addCol('photo_wall_elements', 'stretch_y', 'REAL DEFAULT 1')
  // 文字样式：字号 / 粗细 / 颜色 / 倾斜（「字号」分类里设置；空串/默认值回退内置样式）
  addCol('photo_wall_elements', 'font_size', 'REAL DEFAULT 18')
  addCol('photo_wall_elements', 'font_weight', 'INTEGER DEFAULT 400')
  addCol('photo_wall_elements', 'color', "TEXT DEFAULT ''")
  addCol('photo_wall_elements', 'italic', 'INTEGER DEFAULT 0')
  // 元素锁定：锁定后不可拖动/拉伸/旋转/编辑/删除（只能选中后解锁）
  addCol('photo_wall_elements', 'locked', 'INTEGER DEFAULT 0')
  // 相册列表编辑弹窗可手动换封面：cover_manual=1 时钉住用户选的封面，
  // 装饰保存不再用「最靠左图片」自动覆盖（移除封面后恢复自动）
  addCol('photo_walls', 'cover_manual', 'INTEGER DEFAULT 0')
  // 「其他设置」概率：听歌邀请 / 听歌收藏 / 游戏邀请 / 观影邀请（每小时或每次，%）
  addCol('contact_settings', 'music_invite_prob', 'INTEGER DEFAULT 21')
  addCol('contact_settings', 'music_fav_prob', 'INTEGER DEFAULT 1')
  addCol('contact_settings', 'game_invite_prob', 'INTEGER DEFAULT 21')
  addCol('contact_settings', 'cinema_invite_prob', 'INTEGER DEFAULT 21')
  // 朋友圈「回复概率」：我评论对方动态 / 回复他评论时，TA 回复我的概率（%）
  addCol('contact_settings', 'moment_reply_prob', 'INTEGER DEFAULT 80')
  // 朋友圈互动待办队列（持久化：刷新/关页不丢，到点由 tick 补发）
  db.exec(`CREATE TABLE IF NOT EXISTS moment_pending (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    moment_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    content TEXT DEFAULT '',
    images TEXT DEFAULT '[]',
    due_at INTEGER NOT NULL,
    created_at INTEGER
  )`)
  // MiniMax 语音（按联系人）：配置后语音消息的转写文字可点击「朗读」，
  // 用 MiniMax TTS 以目标语言生成真实语音播放（中文字幕不变，声音按配置语言输出）
  addCol('contact_settings', 'minimax_enabled', 'INTEGER DEFAULT 0')
  addCol('contact_settings', 'minimax_key', "TEXT DEFAULT ''")
  addCol('contact_settings', 'minimax_group', "TEXT DEFAULT ''")
  addCol('contact_settings', 'minimax_model', "TEXT DEFAULT 'speech-02-turbo'")
  addCol('contact_settings', 'minimax_voice', "TEXT DEFAULT ''")
  addCol('contact_settings', 'minimax_lang', "TEXT DEFAULT 'auto'")
  addCol('contact_settings', 'minimax_speed', 'REAL DEFAULT 1')
  addCol('contact_settings', 'minimax_gender', "TEXT DEFAULT 'female'")
  addCol('contact_settings', 'minimax_style', "TEXT DEFAULT ''")
}
