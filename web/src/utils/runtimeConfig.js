/**
 * 统一运行时配置。
 *
 * 优先级（公共服务项：traceUrl / musicProxy）：
 *   1) window.__EUNOIA_CONFIG__ —— public/config.js 里显式写的，含 '' 主动关闭
 *   2) import.meta.env.VITE_*   —— 构建时注入，CI 可用 GitHub Repository Variables
 *   3) config.js 里的 *Default  —— 默认公共服务，所有部署（含 Fork）都可用
 * releaseRepo 例外：CI 注入的 github.repository 优先，保证 Fork 后自动指向自己的仓库；
 *   且原作者域名外的部署该项为空（关闭更新检测），不会拉原作者的 APK 覆盖自身版本。
 * apkProxy：可选项，留空时由 useUpdater 回退到 musicProxy。
 *
 * 设计目的：只有「应用内检查更新」需要与原作者账号解绑，其他服务不写死账号。
 * 把本项目 Fork 到自己名下部署时，检查更新自动关闭/改指自己的仓库；而「心迹 · 工作台」
 * 和「音乐解析中转」是公共服务，所有部署默认都可用，部署者可随时改成自己的地址或关闭。
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
 * 公共服务项单独处理，支持「默认可用 + 可改 + 可关」三者并存：
 *   - 显式写了该项（含 ''）→ 用它的值，'' 表示主动关闭
 *   - 没写，但配了对应 VITE_* 构建变量 → 用变量
 *   - 都没有 → 用 config.js 里的默认服务地址
 */
function pickWithDefault(key, envKey, defaultKey) {
  if (Object.prototype.hasOwnProperty.call(rt, key)) {
    return typeof rt[key] === 'string' ? rt[key].trim() : ''
  }
  const b = typeof env[envKey] === 'string' ? env[envKey].trim() : ''
  if (b) return b
  const d = typeof rt[defaultKey] === 'string' ? rt[defaultKey].trim() : ''
  return d
}

export const RUNTIME_CONFIG = {
  /** GitHub 仓库 owner/repo，用于应用内检查 APK 更新；Fork 后由 CI 注入自己的仓库 */
  releaseRepo: pick('releaseRepo', 'VITE_RELEASE_REPO', true),
  /** 音乐元数据解析中转（Cloudflare Worker）；所有部署默认可用，显式设 '' 可关闭 */
  musicProxy: pickWithDefault('musicProxy', 'VITE_MUSIC_PROXY', 'musicProxyDefault'),
  /** APK 下载代理；留空时由 useUpdater 回退到 musicProxy */
  apkProxy: pick('apkProxy', 'VITE_APK_PROXY'),
  /** 「心迹 · 工作台」嵌入的独立站点；所有部署默认可用，显式设 '' 可关闭 */
  traceUrl: pickWithDefault('traceUrl', 'VITE_TRACE_URL', 'traceUrlDefault')
}

export default RUNTIME_CONFIG
