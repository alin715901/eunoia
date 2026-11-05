import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from '@/composables/useLocalNotification'

// 原生插件：把文本（备份 JSON）保存到系统「下载」目录（见 FileSavePlugin.java）。
// Android WebView 不支持 <a download> 落盘，必须经原生走 MediaStore。
const FileSave = registerPlugin('FileSave')

/* 导出 JSON 备份文件。
   返回 { ok, location }：location 为用户可见的保存位置描述（如「下载/xxx.json」），
   供 UI 明确告知用户文件去哪了（不再出现「提示导出却找不到文件」）。
   - 原生壳（Android）：写入系统下载目录（MediaStore，免权限、文件管理器/下载 App 可见）。
   - 网页版：沿用 <a download> 浏览器下载（桌面/移动浏览器原生支持）。 */
export async function exportJsonFile(filename, jsonString) {
  if (!isNativePlatform()) {
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return { ok: true, location: filename }
  }
  const r = await FileSave.saveToDownloads({ filename, content: jsonString })
  if (r && r.saved) return { ok: true, location: (r.location || '下载/' + filename) }
  throw new Error('保存到下载目录失败')
}
