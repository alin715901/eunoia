// 数据库引擎适配层。
// 优先使用 better-sqlite3（符合技术栈约定，需可联网安装）；
// 当 better-sqlite3 不可用时（例如离线环境），回退到 Node 22 内置的 node:sqlite。
// 两者 API 高度一致（exec / prepare / run / get / all / transaction），
// 这里统一抹平差异，业务代码无需关心底层引擎。

function createDb(dbPath) {
  let db;
  let engine = 'node:sqlite';

  try {
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    engine = 'better-sqlite3';
  } catch (e) {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(dbPath);
    engine = 'node:sqlite';
  }

  // 设置 PRAGMA（两种引擎均支持 exec 方式）
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // node:sqlite 无原生 transaction，提供 BEGIN/COMMIT/ROLLBACK 包装
  if (typeof db.transaction !== 'function') {
    db.transaction = (fn) => (...args) => {
      db.exec('BEGIN');
      try {
        const result = fn(...args);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    };
  }

  // node:sqlite 的 run 返回的 lastInsertRowid 可能为 bigint，统一转 Number
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = origPrepare(sql);
    const origRun = stmt.run.bind(stmt);
    stmt.run = (...args) => {
      const r = origRun(...args);
      if (r && typeof r.lastInsertRowid === 'bigint') {
        r.lastInsertRowid = Number(r.lastInsertRowid);
      }
      return r;
    };
    return stmt;
  };

  db.__engine = engine;
  return db;
}

module.exports = { createDb };
