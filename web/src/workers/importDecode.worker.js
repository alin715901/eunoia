/* 导入解码 Worker：把「读文件字节 → gzip 解压 → JSON.parse → 校验」这套
 * 高内存操作从主线程搬到这里执行。
 *
 * 为什么这么做：导入最危险的是「解码 + 解析」阶段——
 * 一份 100MB 备份峰值内存可达 400~500MB（原始字节 + 解压字节 + 字符串 + 对象树），
 * 而且这一步发生在 importBackup 的事务开启「之前」，没有任何回滚保护，
 * 主线程 OOM 就直接崩 App（用户看到的闪退）。
 *
 * 搬进 Worker 后：
 *  1. 主线程峰值从 ~450MB 降到只持有「解析后的对象树」（约 150MB），且这一步
 *     已落在 importBackup 的 try/catch + reloadFromStorage 回滚保护之内；
 *  2. 若解码阶段在 Worker 里 OOM / 抛错，主线程通过 worker.onerror 捕获，
 *     只弹出错提示、完全不碰数据库——绝不会变砖或丢数据。
 *
 * 本 Worker 仅做纯数据变换（不依赖 db / DOM），与 importPure 共用同一份校验逻辑。 */
import pako from 'pako'
import { FORMAT, VERSION, validateBackup } from '../local/services/importPure'

/* gzip 文件头魔数：0x1F 0x8B，第 3 字节固定 0x08（DEFLATE） */
function isGzipBytes(u8) {
  return u8 && u8.length > 3 && u8[0] === 0x1f && u8[1] === 0x8b && u8[2] === 0x08
}

function decodeBackupBinary(buffer) {
  const bytes = new Uint8Array(buffer)
  let text
  if (isGzipBytes(bytes)) {
    try {
      text = pako.ungzip(bytes, { to: 'string' })
    } catch (e) {
      throw new Error('压缩备份解压失败，文件可能已损坏')
    }
  } else {
    text = new TextDecoder('utf-8').decode(bytes)
  }
  let obj
  try {
    obj = JSON.parse(text)
  } catch (e) {
    throw new Error('备份文件格式不正确，无法解析')
  }
  return obj
}

self.onmessage = (e) => {
  const msg = e.data || {}
  try {
    const payload = decodeBackupBinary(msg.bytes)
    const err = validateBackup(payload)
    if (err) {
      self.postMessage({ ok: false, error: err })
      return
    }
    // 把解析结果回传主线程（结构化克隆会复制对象树，主线程不再承担解码内存）
    self.postMessage({ ok: true, payload })
  } catch (err) {
    self.postMessage({ ok: false, error: (err && err.message) || '备份解析失败' })
  }
}
