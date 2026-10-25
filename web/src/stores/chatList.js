import { defineStore } from 'pinia'
import { useContactsStore } from './contacts'

/* 聊天列表快照（来自 /chats：含每个会话的最后一条摘要 lastText / 时间 lastAt）。
   单独成 store，让 SSE 收到新消息时能即时更新对应行的「内容 + 时间」，
   不用等列表重新拉取（解决"弹窗已到、列表预览却没同步"的问题）。 */
export const useChatListStore = defineStore('chatList', {
  state: () => ({
    rows: []
  }),
  getters: {
    byId: (state) => (id) => state.rows.find((r) => String(r.id) === String(id))
  },
  actions: {
    setRows(rows) {
      this.rows = Array.isArray(rows) ? rows : []
    },
    /* 新消息到达：刷新该会话在列表里的最后一条摘要与时间 */
    applyMessage(contactId, msg) {
      const row = this.rows.find((r) => String(r.id) === String(contactId))
      if (!row || !msg) return
      /* 群聊预览要带「是谁说的」：发言成员名找联系人 store 解析 */
      const memberName =
        row.kind === 'group' && msg.author_member_id
          ? useContactsStore().getById(msg.author_member_id)?.name || ''
          : ''
      let text = msg.text || ''
      // 撤回：显示撤回提示，不显示「（一条卡片消息）」等占位
      if (msg.recalled) {
        /* 群聊里显示撤回的成员名，单聊显示对方名 */
        text =
          msg.sender === 'me'
            ? '我撤回了一条消息'
            : `${memberName || row.name || '对方'}撤回了一条消息`
        row.lastRecalled = 1
        row.lastSender = msg.sender
      }
      // 图片/红包/带图字卡等非纯文本：沿用「（一条卡片消息）」占位，与列表一致
      else if (
        msg.content_type === 'image' ||
        msg.content_type === 'sticker' ||
        msg.content_type === 'voice' ||
        msg.content_type === 'redpacket' ||
        (msg.content_type === 'card' && msg.asset_path)
      ) {
        text = '（一条卡片消息）'
      }
      /* 邀请/通话/提问等 text 是 JSON 元数据的卡片消息：映射成可读摘要，
         与 getChatList 的预览口径一致——否则列表会直接露出原始 JSON。
         游戏邀请从大厅发出时也会走这里（我发出的邀请同样要广播） */
      else if (msg.content_type === 'game_invite') text = '[游戏邀请]'
      else if (msg.content_type === 'listen_invite') text = '[一起听歌]'
      else if (msg.content_type === 'cinema_invite') text = '[一起观影]'
      else if (msg.content_type === 'companion_invite') text = '[陪伴邀请]'
      else if (msg.content_type === 'call') text = '[通话]'
      else if (msg.content_type === 'question') {
        try { text = '[提问] ' + (JSON.parse(msg.text || '{}').question || '') } catch (e) { text = '[提问]' }
      } else if (msg.content_type === 'poke') text = msg.text || '拍了拍你'
      row.lastText = text
      row.lastSender = msg.sender
      row.lastAuthorMember = msg.author_member_id ?? null
      row.lastAuthorName = memberName
      const tsRaw = msg.created_at
      row.lastAt = tsRaw
        ? typeof tsRaw === 'number'
          ? tsRaw
          : Math.floor(new Date(tsRaw).getTime() / 1000)
        : row.lastAt
    }
  }
})
