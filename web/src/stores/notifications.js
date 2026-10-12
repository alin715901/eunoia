import { defineStore } from 'pinia'

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
