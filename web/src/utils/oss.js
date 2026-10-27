/* 阿里云 OSS 工具：浏览器直传 + V4 查询串签名（presigned URL，HMAC-SHA256，Web Crypto）。
 * 配置为全局一份，存在 global_settings 的 oss_config 键（对象）：
 *   { accessKeyId, accessKeySecret, bucket, endpoint, prefix }
 * endpoint 填 OSS 控制台的地域节点（如 oss-cn-guangzhou.aliyuncs.com，不带协议头）。
 *
 * 为什么用 V4 查询串签名：浏览器 fetch 禁止 JS 设置 Date 头（forbidden header），
 * V1 头签名需要 Date / x-oss-* 自定义头，既容易被浏览器丢弃也会被 CORS 预检拦截；
 * V4 查询串签名把全部签名参数放进 URL，请求头只需 Content-Type，最稳。
 *
 * 注意：浏览器直连 OSS 需在 OSS 控制台为 Bucket 配置 CORS 规则
 * （允许来源=当前站点，允许方法=PUT/GET/DELETE，允许 Headers=* 或留空均可）。
 * 对象 URL 直接打开需 Bucket 为「公共读」。
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
    /* prefix 必须有稳定默认值：两台设备若 prefix 不一致，会写到完全不同的
       OSS 对象上（对方以为覆盖了你的，其实各存一份），同步就"看起来不生效"。
       配置里没写 prefix 时一律回落到 'eunoia'；显式写了空串才表示不要前缀。 */
    prefix: raw.prefix === undefined ? OSS_DEFAULT.prefix : String(raw.prefix || '').trim().replace(/^\/+|\/+$/g, '')
  }
}

export function ossReady(cfg) {
  return !!(cfg && cfg.accessKeyId && cfg.accessKeySecret && cfg.bucket && cfg.endpoint)
}

/* 规范 endpoint：允许用户填 https://oss-cn-xxx.aliyuncs.com 或 oss-cn-xxx.aliyuncs.com */
function hostOf(cfg) {
  return `${cfg.bucket}.${cfg.endpoint}`
}

/* 从 endpoint 提取 V4 签名所需 region（如 oss-cn-guangzhou → cn-guangzhou） */
function regionOf(cfg) {
  const first = String(cfg.endpoint || '').split('.')[0] || ''
  return first.replace(/^oss-/, '') || 'cn-hangzhou'
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

/* ── OSS V4 查询串签名（presigned URL） ───────────────────── */
function pad2(n) { return n < 10 ? '0' + n : '' + n }
function iso8601(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
    + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z'
}
function dateStamp(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
}

/* OSS 要求的百分号编码（保留 - _ . ~，其余全编码；encodeSlash=false 时保留 /） */
function ossEncode(s, encodeSlash) {
  s = encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  if (!encodeSlash) s = s.replace(/%2F/g, '/')
  return s
}

function bytesToHex(bytes) {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16)
  return hex
}

async function hmacSha256(key, message) {
  const enc = new TextEncoder()
  const keyBuf = key instanceof Uint8Array ? key : enc.encode(key)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return new Uint8Array(sig)
}

async function sha256Hex(message) {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(message))
  return bytesToHex(new Uint8Array(buf))
}

/**
 * 生成 V4 预签名 URL（参考官方「在URL中包含V4签名」）。
 * @param {string} contentType PUT 时传入且必须与请求头一致（content-type 属必签头）
 * @param {number} expires 签名有效期秒数
 */
