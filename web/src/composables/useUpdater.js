import { ref } from 'vue'
import { registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { isNativePlatform } from '@/composables/useLocalNotification'
import { openExternal } from '@/utils/openExternal'
import { APP_VERSION } from '@/utils/version'
import { prepareReload } from '@/local/db'
import { RUNTIME_CONFIG } from '@/utils/runtimeConfig'

// 原生插件：应用内下载 APK + 拉起系统安装器
const Updater = registerPlugin('Updater')

// 全局进度状态（供 UpdateProgress 浮层读取）
const visible = ref(false)
const progress = ref(0) // 0-100
const stageText = ref('') // 阶段文案（正在连接…/正在通过代理下载…）
const status = ref('idle') // idle | downloading | installing | error
const errorMsg = ref('')
const downloaded = ref(0)
const total = ref(0)

let progressListener = null
let lastUrl = '' // 自动更新用的 APK 直接下载直链
let lastHtmlUrl = '' // 手动更新兜底用的 Releases 页面地址
let lastMirrors = [] // 镜像直链列表（国内网络直连 GitHub 受限时的兜底下载源）
let installTriggered = false // 已拉起系统安装器，等待用户回应用后校验是否装上新版

/* 下载停滞检测：国内网络直连 GitHub 受限时，下载可能长时间 0 进展却不断开连接，
   进度条卡住、用户干等。这里记录「最近一次进度变化」，每 4s 检查一次，若超过
   30s 毫无进展则把状态切到 error 并提示「前往手动更新」，给用户明确的出路，
   而不是无限卡在下载中（用户之前反映：下载卡片提示「点右上角关闭」但右上角并无 ×）。 */
let stallTimer = null
let lastProgressStamp = 0
function clearStall() {
  if (stallTimer) { clearInterval(stallTimer); stallTimer = null }
  lastProgressStamp = 0
}
function startStallWatch() {
  clearStall()
  lastProgressStamp = Date.now()
  stallTimer = setInterval(() => {
    if (status.value !== 'downloading') { clearStall(); return }
    // 已持续 30s 没有一次进度回调（percent/downloaded 任一变化都算）→ 判定停滞
    if (Date.now() - lastProgressStamp > 30000) {
      clearStall()
      status.value = 'error'
      errorMsg.value = '下载长时间无进展，多半是网络限制连不上更新服务器。请前往手动更新。'
    }
  }, 4000)
}
function touchProgress() { lastProgressStamp = Date.now() }

/* 国内下载代理（可选）：
   复用本项目已有的 Cloudflare Worker 通用代理（音乐代理那个，?url= 任意网址）。
   apkProxy 单独配置时优先，否则回退到 musicProxy（内置公共中转，所有部署默认可用），
   应用内更新会优先走代理服务端代拉 GitHub，大陆也能正常下载安装。
   两者都由 runtimeConfig.js 统一解析（显式 config.js / VITE_* 构建变量 / 默认值）。 */
export function resolveProxy() {
  return RUNTIME_CONFIG.apkProxy || RUNTIME_CONFIG.musicProxy || ''
}

export function useUpdater() {
  return { visible, progress, stageText, status, errorMsg, downloaded, total }
}

export function closeUpdateOverlay() {
  clearStall()
  visible.value = false
}

/* 用户在下载中主动关闭浮层：退出本次自动更新（停止停滞检测），并给出明确的手动更新出路。
   原生端下载已在后台进行、无法中途取消，故这里只是「退出自动更新引导」——
   把状态切到 error 并提示前往手动更新，浮层保留「前往手动更新」按钮，用户点 × 或「关闭」即可彻底收起。 */
export function cancelUpdate() {
  clearStall()
  if (status.value === 'downloading') {
    status.value = 'error'
    errorMsg.value = '已退出自动更新。若下载受限，请前往手动更新。'
  }
  visible.value = true
}

export async function retryUpdate() {
  if (lastUrl) startUpdate(lastUrl, lastHtmlUrl, lastMirrors)
}

/* 自动更新失败时，跳转浏览器打开 Releases 页面手动下载（点击「前往手动更新」）。
   优先用 release 页面（如 https://github.com/<owner>/<repo>/releases/tag/v1.2.2），
   而非直接下载直链——让用户看到更新说明并能自行选择下载。 */
export function openManualUpdate() {
  const url = lastHtmlUrl || lastUrl
  if (!url) return
  openExternal(url).catch(() => {
    try { window.location.href = url } catch (e2) { /* ignore */ }
  })
}

/* 安装器返回应用后：若已装上更高版本，刷新 WebView 加载新前端资源（即「重刷进入」 */
async function checkAndReloadIfUpdated() {
  try {
    const r = await Updater.getNativeVersion()
    const nv = (r && r.version) || ''
    const cur = APP_VERSION.replace(/^v/i, '')
    if (nv && nv !== cur) {
      await prepareReload()
      location.reload()
    }
  } catch (e) { /* 读取失败则不强刷 */ }
}

// 监听前后台：安装器是独立 Activity，用户装完返回即触发 active
App.addListener('appStateChange', (state) => {
  if (state && state.isActive && installTriggered) {
    installTriggered = false
    checkAndReloadIfUpdated()
  }
}).catch(() => {})

/**
 * 开始更新：原生端在应用内下载 APK（带进度）并拉起系统安装器；
 * 网页端无原生安装能力，退回到浏览器下载。
 */
export async function startUpdate(apkUrl, htmlUrl, mirrors) {
  if (apkUrl) lastUrl = apkUrl
  if (htmlUrl) lastHtmlUrl = htmlUrl
  if (Array.isArray(mirrors)) lastMirrors = mirrors
  if (!lastUrl) {
    status.value = 'error'
    errorMsg.value = '未找到安装包地址'
    visible.value = true
    return
  }

  // 网页端：没有原生安装能力，退回浏览器下载（不显示进度浮层）
  if (!isNativePlatform()) {
    openExternal(lastUrl).catch(() => {
      try { window.location.href = lastUrl } catch (e2) { /* ignore */ }
    })
    return
  }

  status.value = 'downloading'
  progress.value = 0
  stageText.value = '正在连接更新服务器…'
  downloaded.value = 0
  total.value = 0
  errorMsg.value = ''
  visible.value = true
  startStallWatch() // 启动「下载停滞」检测（长时间无进展 → 提示前往手动更新）

  try {
    if (!progressListener) {
      progressListener = await Updater.addListener('progress', (e) => {
        if (!e) return
        if (typeof e.percent === 'number') progress.value = e.percent
        if (typeof e.downloaded === 'number') downloaded.value = e.downloaded
        if (typeof e.total === 'number') total.value = e.total
        if (typeof e.stage === 'string' && e.stage) stageText.value = e.stage
        touchProgress() // 任意一次进度回调都算「还在动」，重置停滞计时
      })
    }
    const proxy = resolveProxy()
    await Updater.downloadAndInstall({ url: lastUrl, mirrors: lastMirrors, proxy })
    // 下载完成、已拉起系统安装器，剩下的交给系统
    installTriggered = true
    status.value = 'installing'
  } catch (e) {
    clearStall()
    status.value = 'error'
    errorMsg.value = (e && e.message) || '下载失败，请检查网络后重试'
  }
}
