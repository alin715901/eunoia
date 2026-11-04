// Capacitor 本地通知封装 —— 仅原生 Android/iOS 生效；Web / PWA 走 Service Worker，本模块全部 no-op。
//
// 设计要点（为什么这样能做到「稳定弹窗、且不需要 FCM 云端」）：
//   主动消息完全在本地计算。当我们在 proactiveTick 算出某联系人「下次可发时间」时，
//   立刻用 LocalNotifications.schedule 向「系统闹钟(AlarmManager)」预约一条未来通知。
//   这条预约活在 Android 系统层，即使 App 进程被杀（被划掉 / 系统回收内存）也能准时弹出。
//   App 在前台时收到这条底层通知就立即取消，改由应用内 UI 显示，避免重复弹窗。
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import router from '@/router'

/* 是否运行在 Capacitor 原生壳里（Android/iOS）。Web、PWA、普通浏览器一律返回 false，
   保证本地通知逻辑在网页端完全不生效，不干扰现有 SW 通知链路。 */
export function isNativePlatform() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform())
  } catch {
    return false
  }
}

/* 两个消息渠道（安卓 8+ 渠道重要性一旦创建就不可改，故用两个渠道分别承载两种行为）：
   - MESSAGE_CHANNEL_ID('messages')：HIGH(4) 重要性 → 悬浮通知直接弹在屏幕顶部（离开 App 时用）。
   - MESSAGE_CHANNEL_SILENT_ID('messages_fg')：DEFAULT(3) 重要性 → 只进通知栏、不悬浮弹窗（在 App 内时用，
     不打断当前操作，但仍保留一条可下拉查看的通知）。 */
export const MESSAGE_CHANNEL_ID = 'messages'
export const MESSAGE_CHANNEL_SILENT_ID = 'messages_fg'

/* 按「App 是否在前台」选择消息渠道：
   - 前台（正在用 App）：返回 messages_fg（DEFAULT）→ 不弹悬浮窗，只在通知栏留一条；
   - 后台 / 离开：返回 messages（HIGH）→ 悬浮窗直接弹出。
   这样满足「前台不弹系统弹窗、只进通知栏；切到后台才弹系统弹窗」。 */
export function foregroundMessageChannel() {
  return isAppActive() ? MESSAGE_CHANNEL_SILENT_ID : MESSAGE_CHANNEL_ID
}

export async function ensureNotificationChannel() {
  if (!isNativePlatform()) return
  try {
    // 后台/离开用的高重要性渠道（悬浮弹出）
    await LocalNotifications.createChannel({
      id: MESSAGE_CHANNEL_ID,
      name: '消息',
      description: '联系人消息与主动消息提醒（离开应用时悬浮弹出）',
      importance: 4, // IMPORTANCE_HIGH → 悬浮通知直接弹出
      vibration: true
    })
    // 前台用的普通重要性渠道（只进通知栏、不悬浮）
    await LocalNotifications.createChannel({
      id: MESSAGE_CHANNEL_SILENT_ID,
      name: '消息（应用内）',
      description: '在应用内时仅存入通知栏、不悬浮打断',
      importance: 3, // IMPORTANCE_DEFAULT → 只进通知栏，无悬浮窗
      vibration: false
    })
  } catch (e) {
    console.warn('[ln] 创建通知渠道失败', e)
  }
}

/* 应用是否真正处于「前台且可见」（用户正在看 App）。
   用 Capacitor 的 App 插件(appStateChange)判定，而不是 document.visibilityState ——
   因为安卓 WebView 在 App 退到后台时，visibilityState 经常仍然报 'visible'，
   若用它来决定「是否取消通知/是否弹通知」，会导致后台到达的消息被误取消、从而完全不弹窗。
   这个标记是修复「联系人消息后台不弹窗」的关键。 */
let appActive = true
let appStateListener = null
function setupAppState() {
  if (!isNativePlatform() || appStateListener) return
  try {
    const apply = (isActive) => { appActive = !!isActive }
    App.getState().then((s) => apply(s && s.isActive)).catch(() => {})
    appStateListener = App.addListener('appStateChange', ({ isActive }) => apply(isActive))
  } catch (e) {
    /* 退化为始终前台：最坏情况是不取消前台通知（多一次弹窗），不会让后台消息丢失 */
  }
}
export function isAppActive() {
  return appActive
}

/* 首启请求通知权限（Android 13+ 会弹系统授权框；12 及以下安装即授权，无需弹框）。
   仅在原生环境执行；返回 { granted } 供上层在拒绝时给引导。 */
export async function ensureLocalNotificationPermission() {
  if (!isNativePlatform()) return { granted: false, native: false }
  try {
    // 先确保高重要性渠道存在（否则即使授权也只能进通知栏、不悬浮）
    await ensureNotificationChannel()
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
          channelId: MESSAGE_CHANNEL_ID,
          extra: { contactId: String(contactId) }
        }
      ]
    })
  } catch (e) {
    console.warn('[ln] 预约通知失败', e)
  }
}

/* 主动消息被实时生成 → 立即弹系统通知。
   渠道按前后台选择：前台只进通知栏（不打断），后台/离开才悬浮弹出。 */
export async function fireImmediateNotification({ contactId, title, body }) {
  if (!isNativePlatform()) return false
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 200000 + Number(contactId),
          title: title || '新消息',
          body: body || '给你发来了一条消息',
          channelId: foregroundMessageChannel(),
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
// 模块加载即建立前后台监听（原生环境），确保 isAppActive() 从头就准确，
// 避免未初始化时默认「前台」导致后台消息被漏弹
setupAppState()

/* 初始化本地通知监听（仅原生、仅一次）：
   - localNotificationReceived：前台收到「计划预约的主动消息」闹钟 → 立即按 id 取消，避免与聊天内已显示内容重复弹窗；
     实时生成的主动消息(200000+)与测试(900000+)一律保留 → 前台/后台都弹；
   - localNotificationActionPerformed：用户点击通知 → 打开对应会话。 */
export function initLocalNotifications({ onOpenChat } = {}) {
  setupAppState()
  if (!isNativePlatform()) return () => {}
  // 确保高重要性渠道已创建（首启即建好，之后幂等）
  ensureNotificationChannel().catch(() => {})
  if (initialized) return () => {}
  initialized = true
  const offReceived = LocalNotifications.addListener('localNotificationReceived', (n) => {
    const id = n && n.id
    // 仅取消「计划预约的主动消息」（100000~199999）：用户正用 App 时，该条已被实时生成并在聊天内显示，
    // 取消避免重复弹窗。实时生成(200000+)、测试(900000+)与所有实时回复通知一律保留 → 前台/后台都弹。
    if (id != null && id >= 100000 && id < 200000) {
      LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {})
    }
  })
  const offAction = LocalNotifications.addListener('localNotificationActionPerformed', (n) => {
    const notif = (n && n.notification) || {}
    const extra = (notif && notif.extra) || {}
    let contactId = extra.contactId || null
    const id = notif.id
    // 仅从主动消息预约段（100000~299999）反推 contactId；测试段不反推
    if (!contactId && typeof id === 'number' && id >= 100000 && id < 300000) {
      contactId = String(id - 100000)
    }
    // 通知携带了跳转路由（如来电通知指向聊天页）：优先按路由进入，
    // 再由对应页面的 checkPending 唤起通话界面
    if (extra.route && typeof router !== 'undefined') {
      try { router.push(String(extra.route)) } catch (e) { /* ignore */ }
    }
    if (contactId && typeof onOpenChat === 'function') onOpenChat(contactId)
  })
  return () => {
    offReceived.remove()
    offAction.remove()
  }
}
