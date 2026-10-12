const db = require('../db');

function insertLog(task, contactId, detail) {
  db.prepare(
    'INSERT INTO scheduler_log(task, contact_id, ran_at, detail) VALUES(?, ?, ?, ?)'
  ).run(task, contactId ?? null, Math.floor(Date.now() / 1000), detail || '');
  return true;
}

function listPendingJobs() {
  return db.prepare("SELECT * FROM proactive_jobs WHERE status = 'pending'").all();
}

module.exports = {
  insertLog,
  listPendingJobs,
};
