/* Eunoia 本地音乐中转 —— 在你自己电脑上运行，用于「导入时能拿到播放直链」
 *
 * 为什么需要它：
 *   App 现在是纯前端，浏览器不能直接请求网易云/酷狗（CORS 限制），所以必须经中转。
 *   云端中转（Cloudflare）出口在境外，网易云/酷狗不给境外 IP 返回音频链接，
 *   导致导入的歌没声音。把这个中转跑在你自己电脑上，出口就是你的宽带 IP（境内），
 *   接口会正常返回播放直链。
 *
 * 用法（Node 18+，无需安装任何依赖）：
 *   node server.js                # 默认监听 127.0.0.1:8787
 *   node server.js --port=9000    # 换端口
 *   node server.js --lan          # 监听 0.0.0.0（同局域网其他设备可访问）
 * 启动后在 App「设置 → 音乐 → 解析服务」里填 http://127.0.0.1:8787 即可。
 *
 * 契约与云端中转完全一致：GET /?url=<encodeURIComponent(目标地址)>
 */
const http = require('http')
const { Readable } = require('stream')

const argv = process.argv.slice(2)
const getArg = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : def
}
const PORT = Number(getArg('port', process.env.PORT || 8787)) || 8787
const LAN = argv.includes('--lan')
const HOST = LAN ? '0.0.0.0' : '127.0.0.1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
}

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const pickUA = (host) =>
  /(^|\.)(kugou\.com|163\.com|163cn\.tv)$/.test(host) ? MOBILE_UA : DESKTOP_UA
const pickReferer = (host) => {
  if (/(^|\.)(163\.com|163cn\.tv)$/.test(host)) return 'https://music.163.com/'
  if (/(^|\.)kugou\.com$/.test(host)) return 'https://www.kugou.com/'
  return ''
}
/* 网易云 player/url 系列要求带 Cookie，否则返回 url:null */
const pickCookie = (host) =>
  /(^|\.)(163\.com|163cn\.tv)$/.test(host) ? 'os=pc;appver=8.9.70' : ''

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...CORS
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }
  if (req.method !== 'GET') return sendJson(res, 405, { code: 1, msg: '只支持 GET 请求' })

  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const target = u.searchParams.get('url')
  if (!target) {
    return sendJson(res, 400, {
      code: 1,
      msg: '缺少 url 参数。用法：GET /?url=' + encodeURIComponent('https://music.163.com/api/song/detail?id=1')
    })
  }

  let t
  try {
    t = new URL(target)
  } catch (e) {
    return sendJson(res, 400, { code: 1, msg: 'url 参数不是合法的地址' })
  }
  if (t.protocol === 'http:') t.protocol = 'https:'
  if (t.protocol !== 'https:') return sendJson(res, 400, { code: 1, msg: '只支持 https 协议' })

  const headers = {}
  headers['User-Agent'] = pickUA(t.hostname)
  const referer = pickReferer(t.hostname)
  if (referer) headers.Referer = referer
  const cookie = pickCookie(t.hostname)
  if (cookie) headers.Cookie = cookie
  if (req.headers.accept) headers.Accept = req.headers.accept

  try {
    const upstream = await fetch(t.toString(), { method: 'GET', headers, redirect: 'follow' })
    const out = { ...CORS }
    const ct = upstream.headers.get('content-type')
    if (ct) out['content-type'] = ct
    const cl = upstream.headers.get('content-length')
    if (cl) out['content-length'] = cl
    out['X-Final-Url'] = upstream.url || t.toString()

    res.writeHead(upstream.status, out)
    if (!upstream.body) return res.end()
    Readable.fromWeb(upstream.body).pipe(res)
  } catch (e) {
    sendJson(res, 502, { code: 1, msg: '上游请求失败：' + String((e && e.message) || e) })
  }
})

server.listen(PORT, HOST, () => {
  const show = LAN ? '<你的电脑IP>' : '127.0.0.1'
  console.log('')
  console.log('  Eunoia 本地音乐中转已启动')
  console.log(`  地址：http://${show}:${PORT}`)
  console.log('  在 App「设置 → 音乐 → 解析服务」里填入上面的地址即可')
  console.log('  导入完歌曲后可以关掉（播放用的是已存的地址，不需要它常驻）')
  console.log('  按 Ctrl + C 停止')
  console.log('')
})
