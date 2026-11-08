/**
 * 统一运行时配置。
 *
 * 优先级（除 releaseRepo 外）：
 *   1) window.__EUNOIA_CONFIG__ —— public/config.js，改完刷新即生效，无需重新构建
 *   2) import.meta.env.VITE_*   —— 构建时注入，CI 可用 GitHub Repository Variables
 *   3) 空字符串                 —— 关闭该项功能
 * releaseRepo 例外：CI 注入的 github.repository 优先，保证 Fork 后自动指向自己的仓库。
 *
 * 设计目的：仓库源码不写死任何账号、仓库名或域名。把本项目 Fork 到自己名下部署时，
 * 若不配置这些项，应用内检查更新、音乐解析中转、心迹外链会自动关闭，
 * 不会连到原作者的 GitHub Releases、Cloudflare Worker 或嵌入站点。
 * 所有数据仍然只存在使用者自己的浏览器 / 手机里。
 */
const rt = (typeof window !== 'undefined' && window.__EUNOIA_CONFIG__) || {}
const env = import.meta.env || {}

function pick(key, envKey, envFirst = false) {
  const a = typeof rt[key] === 'string' ? rt[key].trim() : ''
  const b = typeof env[envKey] === 'string' ? env[envKey].trim() : ''
  // releaseRepo 让 CI 注入的 github.repository 优先：Fork 后连 APK 都自动指向自己的仓库，
  // 不会误拉原作者的 Release 覆盖自身版本。
  return envFirst ? (b || a) : (a || b)
}

export const RUNTIME_CONFIG = {
  /** GitHub 仓库 owner/repo，用于应用内检查 APK 更新；留空 = 完全关闭更新检测 */
  releaseRepo: pick('releaseRepo', 'VITE_RELEASE_REPO', true),
  /** 音乐元数据解析中转（Cloudflare Worker）；留空 = 关闭链接导入 */
  musicProxy: pick('musicProxy', 'VITE_MUSIC_PROXY'),
  /** APK 下载代理；留空时由 useUpdater 回退到 musicProxy */
  apkProxy: pick('apkProxy', 'VITE_APK_PROXY'),
  /** 「心迹 · 工作台」嵌入的外链页面；留空 = 不加载任何外部站点 */
  traceUrl: pick('traceUrl', 'VITE_TRACE_URL')
}

export default RUNTIME_CONFIG
