import { defineStore } from 'pinia'
import * as api from '@/api/chat'
import { markContactRead } from '@/api/contacts'
import { useContactsStore } from './contacts'
import { useBadgesStore } from './badges'

function dedupe(list, incoming) {
  const ids = new Set(list.map((m) => m.id))
  const out = list.slice()
  for (const m of incoming) {
    if (m.id != null && ids.has(m.id)) continue
    out.push(m)
    if (m.id != null) ids.add(m.id)
  }
  // 按 seq / created_at 排序
  out.sort((a, b) => {
    if (a.seq != null && b.seq != null) return a.seq - b.seq
    return new Date(a.created_at) - new Date(b.created_at)
  })
  return out
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    messagesByContact: {},
    typingByContact: {},
    loadingByContact: {},
    loadingOlderByContact: {},
    cursors: {},
    /* 语音「转文字」展开的消息 id 表：全局保留，切页面/重进聊天仍显示，主动收起才收 */
    voiceAsrIds: {}
  }),
  getters: {
    messages: (state) => (id) => state.messagesByContact[id] || [],
    isTyping: (state) => (id) => !!state.typingByContact[id],
    voiceAsrOn: (state) => (mid) => !!state.voiceAsrIds[mid]
  },
  actions: {
    toggleVoiceAsr(mid) {
      if (mid == null) return
      if (this.voiceAsrIds[mid]) delete this.voiceAsrIds[mid]
      else this.voiceAsrIds[mid] = true
    },
    /* 语音字卡改文字后，即时同步所有已加载的引用该卡的语音消息（不用退出聊天重进） */
    syncCardText(cardId, text) {
      if (cardId == null) return
      for (const list of Object.values(this.messagesByContact)) {
        for (const m of list) {
          if (String(m.card_id) === String(cardId)) m.text = text
        }
      }
    },
    async load(contactId) {
      this.loadingByContact[contactId] = true
      try {
        const res = await api.getMessages(contactId)
        const msgs = res.messages || []
        this.messagesByContact[contactId] = dedupe(this.messagesByContact[contactId] || [], msgs)
        this.cursors[contactId] = res.nextCursor || null
      } finally {
        this.loadingByContact[contactId] = false
      }
    },
    /* 上滑加载更早的消息：cursor 为当前已加载最旧一条的 id，
       服务端返回更早的一页（id < cursor），本地追加到列表头部。
       返回 true 表示还有更早的、false 表示已到顶（无更早消息） */
    async loadOlder(contactId) {
      const cursor = this.cursors[contactId]
      if (!cursor) return false
      if (this.loadingOlderByContact[contactId]) return false
      this.loadingOlderByContact[contactId] = true
      try {
        const res = await api.getMessages(contactId, cursor)
        const msgs = res.messages || []
        if (msgs.length) {
          this.messagesByContact[contactId] = dedupe(this.messagesByContact[contactId] || [], msgs)
        }
        // 下一页游标：返回页里最旧一条 id；本页不足一页（或无）则已到顶
        this.cursors[contactId] = res.nextCursor || null
        return true
      } finally {
        this.loadingOlderByContact[contactId] = false
      }
    },
    async send(contactId, text, quote = null) {
      const payload = quote && quote.id ? { text, quoteId: quote.id } : { text }
      const msg = await api.sendMessage(contactId, payload.text, payload.quoteId)
      this.messagesByContact[contactId] = dedupe(this.messagesByContact[contactId] || [], [msg])
      return msg
    },
    /* 撤回我的消息：本地把该条消息标记为 recalled（居中显示「我撤回了一条消息」） */
    recall(contactId, messageId) {
      const list = this.messagesByContact[contactId]
      if (!list) return
      this.messagesByContact[contactId] = list.map((m) =>
        m.id === messageId
          ? { ...m, recalled: 1, text: '', asset_path: null, quote_id: null, quote_text: '', quote_image: '' }
          : m
      )
    },
    /* 删除单条消息：从本地列表移除 */
    remove(contactId, messageId) {
      const list = this.messagesByContact[contactId]
      if (!list) return
      this.messagesByContact[contactId] = list.filter((m) => m.id !== messageId)
    },
    appendFromSSE(contactId, msgs) {
      const incoming = msgs || []
      this.messagesByContact[contactId] = dedupe(this.messagesByContact[contactId] || [], incoming)
      // 对方来新消息 = 他已读我的消息：同步把我的未读消息标记为已读（单勾 → 双勾 / 已读）
      if (incoming.some((m) => m.sender === 'contact')) {
        this.messagesByContact[contactId] = this.messagesByContact[contactId].map((m) =>
          m.sender === 'me' && m.read_receipt !== 'read'
            ? { ...m, read_receipt: 'read', read: 1 }
            : m
        )
      }
    },
    setTyping(contactId, value) {
      this.typingByContact[contactId] = value
    },
    /* 追加一条本地发送的消息（图片/红包/通话/提问等特殊消息，发送接口直接返回落库后的消息） */
    push(contactId, msg) {
      if (!msg || msg.id == null) return
      this.messagesByContact[contactId] = dedupe(this.messagesByContact[contactId] || [], [msg])
    },
    /* SSE message_update：单条消息原位更新（红包状态流转「待领取→已领取/退回」） */
    updateFromSSE(contactId, msg) {
      const list = this.messagesByContact[contactId]
      if (!list || !msg || msg.id == null) return
      this.messagesByContact[contactId] = list.map((m) => (m.id === msg.id ? msg : m))
    },
    /* 重新向服务端同步一次：备注变更等场景下，服务端已改写引用摘要/撤回状态，
       这里用最新数据覆盖同 id 消息（保留已加载的更早历史），避免界面显示旧值 */
    async syncFromServer(contactId) {
      const res = await api.getMessages(contactId)
      const fresh = res.messages || []
      const byId = new Map(fresh.map((m) => [m.id, m]))
      const old = this.messagesByContact[contactId] || []
      const merged = old.map((m) => byId.get(m.id) || m)
      for (const m of fresh) {
        if (!old.some((x) => x.id === m.id)) merged.push(m)
      }
      merged.sort((a, b) => {
        if (a.seq != null && b.seq != null) return a.seq - b.seq
        return new Date(a.created_at) - new Date(b.created_at)
      })
      this.messagesByContact[contactId] = merged
    },
    /* 会话内搜索：把服务端搜到的「分页之外的旧消息」合并进本地列表，
       让相关聊天记录能像微信一样显示出整条消息并可跳转定位 */
    mergeMessages(contactId, msgs) {
      const incoming = (msgs || []).filter((m) => m && m.id != null)
      if (!incoming.length) return
      const old = this.messagesByContact[contactId] || []
      const merged = [...old]
      for (const m of incoming) {
        const hit = merged.find((x) => x.id === m.id)
        if (hit) Object.assign(hit, m)
        else merged.push(m)
      }
      merged.sort((a, b) => {
        if (a.seq != null && b.seq != null) return a.seq - b.seq
        return new Date(a.created_at) - new Date(b.created_at)
      })
      this.messagesByContact[contactId] = merged
    },
    /* 对方开始输入 = 已读我的消息：把我的未读消息标记为已读（单勾→双勾/已读），无需等对方真正发出 */
    markMyRead(contactId) {
      const list = this.messagesByContact[contactId]
      if (!list) return
      this.messagesByContact[contactId] = list.map((m) =>
        m.sender === 'me' && m.read_receipt !== 'read'
          ? { ...m, read_receipt: 'read', read: 1 }
          : m
      )
    },
    async markRead(contactId) {
      try {
        await markContactRead(contactId)
      } catch (e) {
        /* ignore */
      }
      const contacts = useContactsStore()
      const c = contacts.list.find((x) => String(x.id) === String(contactId))
      if (c) c.unread = 0
      // 本地消息标记已读
      const list = this.messagesByContact[contactId]
      if (list) {
        this.messagesByContact[contactId] = list.map((m) => (m.read ? m : { ...m, read: true }))
      }
      // 刷新角标
      const badges = useBadgesStore()
      try { await badges.load() } catch (e) { /* ignore */ }
    }
  }
})
