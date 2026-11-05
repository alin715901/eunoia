import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from '@/composables/useLocalNotification'

// 原生插件：把文本（备份 JSON）流式保存到系统「下载」目录（见 FileSavePlugin.java）。
// Android WebView 不支持 <a download> 落盘，必须经原生；为避免一次性把几十 MB 字符串
// 塞进原生桥导致主线程 ANR 卡退，原生侧改为 begin → 分块 append → finish。
const FileSave = registerPlugin('FileSave')

const yieldToMain = () => new Promise((r) => setTimeout(r, 0))

/* 把一个字符串分块（每块 ≤1MB）追加写入原生，避免单次 bridge 序列化巨大字符串。 */
async function writeChunks(str) {
  const MAX = 1024 * 1024
  for (let i = 0; i < str.length; i += MAX) {
    await FileSave.appendFile({ chunk: str.slice(i, i + MAX) })
  }
}

/* 把备份对象按已知结构流式写成 JSON（不一次性 JSON.stringify 整个巨型对象），
   逐表/逐行分块写入原生「下载」目录，并在行间 yieldToMain 让出主线程，避免 ANR 卡退。 */
async function streamBackupToNative(filename, backup) {
  await FileSave.beginFile({ filename })
  await writeChunks(
    '{"app":' + JSON.stringify(backup.app) +
    ',"format":' + JSON.stringify(backup.format) +
    ',"version":' + JSON.stringify(backup.version) +
    ',"created_at":' + JSON.stringify(backup.created_at) +
    ',"scope":' + JSON.stringify(backup.scope) +
    ',"ref":' + JSON.stringify(backup.ref) +
    ',"tables":{'
  )
  const tables = backup.tables || {}
  const keys = Object.keys(tables)
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    await writeChunks(JSON.stringify(k) + ':[')
    const rows = tables[k] || []
    for (let j = 0; j < rows.length; j++) {
      await writeChunks((j ? ',' : '') + JSON.stringify(rows[j]))
      if (j % 100 === 0) await yieldToMain()
    }
    await writeChunks(']' + (i < keys.length - 1 ? ',' : ''))
    await yieldToMain()
  }
  await writeChunks('}')
  if (backup.care_texts !== undefined) {
    await writeChunks(',"care_texts":' + JSON.stringify(backup.care_texts))
  }
  await writeChunks('}')
  const r = await FileSave.finishFile({})
  if (r && r.saved) return { ok: true, location: r.location || '下载/' + filename }
  throw new Error('保存到下载目录失败')
}

/* 导出 JSON 备份文件。
   content 可为：
     - 对象（推荐，由调用方直接传 buildBackup 的结果）：原生壳走「流式生成 + 分块写入」，不一次性 stringify 巨对象；
     - 字符串（网页版或字卡导出）：原样分块写入（网页版走浏览器下载）。
   返回 { ok, location }：location 为用户可见的保存位置（如「下载/xxx.json」），供 UI 告知文件去哪了。 */
export async function exportJsonFile(filename, content) {
  if (!isNativePlatform()) {
    const str = typeof content === 'string' ? content : JSON.stringify(content)
    const blob = new Blob([str], { type: 'application/json' })
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
  if (typeof content === 'string') {
    // 已是完整 JSON 字符串：直接分块写入原生
    await FileSave.beginFile({ filename })
    await writeChunks(content)
    const r = await FileSave.finishFile({})
    if (r && r.saved) return { ok: true, location: r.location || '下载/' + filename }
    throw new Error('保存到下载目录失败')
  }
  // 对象：流式生成，避免一次性 stringify 巨型对象阻塞主线程
  return streamBackupToNative(filename, content)
}
