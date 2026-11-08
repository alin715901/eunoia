/**
 * 运行时配置（改完刷新即生效，不需要重新构建）。
 *
 * 本项目是纯前端、本地优先的应用：没有服务端、没有账号，所有数据只存在
 * 使用者自己的浏览器 / 手机里。
 *
 * ── 两类配置，区别对待 ──
 *
 * A. 与原作者账号强绑定、Fork 后必须自动失效的（OWNER_CONFIG）：
 *      releaseRepo  检查更新 → 若不隔离会拉原作者 APK 覆盖你自己的版本
 *      musicProxy   音乐中转 → 若不隔离会蹭原作者的 Worker 额度
 *    这两项只在原作者域名 / 本地开发 / 原生 APK 下生效。
 *
 * B. 公开的默认站点，所有部署（含 Fork 出去的私人网站）默认都加载：
 *      traceUrl     「心迹 · 工作台」嵌入的独立网站
 *    它只是一个展示用的外部页面，不读写主应用数据，不会覆盖任何人的东西。
 *
 * ── 想改工作台地址，三种方式任选 ──
 *   1) 直接改下面的 DEFAULT_TRACE_URL（最直观，改完刷新即可）
 *   2) 在加载本文件前预写 window.__EUNOIA_CONFIG__ = { traceUrl: '你的地址' }
 *   3) 用构建变量 VITE_TRACE_URL（GitHub Actions → Repository Variables）
 *    想彻底关闭工作台：把 traceUrl 显式设为空字符串 ''。
 *    将来若把工作台源码一起放进本仓库，把 DEFAULT_TRACE_URL 改成站内相对路径
 *    （如 './heart-trace/'）即可完全自带、不再依赖任何外部域名。
 */
;(function () {
  // 只有运行在这个域名（或本地开发 / 原生 APK）时才启用下面这份原作者自用配置
  var OWNER_HOST = 'alin715901.github.io'

  var DEFAULTS = { releaseRepo: '', musicProxy: '', apkProxy: '' }

  var OWNER_CONFIG = {
    releaseRepo: 'alin715901/eunoia',
    musicProxy: 'https://eunoia-music.pages.dev'
  }

  // 「心迹 · 工作台」默认加载的公开站点（独立网站，数据不与本应用互通）
  var DEFAULT_TRACE_URL = 'https://alin715901.github.io/heart-trace/'

  var host = ''
  try { host = window.location.hostname || '' } catch (e) { /* file:// 下可能取不到 */ }
  // Capacitor 原生壳加载 file:// 或 localhost，本地开发同样是 localhost
  var isOwnerEnv = host === OWNER_HOST ||
    host === 'localhost' || host === '127.0.0.1' || host === ''

  // 允许部署者在别处预先写入 window.__EUNOIA_CONFIG__ 做最终覆盖
  var custom = window.__EUNOIA_CONFIG__ || {}

  var cfg = Object.assign({}, DEFAULTS, isOwnerEnv ? OWNER_CONFIG : {}, custom)

  // 把默认工作台地址单独透出，让 runtimeConfig 能在「没有显式配置」时应用它，
  // 同时不阻断构建变量 VITE_TRACE_URL 的覆盖。
  // 注意：不赋给 cfg.traceUrl —— 这样「没配置」和「显式设 '' 关闭」才能区分开。
  cfg.traceUrlDefault = DEFAULT_TRACE_URL

  window.__EUNOIA_CONFIG__ = cfg
})()