async function signedUrlOf(cfg, method, key, extraQuery, contentType, expires) {
  const now = new Date()
  const dateTime = iso8601(now)
  const dStamp = dateStamp(now)
  const region = regionOf(cfg)
  const host = hostOf(cfg)
  const credentialScope = `${dStamp}/${region}/oss/aliyun_v4_request`
  const credential = `${cfg.accessKeyId}/${credentialScope}`

  const query = {}
  if (extraQuery) for (const k of Object.keys(extraQuery)) query[k] = String(extraQuery[k])
  query['x-oss-signature-version'] = 'OSS4-HMAC-SHA256'
  query['x-oss-credential'] = credential
  query['x-oss-date'] = dateTime
  query['x-oss-expires'] = String(expires || 600)
  query['x-oss-additional-headers'] = 'host'

  const canonicalQuery = Object.keys(query).sort()
    .map((k) => `${ossEncode(k, true)}=${ossEncode(query[k], true)}`)
    .join('&')

  /* canonicalUri 签名计算时需包含 bucket 名；实际请求路径为虚拟主机风格（不含 bucket） */
  const canonicalUri = `/${cfg.bucket}/${key ? ossEncode(key, false) : ''}`
  const requestPath = `/${key ? ossEncode(key, false) : ''}`

  /* Canonical Headers：必签 content-type / content-md5 / x-oss-* 头 + host（额外签名） */
  const headersMap = { host }
  if (contentType) headersMap['content-type'] = contentType
  const canonicalHeaders = Object.keys(headersMap).sort()
    .map((k) => `${k}:${headersMap[k]}`)
    .join('\n') + '\n'

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n')

  const stringToSign = [
    'OSS4-HMAC-SHA256',
    dateTime,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const kDate = await hmacSha256('aliyun_v4' + cfg.accessKeySecret, dStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, 'oss')
  const kSigning = await hmacSha256(kService, 'aliyun_v4_request')
  const signature = bytesToHex(await hmacSha256(kSigning, stringToSign))

  return `https://${host}${requestPath}?${canonicalQuery}&x-oss-signature=${ossEncode(signature, true)}`
}

/* 从 OSS 错误 XML 中提取友好信息 */
function parseOssError(status, txt) {
  const code = (/<Code>([^<]+)<\/Code>/.exec(txt) || [])[1] || ''
  const msg = (/<Message>([^<]+)<\/Message>/.exec(txt) || [])[1] || ''
  let friendly = ''
  if (code === 'InvalidAccessKeyId') friendly = 'AccessKey ID 不正确'
  else if (code === 'SignatureDoesNotMatch') friendly = '签名校验失败，请确认 AccessKey Secret 是否正确'
  else if (code === 'NoSuchBucket') friendly = '找不到 Bucket，请检查 Bucket 名称与地区是否匹配'
  else if (code === 'AccessDenied') friendly = '权限不足，请检查 AccessKey 是否有该 Bucket 的读写权限'
  return `OSS 请求失败 HTTP ${status}${code ? ` [${code}]` : ''}：${friendly || msg || txt.slice(0, 120)}`
}

/**
 * 上传 Blob/File 到 OSS，返回对象 URL（失败抛错）。
 * 不修改原 cfg；调用方负责在失败时回退本地存储。
 */
export async function ossUpload(cfg, blob, path) {
  if (!ossReady(cfg)) throw new Error('阿里云 OSS 配置不完整（AccessKey / Bucket / 地域节点）')
  const key = ossKeyOf(cfg, path)
  const contentType = blob.type || 'application/octet-stream'
  let res
  try {
    const url = await signedUrlOf(cfg, 'PUT', key, null, contentType, 600)
    res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob })
  } catch (e) {
    throw new Error('上传请求失败（浏览器直连可能被 CORS 拦截，需在 OSS 控制台配置 CORS 规则）')
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(parseOssError(res.status, txt))
  }
  return ossUrlOf(cfg, key)
}

/**
 * 从 OSS 下载对象（预签名 GET，公共读 / 私有读均可；返回 Blob）。
 * 错误语义严格区分：
 *   404 → 「云端还没有备份」（真正的不存在）
 *   403 → 无权访问（AccessKey 权限不足，或本机时钟偏差过大导致 V4 签名失效——
 *         OSS 对签名时间与服务器时间偏差超过 15 分钟的请求一律 403）
 *   其余 → 带 HTTP 状态码的原始错误
 * 403 绝不能与「没有备份」混为一谈：把它误报成"云端没有备份"会诱导用户
 * 在另一台设备上重新上传，从而把云端真正的新备份覆盖掉（真实发生过的 bug）。
 */
export async function ossDownload(cfg, path) {
  if (!ossReady(cfg)) throw new Error('阿里云 OSS 配置不完整（AccessKey / Bucket / 地域节点）')
  const key = ossKeyOf(cfg, path)
  let res
  try {
    const url = await signedUrlOf(cfg, 'GET', key, null, '', 600)
    res = await fetch(url, { method: 'GET' })
  } catch (e) {
    const err = new Error('下载请求失败（网络异常或被 CORS 拦截，需在 OSS 控制台配置 CORS 规则）')
    err.status = 0
    throw err
  }
  if (res.status === 404) {
    const err = new Error('云端还没有备份')
    err.status = 404
    throw err
  }
  if (res.status === 403) {
    const err = new Error('无权访问云端文件（HTTP 403）：请检查 AccessKey 的读写权限；若本机时间与标准时间偏差较大也会导致签名失效，请校准系统时间后重试')
    err.status = 403
    throw err
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    const err = new Error(parseOssError(res.status, txt))
    err.status = res.status
    throw err
  }
  return res.blob()
}

