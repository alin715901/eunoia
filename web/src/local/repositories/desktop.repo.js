import db from '../db'

const COLS = [
  'sign',
  'love',
  'listen_hours',
  'memo',
  'period',
  'card_bg',
  'card_bg_opacity',
  'ava_left',
  'my_avatar',
  'partner_avatar',
  'my_name',
  'partner_name',
  'ann_id',
  'play_mode',
  'sync_chat_avatar',
];

const PLAY_MODES = ['list', 'shuffle', 'one'];

function getDesktop(contactId) {
  const row = db
    .prepare('SELECT * FROM contact_desktop WHERE contact_id = ?')
    .get(contactId);
  if (row) return row;
  // 不存在则补一行
  db.prepare('INSERT OR IGNORE INTO contact_desktop(contact_id) VALUES(?)').run(contactId);
  return db.prepare('SELECT * FROM contact_desktop WHERE contact_id = ?').get(contactId);
}

function updateDesktop(contactId, fields = {}) {
  const sets = [];
  const params = [];
  for (const c of COLS) {
    if (fields[c] !== undefined) {
      let v = fields[c];
      if (c === 'listen_hours' || c === 'ann_id') v = Number(v) || 0;
      if (c === 'play_mode') v = PLAY_MODES.includes(v) ? v : 'list';
      sets.push(`${c} = ?`);
      params.push(v);
    }
  }
  if (sets.length) {
    params.push(contactId);
    db.prepare(`UPDATE contact_desktop SET ${sets.join(', ')} WHERE contact_id = ?`).run(...params);
  }
  return getDesktop(contactId);
}

export { getDesktop, updateDesktop }
