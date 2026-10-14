/**
 * 后台保活（全局）
 * ───────────────────────────────────────────────────────────
 * 目标：防止浏览器把页面清理 / 刷新 / 杀掉（尤其安卓浏览器后台回收、
 *       部分 WebView 长时间无操作被回收），从而让音乐续播、通话、
 *       主动消息等后台任务不被打断。
 *
 * 跨浏览器策略（全部特性检测，不支持就静默降级，绝不报错）：
 *   1. Screen Wake Lock：前台时持有屏幕常亮锁。Chrome / Edge /
 *      三星 / QQ / UC 等安卓浏览器均支持；iOS Safari 不支持 → 跳过。
 *   2. Service Worker 心跳：周期性向 SW 发消息，让 SW 与页面保持
 *      活跃；SW 同时负责离线缓存（断网也能开）。
 *   3. visibilitychange 复位：切回前台时重新抢锁 / 心跳，锁被系统
 *      释放后自动补挂。
 *   4. PWA：manifest + SW 已就绪，安装为独立应用后系统更不容易回收。
 *
 * 说明：没有任何 Web API 能 100% 阻止操作系统在后台彻底冻结页面
 *      （尤其 iOS Safari）。本保活是“尽力而为”，在安卓浏览器上效果
 *      明显；iOS 上主要靠 PWA + 音频播放维持，能力有限属平台限制。
 */

import { ref } from 'vue'

const enabled = ref(false)
let wakeLockSentinel = null
let heartbeatTimer = null
let visibilityHandler = null
let started = false

function wakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

async function acquireWakeLock() {
  if (!wakeLockSupported()) return
  if (document.hidden) return // 后台时系统会自动释放，不必抢
  if (wakeLockSentinel) return
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen')
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null
    })
  } catch (e) {
    /* 无瞬态激活（如应用启动自动开启）或浏览器拒绝 → 忽略，待下次可见时再抢 */
    wakeLockSentinel = null
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    try { wakeLockSentinel.release() } catch (e) { /* ignore */ }
    wakeLockSentinel = null
  }
}

function pingServiceWorker() {
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'KEEPALIVE_HEARTBEAT', t: Date.now() })
    }
  } catch (e) { /* ignore */ }
}

function startHeartbeat() {
  stopHeartbeat()
  // 多数浏览器对后台定时器会节流（降到约 1 分钟一次），这里以 10s 为周期，
  // 前台频繁保活、后台至少留一个“心跳”信号尽力维持。
  heartbeatTimer = setInterval(() => {
    if (!document.hidden) acquireWakeLock()
    pingServiceWorker()
  }, 10000)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function handleVisibility() {
  if (document.hidden) {
    // 切到后台：屏幕锁由系统自动释放；心跳定时器继续（节流后仍尽力保活）
    releaseWakeLock()
  } else {
    // 切回前台：补挂锁 + 立即心跳
    acquireWakeLock()
    pingServiceWorker()
  }
}

/**
 * 启动全局保活。幂等：重复调用不会叠加监听。
 */
function start() {
  if (started) return
  started = true
  visibilityHandler = handleVisibility
  document.addEventListener('visibilitychange', visibilityHandler)
  acquireWakeLock()
  startHeartbeat()
  pingServiceWorker()
}

/**
 * 停止全局保活。
 */
function stop() {
  started = false
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  releaseWakeLock()
  stopHeartbeat()
}

export function useKeepAlive() {
  /**
   * 开启 / 关闭保活并持久化由调用方负责。
   */
  async function setEnabled(v) {
    enabled.value = !!v
    if (enabled.value) start()
    else stop()
  }

  /**
   * 当前平台可用哪种保活手段（用于 UI 提示）。
   */
  function supportLevel() {
    const wl = wakeLockSupported()
    const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    if (wl && sw) return 'full'   // 安卓浏览器：屏幕锁 + SW 心跳
    if (sw) return 'limited'      // iOS Safari 等：仅靠 SW / PWA / 音频
    return 'minimal'
  }

  return { enabled, setEnabled, start, stop, supportLevel }
}