/**
 * 判断云端对象是否存在（不发完整下载）。
 * 做法：GET 请求拿到响应后只读流的第一块就取消，
 * 避免为了「文件在不在」把几十上百 MB 的备份整个拉下来。
 * 返回三态（调用方必须区分「不存在」与「状态未知」，绝不能把未知当空）：
 *   true  = 确认存在
 *   false = 确认不存在（仅 404）
 *   null  = 状态未知（403 / 网络失败 / CORS 等，云端可能存在也可能不存在）
 */
export async function ossExists(cfg, path) {
  if (!ossReady(cfg)) return false
  const key = ossKeyOf(cfg, path)
  try {
    const url = await signedUrlOf(cfg, 'GET', key, null, '', 600)
    const res = await fetch(url, { method: 'GET' })
    if (res.status === 404) return false
    if (!res.ok) {
      try { if (res.body) await res.body.cancel() } catch (e) { /* ignore */ }
      return null // 403 / 5xx 等：存在与否无法判定
    }
    try {
      const reader = res.body.getReader()
      await reader.read()
      await reader.cancel()
    } catch (e) { /* 取消读取失败不影响存在性判断 */ }
    return true
  } catch (e) {
    return null // 请求本身失败：状态未知
  }
}

/**
 * 列出 OSS 对象（ListObjects V2）。
 * 返回 { keys: [{ key, size, lastModified }], isTruncated, nextContinuationToken }。
 * 用于「云端历史备份」浏览：列出 backup/archive/ 下被覆盖前自动留存的旧备份。
 * 错误语义与 ossDownload 一致：403（权限 / 本机时钟偏差）需与「目录为空」区分，
 * 绝不能把读不到当成「没有历史备份」。
 */
export async function ossList(cfg, prefix, continuationToken) {
  if (!ossReady(cfg)) throw new Error('阿里云 OSS 配置不完整（AccessKey / Bucket / 地域节点）')
  const params = { 'list-type': '2' }
  if (prefix) params['prefix'] = prefix
  if (continuationToken) params['continuation-token'] = continuationToken
  let url
  try {
    url = await signedUrlOf(cfg, 'GET', '', params, '', 600)
  } catch (e) {
    throw new Error('生成列举签名失败：' + (e.message || e))
  }
  let res
  try {
    res = await fetch(url, { method: 'GET' })
  } catch (e) {
    throw new Error('列举云端文件失败（网络异常或被 CORS 拦截，需在 OSS 控制台配置 CORS 规则）')
  }
  if (res.status === 403) {
    const err = new Error('无权读取云端文件（HTTP 403）：请检查 AccessKey 的读权限；若本机时间与标准时间偏差较大也会导致签名失效，请校准系统时间后重试')
    err.status = 403
    throw err
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(parseOssError(res.status, txt))
  }
  const xml = await res.text()
  return parseOssListXml(xml)
}

/* 解析 ListObjects V2 的 XML 响应（只取需要的字段） */
function parseOssListXml(xml) {
  const keys = []
  const re = /<Contents>([\s\S]*?)<\/Contents>/g
  let m
  while ((m = re.exec(xml))) {
    const block = m[1]
    const key = (/<Key>([\s\S]*?)<\/Key>/.exec(block) || [])[1] || ''
    const size = Number((/<Size>([\s\S]*?)<\/Size>/.exec(block) || [])[1] || 0)
    const lm = (/<LastModified>([\s\S]*?)<\/LastModified>/.exec(block) || [])[1] || ''
    keys.push({ key, size, lastModified: lm ? Date.parse(lm) : 0 })
  }
  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const nextToken = (/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml) || [])[1] || ''
  return { keys, isTruncated, nextContinuationToken: nextToken }
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
    // 上传成功：尝试删除探测文件
    try {
      const delUrl = await signedUrlOf(cfg, 'DELETE', key, null, '', 600)
      await fetch(delUrl, { method: 'DELETE' })
      return { ok: true, level: 'ok', message: '连接正常：上传与删除均成功' }
    } catch (e) {
      return { ok: true, level: 'write', message: '可上传，但删除失败（Bucket 可能未授权 DeleteObject）' }
    }
  } catch (e) {
    const msg = String(e.message || e)
    if (/CORS|Failed to fetch|NetworkError/i.test(msg)) {
      return { ok: false, level: 'cors', message: '请求被拦截：请在 OSS 控制台为 Bucket 配置 CORS（允许来源=当前站点，方法=PUT/DELETE/GET，允许 Headers=*）' }
    }
    return { ok: false, level: 'fail', message: msg }
  }
}
