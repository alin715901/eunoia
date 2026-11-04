// 通知封装 —— 自动按运行环境路由：
//   - 原生 APK（Capacitor Android）：走 @capacitor/local-notifications（系统通知，稳定弹窗，无需 FCM）
//   - Web / PWA / 普通浏览器：走标准 Notification API + Service Worker
import { ref } from 'vue'
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativePlatform, ensureLocalNotificationPermission, MESSAGE_CHANNEL_ID } from '@/composables/useLocalNotification'

export function notificationSupported() {
  // 原生壳里 WebView 没有 Notification API，但本地通知插件可用 → 视为「支持」
  if (isNativePlatform()) return true
  return typeof window !== 'undefined' && 'Notification' in window
}

/* iOS / iPadOS 判定（含 iPadOS 13+ 伪装 Mac UA 的情况）。
   iOS 16.4 起 Web Push 仅对「添加到主屏幕」的 web app 开放——
   任何浏览器（含 Safari / Chrome）的普通标签页里 Notification API 都不存在，
   这是平台限制而非浏览器差异；添加到主屏幕后所有 iOS 浏览器均可通知。 */
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const classic = /iPad|iPhone|iPod/.test(ua)
  const ipadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return classic || ipadOS
}

/* 是否以「添加到主屏幕」的独立应用模式运行（standalone PWA） */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  if (navigator.standalone === true) return true // iOS Safari 专有字段
  return window.matchMedia?.('(display-mode: standalone)').matches === true
}

/* 通知不可用时的环境结论，用于给用户可执行的引导而非一句「不支持」：
   - 'ios-a2hs'：iOS 且不在主屏幕模式 → 添加到主屏幕后可用
   - 'unsupported'：webview（微信/QQ 等）或确实无通知能力的环境 */
export function notificationEnv() {
  if (notificationSupported()) return 'supported'
  if (isIOS()) return 'ios-a2hs'
  return 'unsupported'
}

/* 权限状态的响应式镜像。原生端初始为 'default'，并在首次访问时异步查询真实状态。 */
const permissionState = ref(initialPermission())

function initialPermission() {
  if (isNativePlatform()) return 'default'
  if (typeof window === 'undefined') return 'unsupported'
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

/* 原生端从 LocalNotifications 查询真实权限并同步到响应式状态 */
async function syncNativePermission() {
  if (!isNativePlatform()) {
    syncPermissionState()
    return
  }
  try {
    const p = await LocalNotifications.checkPermissions()
    permissionState.value =
      p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default'
  } catch {
    permissionState.value = 'default'
  }
}

export function notificationPermission() {
  if (isNativePlatform()) return permissionState.value
  if (!notificationSupported()) return 'unsupported'
  return Notification.permission // 'granted' | 'denied' | 'default'
}

/* Web 端：Notification.permission 是普通全局值（非响应式），
   Vue computed 读它永远不会触发更新；这里用 ref 镜像实际状态，
   并在窗口聚焦 / 切回前台时自动同步（iOS 主屏幕应用从系统设置改权限后回到 App 即刷新）。 */
function syncPermissionState() {
  if (notificationSupported()) permissionState.value = Notification.permission
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', syncPermissionState)
  document.addEventListener('visibilitychange', syncPermissionState)
}

export function notificationPermissionState() {
  // 原生端首次访问时异步刷新一次真实权限
  if (isNativePlatform()) syncNativePermission()
  return permissionState
}

export async function requestNotificationPermission() {
  // 原生端：走 Capacitor 本地通知权限（Android 13+ 弹系统授权框）
  if (isNativePlatform()) {
    const r = await ensureLocalNotificationPermission()
    await syncNativePermission()
    return r.granted ? 'granted' : 'denied'
  }
  // Web 端：标准 Notification 授权
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

/* 给 Promise 加超时：navigator.serviceWorker.ready 在「从未注册过任何 SW」
   的环境下永远挂起（不 resolve 不 reject），await 它的调用方会一起卡死——
   电脑端「点击测试」毫无反应就是这个原因（SW 注册失败 / 被 unregister 后 ready 永久 pending）。 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

export async function notify(title, options = {}) {
  // 原生端：直接调系统本地通知（立即弹，无视前后台）
  if (isNativePlatform()) {
    try {
      const { route, body } = options
      const id = 900000 + Math.floor(Math.random() * 1000) // 测试/手动通知专用段，避免被「前台自动取消」逻辑误删
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body: body || '',
            channelId: MESSAGE_CHANNEL_ID,
            extra: route ? { route: String(route) } : {}
          }
        ]
      })
      return true
    } catch (e) {
      console.warn('[notify] 原生通知发送失败', e)
      return false
    }
  }
  // Web / PWA：标准 Notification + Service Worker
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
    // ready 加 3 秒超时 + showNotification 失败回退页面构造器：
    // 桌面端 SW 未注册 / 注册失败 / showNotification 报错时都能弹出来。
    if ('serviceWorker' in navigator) {
      try {
        const reg = await withTimeout(navigator.serviceWorker.ready, 3000)
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, opts)
          return true
        }
      } catch (e) { /* SW 不可用 / 超时 → 落到下面的页面构造器 */ }
    }
    // 兜底：直接构造通知（桌面 Chrome / Edge / Safari 均支持）
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
