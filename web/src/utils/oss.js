/* 阿里云 OSS 工具：浏览器直传（PUT Object）+ V1 签名（HMAC-SHA1，Web Crypto）。
 * 配置为全局一份，存在 global_settings 的 oss_config 键（对象）：
 *   { accessKeyId, accessKeySecret, bucket, endpoint, prefix }
 * endpoint 填 OSS 控制台的地域节点（如 oss-cn-hangzhou.aliyuncs.com，不带协议头）。
 *
 * 注意：浏览器直连 OSS 需要在 OSS 控制台为该 Bucket 配置 CORS 规则
 * （允许来源=当前站点，允许方法=PUT/DELETE/HEAD/GET），否则上传会被浏览器拦截。
 * 另外 Bucket 需「公共读」才能让生成的对象 URL 直接打开（私有读需额外签名 URL）。
 */

export const OSS_DEFAULT = {
  accessKeyId: '',
  accessKeySecret: '',
  bucket: '',
  endpoint: '',
  prefix: 'eunoia'
}

/* 从全局设置对象里读出一份干净配置 */
export function readOssCfg(settings) {
  const raw = (settings && settings.oss_config) || {}
  return {
    accessKeyId: String(raw.accessKeyId || ''),
    accessKeySecret: String(raw.accessKeySecret || ''),
    bucket: String(raw.bucket || '').trim(),
    endpoint: String(raw.endpoint || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    prefix: String(raw.prefix || '').trim().replace(/^\/+|\/+$/g, '')
  }
}

export function ossReady(cfg) {
  return !!(cfg && cfg.accessKeyId && cfg.accessKeySecret && cfg.bucket && cfg.endpoint)
}

/* 规范 endpoint：允许用户填 https://oss-cn-xxx.aliyuncs.com 或 oss-cn-xxx.aliyuncs.com */
function hostOf(cfg) {
  return `${cfg.bucket}.${cfg.endpoint}`
}

/* 拼接对象键：prefix + 业务路径（统一正斜杠、去掉重复斜杠） */
export function ossKeyOf(cfg, path) {
  const p = String(path || '').replace(/^\/+/, '')
  return [cfg.prefix, p].filter(Boolean).join('/')
}

/* 对象 URL（公共读时可直接打开） */
export function ossUrlOf(cfg, key) {
  return `https://${hostOf(cfg)}/${key}`
}

/* ── OSS V1 签名（HMAC-SHA1） ────────────────────────────── */
async function hmacSha1(secret, content) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(content))
  let bin = ''
  const bytes = new Uint8Array(sig)
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

async function authHeader(cfg, method, key, contentType) {
  const date = new Date().toUTCString()
  const resource = `/${cfg.bucket}/${key}`
  const stringToSign = [method, '', contentType || '', date, '', resource].join('\n')
  const sign = await hmacSha1(cfg.accessKeySecret, stringToSign)
  return { date, authorization: `OSS ${cfg.accessKeyId}:${sign}` }
}

/**
 * 上传 Blob/File 到 OSS，返回对象 URL（失败抛错）。
 * 不修改原 cfg；调用方负责在失败时回退本地存储。
 */
export async function ossUpload(cfg, blob, path) {
  if (!ossReady(cfg)) throw new Error('阿里云 OSS 配置不完整（AccessKey / Bucket / 地域节点）')
  const key = ossKeyOf(cfg, path)
  const contentType = blob.type || 'application/octet-stream'
  const { date, authorization } = await authHeader(cfg, 'PUT', key, contentType)
  let res
  try {
    res = await fetch(ossUrlOf(cfg, key), {
      method: 'PUT',
      headers: { Authorization: authorization, Date: date, 'Content-Type': contentType, 'x-oss-object-acl': 'public-read' },
      body: blob
    })
  } catch (e) {
    throw new Error('上传请求失败（浏览器直连可能被 CORS 拦截，需在 OSS 控制台配置 CORS 规则）')
  }
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`OSS 上传失败 HTTP ${res.status}${txt ? `：${txt}` : ''}`)
  }
  return ossUrlOf(cfg, key)
}

/**
 * 从 OSS 下载对象（Bucket 公共读时直接 GET；返回 Blob）。
 */
export async function ossDownload(cfg, path) {
  if (!ossReady(cfg)) throw new Error('阿里云 OSS 配置不完整（AccessKey / Bucket / 地域节点）')
  const url = ossUrlOf(cfg, ossKeyOf(cfg, path))
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error('下载请求失败（浏览器直连可能被 CORS 拦截，需在 OSS 控制台配置 CORS 规则）')
  }
  if (res.status === 404 || res.status === 403) throw new Error('云端还没有备份')
  if (!res.ok) throw new Error(`OSS 下载失败 HTTP ${res.status}`)
  return res.blob()
}

/**
 * 测试连接：上传一个探测文件再删除。
 * 返回 { ok, level, message }——level: 'ok' 读写正常 / 'write' 只能写 / 'cors' 疑似 CORS。
 */
export async function ossTest(cfg) {
  if (!ossReady(cfg)) return { ok: false, level: 'empty', message: '配置不完整：请先填齐 AccessKey / Bucket / 地域节点' }
  const key = ossKeyOf(cfg, `_probe/${Date.now()}.txt`)
  try {
    const url = await ossUpload(cfg, new Blob(['eunoia oss probe'], { type: 'text/plain' }), `_probe/${Date.now()}.txt`)
    // 上传成功：尝试删除探测文件（DELETE 也走 V1 签名）
    try {
      const contentType = ''
      const { date, authorization } = await authHeader(cfg, 'DELETE', key, contentType)
      await fetch(url, { method: 'DELETE', headers: { Authorization: authorization, Date: date } })
      return { ok: true, level: 'ok', message: '连接正常：上传与删除均成功' }
    } catch (e) {
      return { ok: true, level: 'write', message: '可上传，但删除失败（Bucket 可能未授权 DeleteObject）' }
    }
  } catch (e) {
    const msg = String(e.message || e)
    if (/CORS|Failed to fetch|NetworkError/i.test(msg)) {
      return { ok: false, level: 'cors', message: '请求被拦截：请在 OSS 控制台为 Bucket 配置 CORS（允许来源=当前站点，方法=PUT/DELETE/GET）' }
    }
    return { ok: false, level: 'fail', message: msg }
  }
}
