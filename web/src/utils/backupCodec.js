/* 备份文件编解码：gzip 压缩 / 解压（含自动识别旧版未压缩 JSON）。
 * 背景：备份里的图片 / 语音是 base64 dataURL，gzip 可把 base64 收回约 3/4；
 * 字段名、引号、结构等文本冗余压得更狠。图片为主的备份实测约 75%，
 * 文本为主（字卡 / 信件等）可到 30% 以下，综合体积明显下降。
 * 兼容性：导入端同时接受「旧版未压缩 .json」与「新版压缩 .json.gz」——
 * 通过文件头魔数 1F 8B 判断，无需看扩展名，旧文件 / 新文件都能正常导入，不丢数据。 */
import pako from 'pako'

/* gzip 文件头魔数：0x1F 0x8B，第 3 字节固定 0x08（DEFLATE） */
export function isGzipBytes(u8) {
  return u8 && u8.length > 3 && u8[0] === 0x1f && u8[1] === 0x8b && u8[2] === 0x08
}

/* 把 JSON 字符串压成 gzip 字节（云端备份上传用）。
 * 分块喂给流式 deflate，避免 pako.gzip 一次性持有 输入+输出 双份大内存。 */
export function gzipJsonText(text) {
  const chunks = []
  const CHUNK = 4 * 1024 * 1024
  const deflator = new pako.Deflate({ gzip: true })
  for (let i = 0; i < text.length; i += CHUNK) {
    deflator.push(text.slice(i, i + CHUNK), false)
  }
  deflator.push('', true) // flush 结束
  const out = deflator.result
  if (!out || !out.length) throw new Error('备份压缩失败')
  return out
}

/* 把「文件字节」解码成备份对象：
 *   - gzip 文件 → 解压为文本 → JSON.parse
 *   - 旧版未压缩 JSON → 直接按 UTF-8 文本解析
 * 解析失败抛错（调用方应提示而不是静默，导入前失败不影响本地数据）。 */
export function decodeBackupBinary(buffer) {
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
