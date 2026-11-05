import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from '@/composables/useLocalNotification'

// 原生插件：把文本（备份 JSON）流式保存到系统「下载」目录（见 FileSavePlugin.java）。
// Android WebView 不支持 <a download> 落盘，必须经原生；为避免一次性把几十 MB 字符串
// 塞进原生桥导致主线程 ANR 卡退，原生侧改为 begin → 分块 append → finish。
const FileSave = registerPlugin('FileSave')

const yieldToMain = () => new Promise((r) => setTimeout(r, 0))

const MAX = 1024 * 1024 // 每块 ≤1MB

/* 把一个字符串分块（每块 ≤1MB）追加写入原生，避免单次 bridge 序列化巨大字符串。 */
async function writeChunks(str) {
  for (let i = 0; i < str.length; i += MAX) {
    await FileSave.appendFile({ chunk: str.slice(i, i + MAX) })
  }
}

/* 把备份对象流式序列化为 JSON 片段，逐块通过 emit(str) 吐出，并在行间 yieldToMain 让出主线程。
   这样无论走原生分块落盘还是网页 Blob 累积，都不会一次性 JSON.stringify 几十 MB 巨对象阻塞 UI。 */
async function streamBackupChunks(backup, emit) {
  await emit(
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
    await emit(JSON.stringify(k) + ':[')
    const rows = tables[k] || []
    for (let j = 0; j < rows.length; j++) {
      await emit((j ? ',' : '') + JSON.stringify(rows[j]))
      if (j % 100 === 0) await yieldToMain()
    }
    await emit(']' + (i < keys.length - 1 ? ',' : ''))
    await yieldToMain()
  }
  await emit('}')
  if (backup.care_texts !== undefined) {
    await emit(',"care_texts":' + JSON.stringify(backup.care_texts))
  }
  await emit('}')
}

/* 原生壳：流式生成 + 分块写原生「下载」目录，避免主线程 ANR 卡退。 */
async function streamBackupToNative(filename, backup) {
  await FileSave.beginFile({ filename })
  await streamBackupChunks(backup, writeChunks)
  const r = await FileSave.finishFile({})
  if (r && r.saved) return { ok: true, location: r.location || '下载/' + filename }
  throw new Error('保存到下载目录失败')
}

/* 导出 JSON 备份文件。
   content 可为：
     - 对象（推荐，由调用方直接传 buildBackup 的结果）：原生壳与网页版都走「流式生成」，不一次性 stringify 巨对象；
     - 字符串（网页版或字卡导出）：原样分块吐出（网页版走浏览器下载）。
   返回 { ok, location }：location 为用户可见的保存位置（如「下载/xxx.json」），供 UI 告知文件去哪了。 */
export async function exportJsonFile(filename, content) {
  if (!isNativePlatform()) {
    // 网页版：同样流式生成，逐块累积进 BlobParts 数组，行间让出主线程，
    // 避免一次性 JSON.stringify 几十 MB + 单个巨型 Blob 导致主线程卡死几秒（假死/卡顿）。
    const parts = []
    if (typeof content === 'string') {
      for (let i = 0; i < content.length; i += MAX) {
        parts.push(content.slice(i, i + MAX))
        await yieldToMain()
      }
    } else {
      await streamBackupChunks(content, (s) => parts.push(s))
    }
    const blob = new Blob(parts, { type: 'application/json' })
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
