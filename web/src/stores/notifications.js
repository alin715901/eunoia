import { defineStore } from 'pinia'
import { useCinemaStore } from './cinema'

let toastSeq = 0

/* 页面在后台时到达的弹窗：先暂存，等页面重新可见再开始计时消失，
   避免"回到 App 时弹窗已过期消失、像是从没弹过"的体验 */
function scheduleRemove(store, id, duration) {
  if (!duration || duration <= 0) return
  if (typeof document !== 'undefined' && document.hidden) {
    const onVisible = () => {
      document.removeEventListener('visibilitychange', onVisible)
      setTimeout(() => store.removeToast(id), duration)
    }
    document.addEventListener('visibilitychange', onVisible)
    return
  }
  setTimeout(() => store.removeToast(id), duration)
}

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    toasts: []
  }),
  actions: {
    pushToast({ title = '', text = '', type = 'info', duration = 3000, avatar = '', route = '' } = {}) {
      /* 影院播放器打开中：消息类提示（新消息 / 收藏 / 朋友圈 / 听歌等）一律不再弹——
         浅色弹条会盖住视频顶部（即用户反馈的"白带"），且这些消息在播放器
         聊天室里实时可见、角标照常更新，不会漏信息。
         错误 / 操作反馈类（type=info）保留，避免点了按钮没反应。 */
      if (type === 'message') {
        try {
          if (useCinemaStore().playerOpen) return 0
        } catch (e) { /*  store 未就绪兜底：忽略，正常弹窗 */ }
      }
      const id = ++toastSeq
      const toast = { id, title, text, type, avatar, route }
      // 同一时刻只保留一条：新弹窗直接覆盖旧弹窗（不再竖列堆叠）
      this.toasts = [toast]
      scheduleRemove(this, id, duration)
      return id
    },
    removeToast(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    }
  }
})
