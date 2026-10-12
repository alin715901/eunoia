/* Eunoia 音乐解析中转 —— Cloudflare Pages Functions 版
 *
 * 与 workers/music-proxy.js 逻辑完全一致，只是按 Pages Functions 的签名导出。
 * 用途：workers.dev 域名在部分地区被 DNS 污染，改用 Pages 提供的 *.pages.dev 域名。
 *
 * 契约不变：GET /?url=<encodeURIComponent(目标URL)>
 *   - 流式透传响应体
 *   - 响应带 X-Final-Url（短链展开依赖）
 *   - 全程放开 CORS，OPTIONS 预检直接放行
 */
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

function pickUA(host) {
  if (/(^|\.)kugou\.com$/.test(host) || /(^|\.)163\.com$/.test(host) || /(^|\.)163cn\.tv$/.test(host)) {
    return MOBILE_UA
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
}

function pickReferer(host) {
  if (/(^|\.)163\.com$/.test(host) || /(^|\.)163cn\.tv$/.test(host)) return 'https://music.163.com/'
  if (/(^|\.)kugou\.com$/.test(host)) return 'https://www.kugou.com/'
  return ''
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(extra || {}) }
  })
}

export async function onRequestGet(context) {
  const request = context.request
  const reqUrl = new URL(request.url)
  const target = reqUrl.searchParams.get('url')
  if (!target) {
    return json(
      { code: 1, msg: '缺少 url 参数。用法：GET /?url=' + encodeURIComponent('https://music.163.com/api/song/detail?id=1') },
      400,
      cors
    )
  }

  let targetUrl
  try {
    targetUrl = new URL(target)
  } catch (e) {
    return json({ code: 1, msg: 'url 参数不是合法的地址' }, 400, cors)
  }
  if (targetUrl.protocol === 'http:') targetUrl.protocol = 'https:'
  if (targetUrl.protocol !== 'https:') return json({ code: 1, msg: '只支持 https 协议' }, 400, cors)

  const headers = new Headers()
  headers.set('User-Agent', pickUA(targetUrl.hostname))
  const referer = pickReferer(targetUrl.hostname)
  if (referer) headers.set('Referer', referer)
  const accept = request.headers.get('Accept')
  if (accept) headers.set('Accept', accept)

  try {
    const upstream = await fetch(targetUrl.toString(), { method: 'GET', headers, redirect: 'follow' })
    const out = new Headers(cors)
    const contentType = upstream.headers.get('content-type')
    if (contentType) out.set('content-type', contentType)
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) out.set('content-length', contentLength)
    out.set('X-Final-Url', upstream.url || targetUrl.toString())
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
  } catch (e) {
    return json({ code: 1, msg: '上游请求失败：' + String((e && e.message) || e) }, 502, cors)
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors })
}
