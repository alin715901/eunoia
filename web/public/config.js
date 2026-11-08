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
 *    这一项只在原作者域名 / 本地开发 / 原生 APK 下生效。
 *
 * B. 公共服务，所有部署（含 Fork 出去的私人网站）默认都可用：
 *      traceUrl     「心迹 · 工作台」嵌入的独立网站
 *      musicProxy   音乐元数据解析中转（Cloudflare Worker）
 *    它们都不读写主应用数据、不会覆盖任何人的东西，所以不按域名隔离。
 *    Fork 出去的私人网站照常能用工作台和音乐链接导入，也可随时改成自己的服务或关闭。
 *
 * ── 想改这两项服务，三种方式任选（以 traceUrl 为例，musicProxy 同理） ──
 *   1) 直接改下面的 DEFAULT_TRACE_URL / DEFAULT_MUSIC_PROXY（最直观，刷新即可）
 *   2) 在加载本文件前预写 window.__EUNOIA_CONFIG__ = { traceUrl: '你的地址' }
 *   3) 用构建变量 VITE_TRACE_URL / VITE_MUSIC_PROXY（GitHub Actions → Repository Variables）
 *    想彻底关闭某项：把对应项显式设为空字符串 ''。
 *    将来若把工作台源码一起放进本仓库，把 DEFAULT_TRACE_URL 改成站内相对路径
 *    （如 './heart-trace/'）即可完全自带、不再依赖任何外部域名。
 */
;(function () {
  // 只有运行在这个域名（或本地开发 / 原生 APK）时才启用下面这份原作者自用配置
  var OWNER_HOST = 'alin715901.github.io'

  // 无需默认值的项：releaseRepo（Fork 后应失效）、apkProxy（留空时由 useUpdater 回退到 musicProxy）
  var DEFAULTS = { releaseRepo: '', apkProxy: '' }

  var OWNER_CONFIG = {
    releaseRepo: 'alin715901/eunoia'
  }

  // 公共服务默认值：所有部署默认可用
  var DEFAULT_TRACE_URL = 'https://alin715901.github.io/heart-trace/'
  var DEFAULT_MUSIC_PROXY = 'https://eunoia-music.pages.dev'

  var host = ''
  try { host = window.location.hostname || '' } catch (e) { /* file:// 下可能取不到 */ }
  // Capacitor 原生壳加载 file:// 或 localhost，本地开发同样是 localhost
  var isOwnerEnv = host === OWNER_HOST ||
    host === 'localhost' || host === '127.0.0.1' || host === ''

  // 允许部署者在别处预先写入 window.__EUNOIA_CONFIG__ 做最终覆盖
  var custom = window.__EUNOIA_CONFIG__ || {}

  var cfg = Object.assign({}, DEFAULTS, isOwnerEnv ? OWNER_CONFIG : {}, custom)

  // 把两个默认服务地址单独透出，让 runtimeConfig 能在「没有显式配置」时应用它们，
  // 同时不阻断 VITE_* 构建变量的覆盖。
  // 注意：不赋给 cfg.traceUrl / cfg.musicProxy —— 这样「没配置」和「显式设 '' 关闭」才能区分开。
  cfg.traceUrlDefault = DEFAULT_TRACE_URL
  cfg.musicProxyDefault = DEFAULT_MUSIC_PROXY

  window.__EUNOIA_CONFIG__ = cfg
})()
