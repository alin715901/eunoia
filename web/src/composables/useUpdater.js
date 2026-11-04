import { ref } from 'vue'
import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from '@/composables/useLocalNotification'

// 原生插件：应用内下载 APK + 拉起系统安装器
const Updater = registerPlugin('Updater')

// 全局进度状态（供 UpdateProgress 浮层读取）
const visible = ref(false)
const progress = ref(0) // 0-100
const status = ref('idle') // idle | downloading | installing | error
const errorMsg = ref('')
const downloaded = ref(0)
const total = ref(0)

let progressListener = null
let lastUrl = ''

export function useUpdater() {
  return { visible, progress, status, errorMsg, downloaded, total }
}

export function closeUpdateOverlay() {
  visible.value = false
}

export async function retryUpdate() {
  if (lastUrl) startUpdate(lastUrl)
}

/**
 * 开始更新：原生端在应用内下载 APK（带进度）并拉起系统安装器；
 * 网页端无原生安装能力，退回到浏览器下载。
 */
export async function startUpdate(apkUrl) {
  if (apkUrl) lastUrl = apkUrl
  if (!lastUrl) {
    status.value = 'error'
    errorMsg.value = '未找到安装包地址'
    visible.value = true
    return
  }

  // 网页端：没有原生安装能力，退回浏览器下载（不显示进度浮层）
  if (!isNativePlatform()) {
    const { openExternal } = await import('@/utils/openExternal')
    openExternal(lastUrl).catch(() => {
      try { window.location.href = lastUrl } catch (e2) { /* ignore */ }
    })
    return
  }

  status.value = 'downloading'
  progress.value = 0
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
      })
    }
    await Updater.downloadAndInstall({ url: lastUrl })
    // 下载完成、已拉起系统安装器，剩下的交给系统
    status.value = 'installing'
  } catch (e) {
    status.value = 'error'
    errorMsg.value = (e && e.message) || '下载失败，请检查网络后重试'
  }
}
