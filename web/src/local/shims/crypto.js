// 浏览器版 crypto 垫片：仅实现 music.service 签名算法需要的 md5。
// 用 js-md5（纯 JS，无 Node 依赖）替代 node:crypto。
import md5 from 'js-md5'

export function createHash(algorithm) {
  if (algorithm !== 'md5') {
    throw new Error(`[crypto-shim] 本地版仅支持 md5，收到: ${algorithm}`)
  }
  const parts = []
  return {
    update(data) {
      parts.push(String(data))
      return this
    },
    digest(encoding) {
      const hex = md5(parts.join(''))
      if (!encoding || encoding === 'hex') return hex
      // 需要二进制摘要时返回 Uint8Array（当前业务未用到）
      const bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
      }
      return bytes
    },
  }
}

export function randomUUID() {
  return crypto.randomUUID()
}
