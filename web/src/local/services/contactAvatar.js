// 联系人最终头像（全 App 展示/推送统一口径）：
// 人物卡开启「应用到聊天」且设置了人物卡头像 → 人物卡头像；否则联系人本体头像。
// 与 contacts.repo.js / chat.repo.js 里 chat_avatar 的 SQL 合并口径完全一致：
// 所有头像都以此值为准 —— 联系人设置里改了头像（写本体或写人物卡）后，
// 朋友圈通知、游戏邀请、消息推送等全部跟随。
export function contactAvatar(d, contactId) {
  const row = d
    .prepare(
      `SELECT c.avatar AS avatar, d.sync_chat_avatar AS syncf, d.partner_avatar AS pava
       FROM contacts c LEFT JOIN contact_desktop d ON d.contact_id = c.id
       WHERE c.id = ?`
    )
    .get(contactId);
  if (!row) return '';
  return Number(row.syncf) === 1 && row.pava ? row.pava : row.avatar || '';
}
