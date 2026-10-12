// Eunoia 音乐解析中转（Cloudflare Worker，免费额度 10 万请求/天）
//
// 背景：本地版没有服务端，浏览器直连网易云/酷狗的元数据接口会被 CORS 拦截；
//       且 fetch() 禁设 User-Agent / Referer 头（会被浏览器静默丢弃），
//       所以这些头必须由本 worker 按目标站点代设。
//
// 用法：GET  /?url=<encodeURIComponent(目标URL)>
//   - 流式透传响应体（音频/HTML/JSON 都不会整块缓冲）
//   - 响应带 X-Final-Url：上游跟随重定向后的最终地址
//     （163cn.tv 短链展开依赖它，浏览器 fetch 的 res.url 此时只是 worker 地址）
//   - 全程 CORS 放开，OPTIONS 预检直接放行
//
// 不含任何鉴权/计费逻辑：只转发 GET，免费额度对个人自用绰绰有余。
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400'
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'GET') {
      return json({ code: 1, msg: '只支持 GET 请求' }, 405, cors)
    }

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
    // Workers 的 fetch() 只支持 https 子请求，http:// 明文会直接挂起：
    // 音乐站（网易云/酷狗）全都有 https，统一升级；其它站点极少走到这里。
    if (targetUrl.protocol === 'http:') targetUrl.protocol = 'https:'
    if (targetUrl.protocol !== 'https:') {
      return json({ code: 1, msg: '只支持 https 协议' }, 400, cors)
    }

    const headers = new Headers()
    headers.set('User-Agent', pickUA(targetUrl.hostname))
    const referer = pickReferer(targetUrl.hostname)
    if (referer) headers.set('Referer', referer)
    // 接受编码透传：上游返回 gzip/br 时 Cloudflare 会正确解压再按客户端支持重压
    const accept = request.headers.get('Accept')
    if (accept) headers.set('Accept', accept)

    try {
      const upstream = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers,
        redirect: 'follow'
      })

      const out = new Headers(cors)
      const contentType = upstream.headers.get('content-type')
      if (contentType) out.set('content-type', contentType)
      const contentLength = upstream.headers.get('content-length')
      if (contentLength) out.set('content-length', contentLength)
      // 上游最终地址（跟随重定向后）——短链展开等场景依赖
      out.set('X-Final-Url', upstream.url || targetUrl.toString())

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: out
      })
    } catch (e) {
      return json({ code: 1, msg: '上游请求失败：' + String((e && e.message) || e) }, 502, cors)
    }
  }
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(extra || {}) }
  })
}

/* 各音乐站点的 UA / Referer 策略：
   与前端 music.service.js 里用的保持一致（iPhone UA），
   酷狗部分接口对 UA 敏感，网易云 player/url 与 lyric 接口校验 Referer。 */
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

function pickUA(host) {
  if (/(^|\.)kugou\.com$/.test(host) || /(^|\.)163\.com$/.test(host) || /(^|\.)163cn\.tv$/.test(host)) {
    return MOBILE_UA
  }
  // 其它未知站点给个常见桌面 UA，避免被默认策略拦截
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
}

function pickReferer(host) {
  if (/(^|\.)163\.com$/.test(host) || /(^|\.)163cn\.tv$/.test(host)) return 'https://music.163.com/'
  if (/(^|\.)kugou\.com$/.test(host)) return 'https://www.kugou.com/'
  return ''
}
