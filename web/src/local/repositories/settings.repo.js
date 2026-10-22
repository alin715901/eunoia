import db from '../db'

function getGlobal(key) {
  const row = db.prepare('SELECT value FROM global_settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch (e) {
    return row.value;
  }
}

function setGlobal(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(
    'INSERT INTO global_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, v);
  return getGlobal(key);
}

function allGlobal() {
  return db.prepare('SELECT key, value FROM global_settings').all();
}

function getBadges() {
  const chat = db
    .prepare("SELECT COUNT(*) c FROM chat_messages WHERE sender = 'contact' AND read = 0")
    .get().c;
  // 信件：对方寄来且未读的封数（驱动首页导航红点）
  const letters = db
    .prepare("SELECT COUNT(*) c FROM letters WHERE sender = 'contact' AND is_read = 0")
    .get().c;
  // 朋友圈：上次进入朋友圈页（moments_seen_at）之后——
  // ① TA 新发的动态条数；② TA 在我的朋友圈下的点赞 / 评论 / 回复条数
  const seenAt = Number(getGlobal('moments_seen_at') || 0);
  const newMoments = db
    .prepare("SELECT COUNT(*) c FROM moments WHERE author = 'contact' AND created_at > ?")
    .get(seenAt).c;
  const newInteractions = db
    .prepare(
      "SELECT COUNT(*) c FROM moment_interactions mi JOIN moments m ON m.id = mi.moment_id " +
        "WHERE m.author = 'me' AND mi.contact_id > 0 AND mi.created_at > ?"
    )
    .get(seenAt).c;
  return { chat, moments: newMoments + newInteractions, letters };
}

export {
  getGlobal,
  setGlobal,
  allGlobal,
  getBadges,
};
