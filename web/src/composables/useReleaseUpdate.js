import { isNativePlatform } from '@/composables/useLocalNotification'
import { confirmDialog } from '@/utils/dialog'
import { openExternal } from '@/utils/openExternal'
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
   国内访问 api.github.com 可能慢/失败，这里失败就当「无更新」，不弹窗、不报错。 */
async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const tag = data.tag_name || ''
    const apk = (data.assets || []).find((a) => /\.apk$/i.test(a.name || ''))
    return {
      tag,
      apkUrl: apk ? apk.browser_download_url : '',
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

/* 检测到新版本后弹选择框：前往更新 → 打开下载；暂不更新 → 记录忽略、继续用旧版。 */
export async function promptReleaseIfNeeded() {
  const r = await checkReleaseUpdate()
  if (r.status !== 'update') return r
  const ok = await confirmDialog({
    title: '发现新版本',
    text: `已有新版本 ${r.tag} 可用。\n是否前往更新？\n（选「暂不更新」将继续使用当前版本 ${APP_VERSION}）`,
    okText: '前往更新',
    cancelText: '暂不更新'
  })
  if (ok) openReleaseDownload(r.apkUrl || r.htmlUrl)
  else ignoreRelease(r.tag)
  return r
}

/* 打开浏览器/下载器前往下载：原生走应用内浏览器（不冲掉应用），网页走新标签页。 */
export function openReleaseDownload(url) {
  if (!url) return
  openExternal(url).catch(() => {
    try { window.location.href = url } catch (e2) { /* ignore */ }
  })
}
