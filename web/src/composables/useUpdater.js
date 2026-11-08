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

/* 国内下载代理（可选）：
   复用本项目已有的 Cloudflare Worker 通用代理（音乐代理那个，?url= 任意网址）。
   若该 Worker 已部署且填到了「音乐 → 解析服务」或运行时配置 apkProxy/musicProxy，
   则应用内更新会优先走代理服务端代拉 GitHub，大陆也能正常下载安装。
   优先级：运行时配置 apkProxy → musicProxy → 构建环境变量 VITE_APK_PROXY。 */
export function resolveProxy() {
  return RUNTIME_CONFIG.apkProxy || RUNTIME_CONFIG.musicProxy || ''
}

export function useUpdater() {
  return { visible, progress, stageText, status, errorMsg, downloaded, total }
}

export function closeUpdateOverlay() {
  visible.value = false
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

  try {
    if (!progressListener) {
      progressListener = await Updater.addListener('progress', (e) => {
        if (!e) return
        if (typeof e.percent === 'number') progress.value = e.percent
        if (typeof e.downloaded === 'number') downloaded.value = e.downloaded
        if (typeof e.total === 'number') total.value = e.total
        if (typeof e.stage === 'string' && e.stage) stageText.value = e.stage
      })
    }
    const proxy = resolveProxy()
    await Updater.downloadAndInstall({ url: lastUrl, mirrors: lastMirrors, proxy })
    // 下载完成、已拉起系统安装器，剩下的交给系统
    installTriggered = true
    status.value = 'installing'
  } catch (e) {
    status.value = 'error'
    errorMsg.value = (e && e.message) || '下载失败，请检查网络后重试'
  }
}
