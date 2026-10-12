const db = require('./index');

function now() {
  return Math.floor(Date.now() / 1000);
}

const MAIN_CARDS = [
  '今天也辛苦啦～',
  '在干嘛呀？',
  '想你了呢',
  '陪我聊聊天嘛',
  '最喜欢你了',
  '晚安，好梦',
  '你今天开心吗',
  '要好好吃饭哦',
  '别太累着自己哦',
  '我会一直陪着你的',
  '今天有什么好玩的事吗',
  '抱抱你～',
];

const EMOJI_CARDS = [
  '🐱', '🌟', '💖', '🌈', '☀️', '🌸', '🍰', '🎀', '✨', '🐰', '🌙', '💕',
];

const KAOMOJI_CARDS = [
  '(｡･ω･｡)',
  '(づ｡◕‿‿◕｡)づ',
  '(*´∀`)~♥',
  '(◕‿◕)',
  '(｡•́︿•̀｡)',
  '(≧▽≦)',
  '(๑•̀ㅂ•́)و✧',
  '(ノ￣ω￣)ノ',
  '( ˘ ³˘)♥',
  '(｀・ω・´)',
  '(*/ω＼*)',
  '(◍•ᴗ•◍)',
];

// 大阿尔卡那 22 张
const TAROT = [
  [0, '愚者', '新的开始、自由与冒险，勇敢踏出第一步。'],
  [1, '魔术师', '创造力与行动力，你拥有实现目标的能力。'],
  [2, '女祭司', '直觉与潜意识，静心倾听内心的声音。'],
  [3, '皇后', '丰饶与滋养，爱与美正围绕着你。'],
  [4, '皇帝', '稳定与掌控，以理性建立秩序。'],
  [5, '教皇', '传统与指引，向有经验者寻求建议。'],
  [6, '恋人', '爱与选择，用心经营重要的关系。'],
  [7, '战车', '意志与胜利，专注目标终能克服阻碍。'],
  [8, '力量', '温柔的勇气，以柔克刚内在坚定。'],
  [9, '隐士', '内省与独处，给自己一段沉淀的时间。'],
  [10, '命运之轮', '转变与机遇，顺应生命的起伏。'],
  [11, '正义', '公平与因果，诚实面对会得到回报。'],
  [12, '倒吊人', '换个视角，暂停是为了更好地前行。'],
  [13, '死神', '结束与重生，放下旧事方能焕新。'],
  [14, '节制', '平衡与调和，适度带来和谐。'],
  [15, '恶魔', '执念与束缚，看清让你被困的枷锁。'],
  [16, '高塔', '突变与崩解，旧结构瓦解迎来真相。'],
  [17, '星星', '希望与疗愈，黑暗后终见星光。'],
  [18, '月亮', '迷雾与潜意识，别被幻象牵着走。'],
  [19, '太阳', '喜悦与成功，光明温暖地照耀你。'],
  [20, '审判', '觉醒与召唤，回顾过往迎接新生。'],
  [21, '世界', '圆满与完成，一个循环抵达终点。'],
];

// 雷诺曼 10 张常用
const LENORMAND = [
  ['心', '爱情与情感，关系中的温暖核心。'],
  ['信', '消息与沟通，将有信件或讯息到来。'],
  ['戒指', '承诺与结合，长久的约定。'],
  ['月亮', '夜晚与情绪，隐藏的直觉。'],
  ['书', '秘密与知识，有待揭开的真相。'],
  ['路', '选择与前程，人生方向的岔口。'],
  ['狗', '友谊与忠诚，可靠的支持者。'],
  ['花', '美好与欣赏，令人愉悦的礼物。'],
  ['云', '困惑与不确定，前景暂时模糊。'],
  ['锚', '稳定与等待，扎根后终会靠岸。'],
];

function seedGeneralGroups() {
  const ensureGroup = (category, name, cards) => {
    const existing = db
      .prepare("SELECT id FROM card_groups WHERE scope='general' AND category=? AND name=?")
      .get(category, name);
    let gid;
    if (existing) {
      gid = existing.id;
    } else {
      const info = db
        .prepare("INSERT INTO card_groups(category, scope, name, created_at) VALUES(?, 'general', ?, ?)")
        .run(category, name, now());
      gid = info.lastInsertRowid;
    }
    const cnt = db.prepare('SELECT COUNT(*) c FROM cards WHERE group_id=?').get(gid).c;
    if (cnt === 0) {
      const ins = db.prepare(
        "INSERT INTO cards(group_id, category, scope, content, weight, created_at) VALUES(?, ?, 'general', ?, 1, ?)"
      );
      const tx = db.transaction(() => {
        for (const c of cards) ins.run(gid, category, c, now());
      });
      tx();
    }
  };

  ensureGroup('main', '日常', MAIN_CARDS);
  ensureGroup('emoji', '常用', EMOJI_CARDS);
  ensureGroup('kaomoji', '可爱', KAOMOJI_CARDS);
}

function seedDeck() {
  const ins = db.prepare(
    'INSERT OR IGNORE INTO deck_cards(id, method, name, meaning) VALUES(?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const [id, name, meaning] of TAROT) {
      ins.run(id, 'tarot', name, meaning);
    }
    let lid = 1;
    for (const [name, meaning] of LENORMAND) {
      ins.run(1000 + lid, 'lenormand', name, meaning);
      lid++;
    }
  });
  tx();
}

function seedGlobalSettings() {
  const ins = db.prepare('INSERT OR IGNORE INTO global_settings(key, value) VALUES(?, ?)');
  // 只保留设备级的浏览器通知授权；主题/播放模式等已改为按联系人独立存储
  ins.run('notifications', '{"browser":true}');
}

function seedDefaultContact() {
  const cnt = db.prepare('SELECT COUNT(*) c FROM contacts').get().c;
  if (cnt > 0) return; // 已有联系人则不插入，默认桌面用第一个
  const info = db
    .prepare("INSERT INTO contacts(kind, name, sort_order, created_at) VALUES('person', ?, 0, ?)")
    .run('TA', now());
  const id = info.lastInsertRowid;
  // 主动消息默认开启（1），让用户后台也能收到对方主动发来的字卡
  db.prepare('INSERT OR IGNORE INTO contact_settings(contact_id, proactive_enabled) VALUES(?, 1)').run(id);
  db.prepare('INSERT OR IGNORE INTO contact_desktop(contact_id) VALUES(?)').run(id);
  console.log('[seed] 已创建默认联系人 id=' + id);
}

function runSeed() {
  seedDefaultContact();
  seedGeneralGroups();
  seedDeck();
  seedGlobalSettings();
  console.log('[seed] 默认分组 / 牌库 / 全局设置 已就绪');
}

module.exports = runSeed;

if (require.main === module) {
  runSeed();
  console.log('[seed] 完成');
}
