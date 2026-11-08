/**
 * 后台保活（全局）
 * ───────────────────────────────────────────────────────────
 * 目标：开启「后台保活」后，切到后台再回来时 ——
 *   1) 数据不丢（不会被浏览器 / 系统清掉）；
 *   2) APK 版的通话 / 音乐在后台不被中断（不被系统杀掉进程）。
 *
 * 关于「屏幕常亮锁（Wake Lock）」与本次改动：
 *   之前误把它当成保活手段之一。实际上它在页面切到后台时会被系统自动
 *   释放（见下方 acquireWakeLock 的 document.hidden 判断），对「切后台
 *   保活」零贡献；它唯一的副作用是前台常驻持锁会让屏幕永远亮、CPU 持续
 *   运行，手机长时间开前台因发热被系统 OOM 杀进程（即「前台久必闪退」）。
 *   因此已移除该锁（start 不再 acquire，handleVisibility / startHeartbeat
 *   也不再抢锁）。移除它不影响任何后台保活能力。
 *
 * 真正负责后台保活的机制（均已保留，与屏幕锁无关）：
 *   1) 数据持久化：local/db.js 在 visibilitychange(hidden) / pagehide 时
 *      立即 flush + 镜像到 App 私有文件，保证切后台 / 被杀后数据不丢。
 *   2) APK 原生前台服务：通话 / 音乐启动时由 Capacitor 前台服务
 *      （CallKeepService.startForeground）维持，切后台进程不被回收。
 *   3) Service Worker 心跳 + 离线缓存：startHeartbeat 每 10s 向 SW 发心跳
 *      （SW 见 sw.js 的 KEEPALIVE_HEARTBEAT 处理并回 pong），SW 负责静态
 *      资源缓存与后台通知；PWA 安装后系统更不易回收。
 *
 * 能力边界（务必知悉）：纯网页版（在浏览器 / Safari 打开）切到后台，浏览器
 *   一定会冻结甚至回收页面进程 —— 这是平台机制，任何 Web API（含 Wake Lock）
 *   都无法 100% 阻止（iOS Safari 尤为激进）。所谓「网页版切后台不被杀」只能
 *   尽力而为（SW 心跳 + PWA + 数据持久化），做不到像 APK 那样靠原生前台服务
 *   真正保活。但「数据被清掉」不会发生 —— 因为落盘在切后台瞬间已完成。
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
  // 仅做 SW 心跳（维持后台保活），不再每 10s 重新抢「屏幕常亮」锁——
  // 那把锁会让屏幕永远亮、CPU 一直转，是长期前台发热闪退的元凶。
  heartbeatTimer = setInterval(() => {
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
    // 切到后台：屏幕锁本就由系统自动释放；心跳定时器继续（节流后仍尽力保活）
  } else {
    // 切回前台：立即给 SW 发一次心跳，让后台期间错过的推送尽快补回
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
  /* 关键修复：不再在空闲前台持有「屏幕常亮」锁。
   * 该锁会让屏幕永远亮着、CPU 持续运行，手机长时间开前台会因发热被系统 OOM
   * 杀进程 —— 表现为「前台时间一久就闪退」，且与停留在哪个页面无关。
   * 后台保活只需 SW 心跳 + 原生前台服务（通话/音乐用），屏幕常亮锁在切后台时
   * 本就被系统释放，对后台保活毫无作用，纯属发热/闪退诱因，故移除。 */
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
