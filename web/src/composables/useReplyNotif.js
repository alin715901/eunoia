/**
 * 「对方实时回复」后台通知的原生桥（仅 Android 生效；Web / PWA 全部 no-op）。
 *
 * 为什么走自定义原生插件，而不是 Capacitor LocalNotifications：
 *   Capacitor 在 Activity.onPause() 就暂停了 WebView / 插件，appStateChange(false) 要到
 *   onStop() 才发——切后台那一刻 JS 已冻结，依赖 JS 定时器或前后台标记的方案必然失效。
 *   LocalNotifications 的短延时预约还有两个真机陷阱：精确闹钟权限未授予时降级成非精确
 *   闹钟（Doze 下可延迟数分钟）；at 因 bridge 延迟早于当前时间时插件静默丢弃（JS 侧仍
 *   显示预约成功）。
 *   ReplyNotifPlugin 改在原生主线程用 Handler 定时 + setAlarmClock 兜底，两条路径都不
 *   依赖 JS 存活，也不受精确闹钟权限限制。
 */
import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from './useLocalNotification'

const ReplyNotif = registerPlugin('ReplyNotif')

/** 同步发起原生调度（不等 Promise）：切后台瞬间 bridge 调用已发出，native 立即登记定时器。 */
export function postReplyNotification({ id, delayMs, title, body, route }) {
  if (!isNativePlatform()) return
  try {
    ReplyNotif.postDelayed({
      id: Number(id),
      delayMs: Math.max(300, Number(delayMs) || 1500),
      title: title || '新消息',
      body: body || '给你发来了一条消息',
      route: route || ''
    }).catch(() => { /* 插件未就绪等异常不影响主流程 */ })
  } catch (e) {
    /* ignore */
  }
}

/** 撤销尚未弹出的通知（仅用于「联系人已被删除」等队列项被丢弃的场景）。 */
export function cancelReplyNotification(id) {
  if (!isNativePlatform()) return
  try {
    ReplyNotif.cancel({ id: Number(id) }).catch(() => {})
  } catch (e) {
    /* ignore */
  }
}

/**
 * 后台弹窗自测：排定一条 5 秒后的原生通知，用户点击后立刻切到后台即可验证。
 * 走与真实回复完全相同的原生链路（Handler + setAlarmClock），前台按设计不弹。
 * 返回 false 表示当前不是原生环境。
 */
export function testReplyNotification(delayMs = 5000) {
  if (!isNativePlatform()) return false
  try {
    ReplyNotif.postDelayed({
      id: 499999, // 段内保留 id，不与真实回复队列冲突
      delayMs: Math.max(1000, Number(delayMs) || 5000),
      title: '后台通知测试',
      body: '切到后台后收到这条，说明后台弹窗已正常 ✅',
      route: ''
    }).catch(() => {})
    return true
  } catch (e) {
    return false
  }
}

/** 取出并清空「点击系统通知」带来的会话路由；无则返回 null。 */
export async function consumeReplyRoute() {
  if (!isNativePlatform()) return null
  try {
    const res = await ReplyNotif.consumeRoute()
    return (res && res.route) || null
  } catch (e) {
    return null
  }
}
