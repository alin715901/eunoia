const db = require('../db');

/* 钱包：每个联系人（仅单人）一份，记录「我的余额」与「对方余额」。
   my_balance    ：我领取对方发来的红包后累计；
   contact_balance：对方钱包，由系统随机自动增资（数额不限），发红包给我时相应扣减。 */

function ensure(contactId) {
  db.prepare(
    'INSERT OR IGNORE INTO wallets(contact_id, my_balance, contact_balance, updated_at) VALUES(?, 0, 0, ?)'
  ).run(contactId, Math.floor(Date.now() / 1000));
  return db.prepare('SELECT * FROM wallets WHERE contact_id = ?').get(contactId);
}

function getWallet(contactId) {
  let w = db.prepare('SELECT * FROM wallets WHERE contact_id = ?').get(contactId);
  if (!w) w = ensure(contactId);
  return w;
}

/* 对方钱包随机自动增资（数额不限） */
function addToContactBalance(contactId, amount) {
  ensure(contactId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt)) return getWallet(contactId);
  db.prepare(
    'UPDATE wallets SET contact_balance = contact_balance + ?, updated_at = ? WHERE contact_id = ?'
  ).run(amt, Math.floor(Date.now() / 1000), contactId);
  return getWallet(contactId);
}

/* 我领取对方红包：我的余额 +amount，对方余额相应扣减（不低于 0） */
function creditMyBalance(contactId, amount) {
  ensure(contactId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return getWallet(contactId);
  db.prepare(
    'UPDATE wallets SET my_balance = my_balance + ?, contact_balance = MAX(0, contact_balance - ?), updated_at = ? WHERE contact_id = ?'
  ).run(amt, amt, Math.floor(Date.now() / 1000), contactId);
  return getWallet(contactId);
}

/* 我发红包：扣减我的余额（不足则抛错）。金额转入红包「在途」，待对方领取/退回后再结算 */
function debitMyBalance(contactId, amount) {
  ensure(contactId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return getWallet(contactId);
  const w = getWallet(contactId);
  if (w.my_balance < amt) throw new Error('余额不足，请先领取对方发来的红包');
  db.prepare(
    'UPDATE wallets SET my_balance = my_balance - ?, updated_at = ? WHERE contact_id = ?'
  ).run(amt, Math.floor(Date.now() / 1000), contactId);
  return getWallet(contactId);
}

/* 红包被退回：把金额加回我的余额 */
function addToMyBalance(contactId, amount) {
  ensure(contactId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return getWallet(contactId);
  db.prepare(
    'UPDATE wallets SET my_balance = my_balance + ?, updated_at = ? WHERE contact_id = ?'
  ).run(amt, Math.floor(Date.now() / 1000), contactId);
  return getWallet(contactId);
}

module.exports = {
  getWallet,
  addToContactBalance,
  creditMyBalance,
  debitMyBalance,
  addToMyBalance,
  ensure,
};
