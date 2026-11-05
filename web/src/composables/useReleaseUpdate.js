import { isNativePlatform } from '@/composables/useLocalNotification'
import { confirmDialog } from '@/utils/dialog'
import { startUpdate, resolveProxy } from '@/composables/useUpdater'
import { APP_VERSION } from '@/utils/version'

// 仓库（与 git remote 一致）。CI 把每次构建的 APK 发布到该仓库的 Releases。
const REPO = 'alin715901/eunoia'
// 用户「暂不更新」后忽略该版本的本地标记：下次启动对该版本不再弹窗
const IGNORE_KEY = 'eunoia.ignoredRelease'

/* 语义化版本比较（兼容 v1.1.0 / 1.1.0），返回 a-b 的正负：
   >0 远端更新，<0 本地更新，=0 相同。 */
function parseVer(v) {
  return String(v || '')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}
function cmpVer(a, b) {
  const A = parseVer(a)
  const B = parseVer(b)
  for (let i = 0; i < 3; i++) {
    const x = A[i] || 0
    const y = B[i] || 0
    if (x !== y) return x - y
  }
  return 0
}

function getIgnored() {
  try { return localStorage.getItem(IGNORE_KEY) || '' } catch (e) { return '' }
}
export function ignoreRelease(tag) {
  try { localStorage.setItem(IGNORE_KEY, String(tag)) } catch (e) { /* ignore */ }
}

export function getLocalVersion() {
  return APP_VERSION
}

/* 原生壳下默认开启「启动自动检测新版本弹窗」；网页版走另一套 SW 自动刷新，与本模块无关。 */
export function isReleaseAutoCheck() {
  try {
    const v = localStorage.getItem('eunoia.releaseAutoCheck')
    if (v === '0' || v === '1') return v === '1'
  } catch (e) { /* ignore */ }
  return true
}
export function setReleaseAutoCheck(on) {
  try { localStorage.setItem('eunoia.releaseAutoCheck', on ? '1' : '0') } catch (e) { /* ignore */ }
}

/* 拉取 GitHub Releases 最新版本（带 8s 超时；失败静默，绝不影响主流程）。
   国内访问 api.github.com 可能慢/失败，这里失败就当「无更新」，不弹窗、不报错。
   若配置了通用 URL 代理（Worker），检测接口也走代理，避免 api.github.com 被墙时检测不到更新。 */
async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`
  const proxy = resolveProxy()
  let apiUrl = url
  if (proxy) {
    let base = proxy.replace(/\/+$/, '').replace(/[?&]url=.*$/, '')
    apiUrl = base.includes('?') ? `${base}&url=${encodeURIComponent(url)}` : `${base}?url=${encodeURIComponent(url)}`
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(apiUrl, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const tag = data.tag_name || ''
    const apk = (data.assets || []).find((a) => /\.apk$/i.test(a.name || ''))
    const apkUrl = apk ? apk.browser_download_url : ''
    // 国内下载兜底：公共 GitHub 代理（截至发版仍可连通）。原生端在无「通用 URL 代理」
    // （本项目 Cloudflare Worker，见 useUpdater.resolveProxy）配置时，会依次尝试
    //   直连 GitHub → ghproxy.net → gh-proxy.com
    // 任一成功即下载安装；公共代理在大陆连通性时有波动，故仅作兜底，最稳的通道仍是用户
    // 自行部署的 Worker 代理（填到「设置 → 音乐 → 解析服务」后更新自动复用）。
    const apkMirrors = apkUrl
      ? [
          'https://ghproxy.net/' + apkUrl,
          'https://gh-proxy.com/' + apkUrl
        ]
      : []
    return {
      tag,
      apkUrl,
      apkMirrors,
      htmlUrl: data.html_url || '',
      notes: data.body || ''
    }
  } catch (e) {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 仅检查、不弹窗。返回：
 *   'latest'  已是最新
 *   'update'  发现新版本（附 tag/apkUrl/htmlUrl/notes）
 *   'ignored' 该新版本已被用户「暂不更新」忽略
 *   'error'   网络异常 / 无 release
 *   'skip'    非原生壳（APK 才用本检测）
 */
export async function checkReleaseUpdate() {
  if (!isNativePlatform()) return { status: 'skip' }
  const latest = await fetchLatestRelease()
  if (!latest || !latest.tag) return { status: 'error' }
  if (cmpVer(latest.tag, APP_VERSION) <= 0) return { status: 'latest' }
  if (getIgnored() === latest.tag) return { status: 'ignored', ...latest }
  return { status: 'update', ...latest }
}

/* 针对「已查到的检查结果」弹选择框：前往更新 → 打开下载；暂不更新 → 记录忽略、继续用旧版。
   与 promptReleaseIfNeeded 的区别：不重新拉取网络，直接复用传入的 r，
   便于在「应用挂载即并行发起检查」的场景下，等检查结果回来再弹窗（避免重复请求）。 */
export async function promptRelease(r) {
  if (r.status !== 'update') return r
  const ok = await confirmDialog({
    title: '发现新版本',
    text: `已有新版本 ${r.tag} 可用。\n是否前往更新？`,
    okText: '前往更新',
    cancelText: '暂不更新'
  })
  if (ok) startUpdate(r.apkUrl, r.htmlUrl, r.apkMirrors)
  else ignoreRelease(r.tag)
  return r
}

/* 检查 + 弹窗（组合上一层）。保留给「手动检查更新」按钮等需要现查现弹的场景。 */
export async function promptReleaseIfNeeded() {
  const r = await checkReleaseUpdate()
  return promptRelease(r)
}
