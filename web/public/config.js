/**
 * 运行时配置（改完刷新即生效，不需要重新构建）。
 *
 * 本项目是纯前端、本地优先的应用：没有服务端、没有账号，所有数据只存在
 * 使用者自己的浏览器 / 手机里。仓库源码里不写死任何账号、仓库名或域名，
 * 与「原作者」相关的地址全部集中在下面这一个文件里。
 *
 * ── Fork 到自己名下部署时 ──
 *   OWNER_HOST 改成你自己的域名（或把 OWNER_CONFIG 各项清空），即可启用 / 关闭：
 *     releaseRepo  你的 GitHub 仓库 owner/repo → 应用内检查 APK 更新；留空 = 关闭
 *     musicProxy   你自己的音乐解析 Worker   → 网易云/酷狗链接导入；留空 = 关闭
 *     apkProxy     APK 下载代理，通常复用 musicProxy
 *     traceUrl     「心迹 · 工作台」要嵌入的页面；留空 = 不加载任何外部站点
 *   不改动也没关系：部署到别的域名时 OWNER_CONFIG 会自动失效，
 *   不会连到原作者的 GitHub Releases / Worker / 嵌入站点。
 *   也可以用构建变量 VITE_RELEASE_REPO / VITE_MUSIC_PROXY / VITE_TRACE_URL
 *   / VITE_APK_PROXY 注入（GitHub Actions → Repository Variables）。
 */
;(function () {
  // 只有运行在这个域名（或本地开发 / 原生 APK）时才启用下面这份原作者自用配置
  var OWNER_HOST = 'alin715901.github.io'

  var DEFAULTS = { releaseRepo: '', musicProxy: '', apkProxy: '', traceUrl: '' }

  var OWNER_CONFIG = {
    releaseRepo: 'alin715901/eunoia',
    musicProxy: 'https://eunoia-music.pages.dev',
    traceUrl: 'https://alin715901.github.io/heart-trace/'
  }

  var host = ''
  try { host = window.location.hostname || '' } catch (e) { /* file:// 下可能取不到 */ }
  // Capacitor 原生壳加载 file:// 或 localhost，本地开发同样是 localhost
  var isOwnerEnv = host === OWNER_HOST ||
    host === 'localhost' || host === '127.0.0.1' || host === ''

  // 允许部署者在别处预先写入 window.__EUNOIA_CONFIG__ 做最终覆盖
  var custom = window.__EUNOIA_CONFIG__ || {}
  window.__EUNOIA_CONFIG__ = isOwnerEnv
    ? Object.assign({}, DEFAULTS, OWNER_CONFIG, custom)
    : Object.assign({}, DEFAULTS, custom)
})()
