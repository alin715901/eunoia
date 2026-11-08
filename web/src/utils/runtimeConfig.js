/**
 * 统一运行时配置。
 *
 * 优先级（除 releaseRepo 外）：
 *   1) window.__EUNOIA_CONFIG__ —— public/config.js，改完刷新即生效，无需重新构建
 *   2) import.meta.env.VITE_*   —— 构建时注入，CI 可用 GitHub Repository Variables
 *   3) traceUrlDefault          —— config.js 提供的默认工作台站点（仅工作台）
 *   4) 空字符串                 —— 显式关闭该项功能
 * releaseRepo 例外：CI 注入的 github.repository 优先，保证 Fork 后自动指向自己的仓库。
 *
 * 设计目的：仓库源码不写死任何需要解绑的账号、仓库名。把本项目 Fork 到自己名下部署时，
 * 「检查更新」「音乐解析中转」会自动关闭，不会连到原作者的 GitHub Releases 或 Cloudflare
 * Worker；而「心迹 · 工作台」是公开可用的独立站点，所有部署默认都加载，部署者可随时改
 * 成自己的地址或关闭。
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

/**
 * 工作台地址单独处理，因为要支持「默认加载 + 可改 + 可关」三者并存：
 *   - 显式写了 traceUrl（含 ''）→ 用它的值，'' 表示主动关闭
 *   - 没写，但配了 VITE_TRACE_URL 构建变量 → 用变量
 *   - 都没有 → 用 config.js 里的默认站点
 */
function pickTrace() {
  if (Object.prototype.hasOwnProperty.call(rt, 'traceUrl')) {
    return typeof rt.traceUrl === 'string' ? rt.traceUrl.trim() : ''
  }
  const b = typeof env.VITE_TRACE_URL === 'string' ? env.VITE_TRACE_URL.trim() : ''
  if (b) return b
  const d = typeof rt.traceUrlDefault === 'string' ? rt.traceUrlDefault.trim() : ''
  return d
}

export const RUNTIME_CONFIG = {
  /** GitHub 仓库 owner/repo，用于应用内检查 APK 更新；留空 = 完全关闭更新检测 */
  releaseRepo: pick('releaseRepo', 'VITE_RELEASE_REPO', true),
  /** 音乐元数据解析中转（Cloudflare Worker）；留空 = 关闭链接导入 */
  musicProxy: pick('musicProxy', 'VITE_MUSIC_PROXY'),
  /** APK 下载代理；留空时由 useUpdater 回退到 musicProxy */
  apkProxy: pick('apkProxy', 'VITE_APK_PROXY'),
  /** 「心迹 · 工作台」嵌入的独立站点；所有部署默认加载，显式设 '' 可关闭 */
  traceUrl: pickTrace()
}

export default RUNTIME_CONFIG
