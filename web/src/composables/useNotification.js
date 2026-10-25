// 浏览器 Notification 封装
import { ref } from 'vue'

export function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission() {
  if (!notificationSupported()) return 'unsupported'
  return Notification.permission // 'granted' | 'denied' | 'default'
}

/* 响应式的权限镜像：Notification.permission 是普通全局值（非响应式），
   Vue computed 读它永远不会触发更新；这里用 ref 镜像实际状态，
   并在窗口聚焦 / 切回前台时自动同步（iOS 主屏幕应用从系统设置改权限后回到 App 即刷新）。 */
const permissionState = ref(notificationSupported() ? Notification.permission : 'unsupported')

function syncPermissionState() {
  if (notificationSupported()) permissionState.value = Notification.permission
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', syncPermissionState)
  document.addEventListener('visibilitychange', syncPermissionState)
}

export function notificationPermissionState() {
  return permissionState
}

export async function requestNotificationPermission() {
  if (!notificationSupported()) return 'unsupported'
  if (Notification.permission === 'granted') {
    syncPermissionState()
    return 'granted'
  }
  try {
    const result = await Notification.requestPermission()
    syncPermissionState()
    return result
  } catch (e) {
    syncPermissionState()
    return 'denied'
  }
}

export async function notify(title, options = {}) {
  if (!notificationSupported() || Notification.permission !== 'granted') return false
  try {
    /* route 仅用于「点击通知跳转到对应会话」，不是标准 Notification 字段，
       抽出来塞进 data，避免传给构造器时报非标准属性 */
    const { route, ...rest } = options
    const opts = { ...rest }
    // 移动端系统通知补全图标 / 角标 / 合并标签，避免无图标或同会话叠一堆
    if (!opts.icon) opts.icon = './icon-192.png'
    if (!opts.badge) opts.badge = './icon-192.png'
    if (!opts.tag) opts.tag = 'eunoia-message'
    // 携带跳转路由：notificationclick 时前端据此路由到对应会话
    if (route) opts.data = { ...(opts.data || {}), route }

    // 安卓 Chrome / 大部分手机浏览器不支持 `new Notification()` 构造器，
    // 必须用 Service Worker 的 showNotification()，否则即使授权也不会弹出。
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, opts)
        return true
      }
    }
    // 桌面端兜底：直接构造通知
    new Notification(title, opts)
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
