import { defineStore } from 'pinia'

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
      let text = msg.text || ''
      // 撤回：显示撤回提示，不显示「（一条卡片消息）」等占位
      if (msg.recalled) {
        text = msg.sender === 'me' ? '我撤回了一条消息' : `${row.name || '对方'}撤回了一条消息`
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
      row.lastText = text
      const tsRaw = msg.created_at
      row.lastAt = tsRaw
        ? typeof tsRaw === 'number'
          ? tsRaw
          : Math.floor(new Date(tsRaw).getTime() / 1000)
        : row.lastAt
    }
  }
})
