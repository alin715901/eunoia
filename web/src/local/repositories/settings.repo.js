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
  return { chat, moments: 0, letters };
}

export {
  getGlobal,
  setGlobal,
  allGlobal,
  getBadges,
};
