PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT DEFAULT 'person',
  name TEXT,
  avatar TEXT,
  muted_chat INTEGER DEFAULT 0,
  muted_group INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  -- 称呼：消息里 TA 的性别叫法（他 / 她 / 空 = 不设置）
  pronoun TEXT DEFAULT '',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS contact_members (
  group_id INTEGER,
  member_id INTEGER,
  PRIMARY KEY (group_id, member_id),
  FOREIGN KEY (group_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_settings (
  contact_id INTEGER PRIMARY KEY,
  reply_min INTEGER DEFAULT 1,
  reply_max INTEGER DEFAULT 3,
  reply_delay_min INTEGER DEFAULT 1,
  reply_delay_max INTEGER DEFAULT 5,
  -- 回答问题时长：对方回答「提问」时的回复速度（秒），与「回复时长」区分；缺省回落 reply_delay
  answer_delay_min INTEGER DEFAULT 1,
  answer_delay_max INTEGER DEFAULT 5,
  cat_weights TEXT DEFAULT '{"main":40,"emoji":30,"kaomoji":30,"image":0,"sticker":0,"voice":0}',
  gen_ratio INTEGER DEFAULT 70,
  proactive_enabled INTEGER DEFAULT 0,
  proactive_count INTEGER DEFAULT 1,
  proactive_interval_min INTEGER DEFAULT 60,
  moment_enabled INTEGER DEFAULT 0,
  moment_freq INTEGER DEFAULT 86400,
  moment_count_min INTEGER DEFAULT 0,
  moment_count_max INTEGER DEFAULT 2,
  moment_reply_enabled INTEGER DEFAULT 1,
  moment_reply_min INTEGER DEFAULT 1,
  moment_reply_max INTEGER DEFAULT 3,
  -- 朋友圈「评论速度」：对方给我朋友圈点赞/评论/回复的快慢（slow/normal/fast）
  moment_comment_speed TEXT DEFAULT 'normal',
  letter_enabled INTEGER DEFAULT 0,
  letter_freq INTEGER DEFAULT 86400,
  letter_sentences_min INTEGER DEFAULT 3,
  letter_sentences_max INTEGER DEFAULT 6,
  letter_opening TEXT DEFAULT '致{name}',
  letter_closing TEXT DEFAULT '——永远爱你的{name}',
  my_name TEXT,
  my_avatar TEXT,
  avatar_shape TEXT DEFAULT 'circle',
  avatar_radius INTEGER DEFAULT 12,
  chat_bg TEXT,
  bubble_style TEXT
);

CREATE TABLE IF NOT EXISTS card_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  scope TEXT DEFAULT 'general',
  owner_contact_id INTEGER NULL,
  name TEXT,
  color TEXT DEFAULT '',
  blocked INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER,
  category TEXT,
  scope TEXT DEFAULT 'general',
  owner_contact_id INTEGER NULL,
  content TEXT NULL,
  asset_path TEXT NULL,
  duration INTEGER NULL,
  blocked INTEGER DEFAULT 0,
  weight REAL DEFAULT 1,
  created_at INTEGER,
  FOREIGN KEY (group_id) REFERENCES card_groups(id) ON DELETE CASCADE
);

/* 「我」的拍一拍库：聊天里双击对方头像弹出的拍一拍面板专用，无分组概念。
   与字卡库里的拍一拍专区（cards 表 category='poke'，「对方」拍我用的，有分组）
   是两张互不相通的库；内容由用户自行添加，发送时原样呈现、不拼接前后缀。 */
CREATE TABLE IF NOT EXISTS poke_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  weight REAL DEFAULT 1,
  blocked INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER,
  sender TEXT,
  content_type TEXT DEFAULT 'text',
  card_id INTEGER NULL,
  text TEXT NULL,
  asset_path TEXT NULL,
  duration INTEGER NULL,
  -- 群聊里这条消息是谁发的（对应 contact_members.member_id）；单聊为 NULL
  author_member_id INTEGER NULL,
  is_proactive INTEGER DEFAULT 0,
  read_receipt TEXT DEFAULT 'sent',
  read INTEGER DEFAULT 0,
  seq INTEGER DEFAULT 0,
  -- 撤回：置 1 后消息在聊天里显示为「X 撤回了一条消息」系统提示
  recalled INTEGER DEFAULT 0,
  -- 引用：引用某条消息时记录被引用消息 id 与去规范化摘要（文本 + 图片缩略图）
  quote_id INTEGER DEFAULT NULL,
  quote_text TEXT DEFAULT '',
  quote_image TEXT DEFAULT '',
  created_at INTEGER,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- 收藏：长按聊天消息「收藏」后落入此处，在「统计」页按联系人归集展示
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER DEFAULT NULL,
  contact_id INTEGER,
  sender TEXT,
  content_type TEXT DEFAULT 'text',
  text TEXT NULL,
  asset_path TEXT NULL,
  quote_text TEXT DEFAULT '',
  quote_image TEXT DEFAULT '',
  created_at INTEGER,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- 红包钱包：每个联系人（仅单人）一份，记录「我的余额」与「对方余额」。
-- my_balance：我领取对方发来的红包后累计；contact_balance：对方钱包，由系统随机自动增资（数额不限）。
CREATE TABLE IF NOT EXISTS wallets (
  contact_id INTEGER PRIMARY KEY,
  my_balance REAL DEFAULT 0,
  contact_balance REAL DEFAULT 0,
  updated_at INTEGER,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- 群红包领取记录：一条群红包消息（chat_messages.content_type='redpacket' 且 text JSON 带 group:true）
-- 对应 N 条领取流水。grabber：'me' 或 'm:<成员id>'；每人限领一份（唯一索引保证）。
-- 余额归属：我 → wallets(group_id).my_balance；成员 → wallets(成员id).contact_balance（成员自己的钱）。
CREATE TABLE IF NOT EXISTS red_packet_grabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  grabber TEXT NOT NULL,
  amount REAL DEFAULT 0,
  created_at INTEGER,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpg_msg_grabber ON red_packet_grabs(message_id, grabber);

CREATE TABLE IF NOT EXISTS moments (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER,
  author TEXT,
  -- 以谁的身份发（对应 contacts.id）；'me' 发的为 NULL
  author_contact_id INTEGER DEFAULT NULL,
  text TEXT NULL,
  images TEXT NULL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS moment_interactions (
  id INTEGER PRIMARY KEY,
  moment_id INTEGER,
  contact_id INTEGER,
  type TEXT,
  content TEXT NULL,
  from_card INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS letters (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER,
  sender TEXT,
  opening TEXT NULL,
  closing TEXT NULL,
  sentences TEXT NULL,
  is_read INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS divinations (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER DEFAULT NULL,
  method TEXT,
  spread TEXT,
  drawn TEXT,
  reflection TEXT NULL,
  created_at INTEGER,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deck_cards (
  id INTEGER PRIMARY KEY,
  method TEXT,
  name TEXT,
  meaning TEXT,
  image TEXT NULL
);

CREATE TABLE IF NOT EXISTS global_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS proactive_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER,
  fire_at INTEGER,
  payload TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS scheduler_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT,
  contact_id INTEGER NULL,
  ran_at INTEGER,
  detail TEXT
);

-- 群成员级设置：每个群里的每个成员，各自的主动消息 / 回复规则
-- 没设置过的成员回落到群本身的 contact_settings
CREATE TABLE IF NOT EXISTS group_member_settings (
  group_id INTEGER,
  member_id INTEGER,
  reply_min INTEGER DEFAULT 1,
  reply_max INTEGER DEFAULT 3,
  reply_delay_min INTEGER DEFAULT 1,
  reply_delay_max INTEGER DEFAULT 5,
  -- 回答问题时长：对方回答「提问」时的回复速度（秒），与「回复时长」区分；缺省回落 reply_delay
  answer_delay_min INTEGER DEFAULT 1,
  answer_delay_max INTEGER DEFAULT 5,
  cat_weights TEXT DEFAULT '{"main":40,"emoji":30,"kaomoji":30,"image":0,"sticker":0,"voice":0}',
  gen_ratio INTEGER DEFAULT 70,
  proactive_enabled INTEGER DEFAULT 0,
  proactive_count INTEGER DEFAULT 1,
  proactive_interval_min INTEGER DEFAULT 60,
  PRIMARY KEY (group_id, member_id),
  FOREIGN KEY (group_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- 纪念日：可在首页纪念日卡片中选择已有条目（contact_id 为 NULL 表示通用）
CREATE TABLE IF NOT EXISTS anniversaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER DEFAULT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  icon TEXT DEFAULT 'calendar',
  repeat_yearly INTEGER DEFAULT 1,  -- 是否每年重复
  -- 类型：anniversary 纪念日（已过天数）/ countdown 倒数日（距下次天数）
  type TEXT DEFAULT 'anniversary',
  -- 历法：solar 公历 / lunar 农历
  calendar TEXT DEFAULT 'solar',
  note TEXT,
  created_at INTEGER,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- 每个联系人的「桌面」配置：人物卡双方头像/名字/签名、一起听、备忘录、经期、卡片背景、头像左右、选中纪念日
CREATE TABLE IF NOT EXISTS contact_desktop (
  contact_id INTEGER PRIMARY KEY,
  sign TEXT DEFAULT '',
  love INTEGER DEFAULT 0,
  listen_hours INTEGER DEFAULT 0,
  memo TEXT DEFAULT '',
  period TEXT DEFAULT '',
  card_bg TEXT DEFAULT '',
  -- 人物卡背景图透明度：0-100（100 = 完全不透明，越小越淡）
  card_bg_opacity INTEGER DEFAULT 100,
  ava_left TEXT DEFAULT 'me',
  my_avatar TEXT DEFAULT '',
  partner_avatar TEXT DEFAULT '',
  my_name TEXT DEFAULT '',
  partner_name TEXT DEFAULT '',
  ann_id INTEGER DEFAULT 0,
  -- 音乐播放模式：list 顺序 / shuffle 随机 / one 单曲（每个联系人独立）
  play_mode TEXT DEFAULT 'list',
  -- 是否把人物卡设置的头像同步应用到与该联系人的聊天界面
  sync_chat_avatar INTEGER DEFAULT 0,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- 通用模块数据（日记 / 备忘录 / 心情 / 经期 / 相册 / 音乐 / 影视 / 游戏 / 档案）
-- 统一一张表：module 区分模块，extra 存各模块自定义字段的 JSON，
-- contact_id 为空表示「通用」，非空表示归属某个联系人（如相册、日记可按人分开）
CREATE TABLE IF NOT EXISTS app_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  contact_id INTEGER DEFAULT NULL,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  extra TEXT DEFAULT '{}',
  done INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_app_items_module ON app_items(module, contact_id);

/* ─── 相册：照片墙 ─── */
/* 一张照片墙：名称、封面（dataURL，可为空→列表用占位）、页数（决定长卷总长度）、
   画布内容宽度（px，元素坐标基于此）、更新时间 */
CREATE TABLE IF NOT EXISTS photo_walls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cover TEXT DEFAULT '',
  page_count INTEGER DEFAULT 1,
  width INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

/* 照片墙里的装饰元素：图片 / 贴纸 / 文字。
   坐标 (x, y) 为画布世界坐标（左上角锚点，px），scale 缩放，rotation 角度(deg)，
   z 层级；content：图片/贴纸为 dataURL，文字为文本内容 */
CREATE TABLE IF NOT EXISTS photo_wall_elements (
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
);
CREATE INDEX IF NOT EXISTS idx_pwe_wall ON photo_wall_elements(wall_id);
