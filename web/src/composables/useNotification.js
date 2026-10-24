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
