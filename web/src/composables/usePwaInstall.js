import { ref, computed } from 'vue'

// 全局共享：捕获浏览器原生「安装应用」提示（beforeinstallprompt），
// 让页面能主动弹一个「安装到主屏幕」按钮，而不依赖浏览器自动横幅（Android Chrome 常不弹）。
// iOS Safari 不支持 beforeinstallprompt，只能走手动指引。

const deferredPrompt = ref(null) // 浏览器抛出的安装事件
const installed = ref(false) // 当前是否已在独立（standalone）模式下运行

function isIosSafari() {
  const ua = navigator.userAgent
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return ios && safari
}

function detectInstalled() {
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  if (navigator.standalone === true) return true // iOS
  return false
}

function setupPwaInstall() {
  installed.value = detectInstalled()
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferredPrompt.value = null
  })
  window.addEventListener('beforeinstallprompt', (e) => {
    // 已安装则忽略；否则缓存事件，等用户点按钮再触发
    if (detectInstalled()) {
      installed.value = true
      return
    }
    e.preventDefault()
    deferredPrompt.value = e
  })
}

const canInstall = computed(() => !installed.value && deferredPrompt.value !== null)
const isIos = computed(() => isIosSafari() && !installed.value)

async function promptInstall() {
  const e = deferredPrompt.value
  if (!e) return false
  e.prompt()
  const choice = await e.userChoice
  deferredPrompt.value = null
  return choice.outcome === 'accepted'
}

export function usePwaInstall() {
  return { installed, canInstall, isIos, setupPwaInstall, promptInstall }
}
