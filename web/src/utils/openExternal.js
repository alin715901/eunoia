// 打开外部链接（影院「站点」、版本更新下载页等）：
//  - 原生 APK：用 Capacitor Browser 打开「应用内浏览器」（Android = Chrome Custom
//    Tabs，iOS = SFSafariViewController），不会把整个 WebView 导航走——
//    否则点一下外链就会把应用本身冲掉，得按返回才能回来。
//  - 网页 / PWA：window.open 新标签页（标准行为）。
import { isNativePlatform } from '@/composables/useLocalNotification'

export async function openExternal(url) {
  if (!url) return
  if (isNativePlatform()) {
    try {
      const mod = await import('@capacitor/browser')
      await mod.Browser.open({ url })
      return
    } catch (e) {
      /* 插件不可用（如未安装）降级到 window.open */
    }
  }
  window.open(url, '_blank', 'noopener')
}
