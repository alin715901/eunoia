// 浏览器 Notification 封装
export function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission() {
  if (!notificationSupported()) return 'unsupported'
  return Notification.permission // 'granted' | 'denied' | 'default'
}

export async function requestNotificationPermission() {
  if (!notificationSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  try {
    const result = await Notification.requestPermission()
    return result
  } catch (e) {
    return 'denied'
  }
}

export async function notify(title, options) {
  if (!notificationSupported() || Notification.permission !== 'granted') return false
  try {
    // 安卓 Chrome / 大部分手机浏览器不支持 `new Notification()` 构造器，
    // 必须用 Service Worker 的 showNotification()，否则即使授权也不会弹出。
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options || {})
        return true
      }
    }
    // 桌面端兜底：直接构造通知
    new Notification(title, options || {})
    return true
  } catch (e) {
    return false
  }
}

export function useNotification() {
  return {
    supported: notificationSupported(),
    permission: notificationPermission,
    request: requestNotificationPermission,
    notify
  }
}
