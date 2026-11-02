// Capacitor 本地通知封装 —— 仅原生 Android/iOS 生效；Web / PWA 走 Service Worker，本模块全部 no-op。
//
// 设计要点（为什么这样能做到「稳定弹窗、且不需要 FCM 云端」）：
//   主动消息完全在本地计算。当我们在 proactiveTick 算出某联系人「下次可发时间」时，
//   立刻用 LocalNotifications.schedule 向「系统闹钟(AlarmManager)」预约一条未来通知。
//   这条预约活在 Android 系统层，即使 App 进程被杀（被划掉 / 系统回收内存）也能准时弹出。
//   App 在前台时收到这条底层通知就立即取消，改由应用内 UI 显示，避免重复弹窗。
import { LocalNotifications } from '@capacitor/local-notifications'

/* 是否运行在 Capacitor 原生壳里（Android/iOS）。Web、PWA、普通浏览器一律返回 false，
   保证本地通知逻辑在网页端完全不生效，不干扰现有 SW 通知链路。 */
export function isNativePlatform() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform())
  } catch {
    return false
  }
}

/* 首启请求通知权限（Android 13+ 会弹系统授权框；12 及以下安装即授权，无需弹框）。
   仅在原生环境执行；返回 { granted } 供上层在拒绝时给引导。 */
export async function ensureLocalNotificationPermission() {
  if (!isNativePlatform()) return { granted: false, native: false }
  try {
    const cur = await LocalNotifications.checkPermissions()
    if (cur.display === 'granted') return { granted: true }
    const res = await LocalNotifications.requestPermissions()
    return { granted: res.display === 'granted' }
  } catch (e) {
    console.warn('[ln] 请求通知权限失败', e)
    return { granted: false, error: String(e) }
  }
}

/* 预约下一次主动消息的系统通知：atTimeSec 为「下次可发时间」（秒）。
   只预约未来时刻；过去/现在的不预约（那种由「实时生成+立即弹」路径处理）。
   以 (100000 + contactId) 为固定 id —— 重复预约同一 id 会更新时间，幂等，可每轮 tick 重排。 */
export async function scheduleProactiveNotification({ contactId, title, body, atTimeSec }) {
  if (!isNativePlatform()) return
  try {
    const now = Math.floor(Date.now() / 1000)
    if (!atTimeSec || atTimeSec <= now + 2) return // 仅预约未来
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 100000 + Number(contactId),
          title: title || '新消息',
          body: body || '给你发来了一条消息',
          schedule: { at: new Date(atTimeSec * 1000), allowWhileIdle: true },
          extra: { contactId: String(contactId) }
        }
      ]
    })
  } catch (e) {
    console.warn('[ln] 预约通知失败', e)
  }
}

/* 主动消息在「App 正处于后台（未被划掉）」的瞬间被实时生成 → 立即弹系统通知。
   前台（visibilityState=visible）时不弹，交给应用内 UI。返回是否弹了。 */
export async function fireImmediateNotification({ contactId, title, body }) {
  if (!isNativePlatform()) return false
  try {
    if (document.visibilityState === 'visible') return false
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 200000 + Number(contactId),
          title: title || '新消息',
          body: body || '给你发来了一条消息',
          extra: { contactId: String(contactId) }
        }
      ]
    })
    return true
  } catch (e) {
    return false
  }
}

/* App 回前台时清空所有预约（改由应用内 UI 显示）。
   注意：这里默认不调用 —— 预约必须跨「前后台切换」保留，否则后台被杀时失去闹钟。
   仅在前台收到底层通知时按 id 单条取消（见 initLocalNotifications）。 */
export async function cancelScheduledNotifications() {
  if (!isNativePlatform()) return
  try {
    await LocalNotifications.cancelAll()
  } catch (e) {
    /* ignore */
  }
}

let initialized = false
/* 初始化本地通知监听（仅原生、仅一次）：
   - localNotificationReceived：前台收到（闹钟到点但用户正用 App）→ 立即按 id 取消，避免重复弹窗；
   - localNotificationActionPerformed：用户点击通知 → 打开对应会话。 */
export function initLocalNotifications({ onOpenChat } = {}) {
  if (!isNativePlatform() || initialized) return () => {}
  initialized = true
  const offReceived = LocalNotifications.addListener('localNotificationReceived', (n) => {
    if (document.visibilityState === 'visible') {
      const id = n && n.id
      if (id != null) LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {})
    }
  })
  const offAction = LocalNotifications.addListener('localNotificationActionPerformed', (n) => {
    const notif = (n && n.notification) || {}
    let contactId = (notif.extra && notif.extra.contactId) || null
    const id = notif.id
    if (!contactId && typeof id === 'number' && id >= 100000) contactId = String(id - 100000)
    if (contactId && typeof onOpenChat === 'function') onOpenChat(contactId)
  })
  return () => {
    offReceived.remove()
    offAction.remove()
  }
}
