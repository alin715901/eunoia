/* Eunoia Service Worker
   作用：GitHub Pages CDN 链路慢且对 .wasm 卡流，SW 对同源静态资源做
   stale-while-revalidate：二次访问瞬间返回缓存并后台刷新，弱网/断网
   可回落缓存打开。
   导航（HTML）例外——必须 network-first：HTML 若走 SWR，部署后旧缓存
   index.html 会引用已被删除的旧 hash chunk（JS/CSS 404），轻则白屏
   重则 App 起不来（没有 JS 跑自动更新，永久卡死）。HTML 只占一次请求，
   网络优先的代价可忽略；断网才回落缓存打开。
   版本切换：useAutoUpdate 定期以 no-store 拉 version.json，发现新部署
   即 reload；reload 时 SW 缓存已被后台刷新覆盖，无缝拿到新包。
   设计取舍：
   - install 不做 addAll 预缓存：慢链路下任一资源卡住都会让 install
     挂起、SW 迟迟不激活。改为 install 立即 skipWaiting，资源在首次
     fetch 时按需进缓存（首访末段 + 二访起全部命中）。
   - version.json 不缓存：使用方本就 no-store 拉取，保证版本检测灵敏。
   - config.js：运行时配置，network-first，失败回落缓存。
   冷打开防旧版：导航 fetch 必须带 cache:'reload'——GitHub Pages 的
   index.html 带 max-age=600，SW 里默认模式的 fetch 会命中浏览器 HTTP
   缓存返回旧 HTML（旧 bundle → 旧样式/旧逻辑，用户侧表现为「改了没生效」）。
   reload 模式绕过 HTTP 缓存真正联网，HTML 只占一次请求，代价可忽略。

   ── v10 兼容性加固（iOS Safari / iOS Chrome 报错页修复）──
   症状：Safari「FetchEvent.respondWith received an error: Returned
   response is null」、Chrome「无法访问此网站 ERR_FAILED」，重大更新后
   偶发。根因：respondWith 的 Promise 在「网络失败 + 缓存为空」时解析成
   undefined——规范视为 null response，浏览器直接渲染错误页。缓存为空的
   常见诱因：iOS ITP 对 7 天未用的站点清掉 SW 缓存、Safari 隐私模式
   caches API 异常、首访未完成即断网。修复原则：fetch 拦截器返回的
   Promise 永远 resolve 成一个真实 Response（缓存 → 兜底 → 离线页），
   绝不 resolve undefined；caches API 全部 try/catch 包裹（隐私模式
   可能 throw）；导航网络请求加超时（弱网 hanging 时尽快回落缓存，
   而不是挂着转圈最后报错）。 */
const CACHE = 'eunoia-sw-v10'

/* SW 作用域根（如 https://xxx.github.io/eunoia/）——
   兜底取 index.html 必须用它拼相对路径：绝对 '/index.html' 指向站点根目录，
   缓存里根本没有这个键，深链接断网时会连兜底都失效。 */
const SCOPE_ROOT = self.registration && self.registration.scope
  ? self.registration.scope.replace(/\/*$/, '/')
  : './'
const INDEX_URL = SCOPE_ROOT + 'index.html'

/* ── 兜底工具：任何浏览器、任何存储状态下都不抛错、不返回空 ── */

/* 缓存读取：caches API 在 Safari 隐私模式 / 存储被清时可能 throw，
   全部吞掉返回 null。依次匹配：精确请求 → 索引页 */
async function matchAny(req) {
  try {
    const hit = await caches.match(req)
    if (hit) return hit
  } catch (e) { /* ignore */ }
  try {
    const hit = await caches.match(INDEX_URL)
    if (hit) return hit
  } catch (e) { /* ignore */ }
  return null
}

/* 写缓存：配额满 / 隐私模式失败都不影响主流程 */
function safePut(req, res) {
  try {
    const copy = res.clone()
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
  } catch (e) { /* ignore */ }
}

/* 带超时的 fetch：失败/超时 resolve null（不 reject，简化下游逻辑）。
   GitHub Pages 在部分移动网络下会长时间 hanging，导航挂着不动比失败
   更伤体验——超时后立即走缓存回落 */
function fetchWithTimeout(req, ms, opts) {
  return new Promise((resolve) => {
    let settled = false
    let ctl = null
    try { ctl = new AbortController() } catch (e) { /* 老浏览器无 AbortController */ }
    const timer = setTimeout(() => {
      if (!settled && ctl) { try { ctl.abort() } catch (e) { /* ignore */ } }
    }, ms)
    const init = Object.assign({}, opts || {})
    if (ctl) init.signal = ctl.signal
    fetch(req, init)
      .then((res) => { settled = true; clearTimeout(timer); resolve(res) })
      .catch(() => { settled = true; clearTimeout(timer); resolve(null) })
  })
}

/* 离线兜底页：缓存全空 + 断网时也不让浏览器渲染错误页。
   5 秒后自动重试一次联网；页内提供手动重试按钮 */
const OFFLINE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Eunoia · 网络开小差了</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;
background:#faf9f7;color:#5a5248;text-align:center}
.box{padding:32px}.e{font-size:52px;margin-bottom:16px}
h1{font-size:17px;font-weight:600;margin:0 0 8px}
p{font-size:13px;color:#9a9186;margin:0 0 20px}
button{border:0;border-radius:20px;padding:9px 26px;font-size:14px;
background:#8a7f6f;color:#fff}
</style></head><body><div class="box"><div class="e">🌙</div>
<h1>网络开小差了</h1><p>正在尝试重新连接…<br>若长时间无响应，请检查网络后再试</p>
<button onclick="location.reload()">重试</button></div>
<script>setTimeout(function(){location.reload()},5000)</script>
</body></html>`

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  /* version.json：使用方 no-store 拉取，SW 不拦不缓存 */
  if (url.pathname.endsWith('/version.json')) return

  /* 导航（HTML）：network-first + 绕过 HTTP 缓存（cache:'reload'），失败回落缓存，
     缓存也没有 → 离线页。respondWith 永远拿到真实 Response（v10 修复 null response） */
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const net = await fetchWithTimeout(req, 10000, { cache: 'reload' })
        if (net) {
          if (net.ok) {
            safePut(req, net)
            return net
          }
          /* 服务器有响应但非 2xx：GitHub Pages 对深链接本就以 404 状态回
             SPA 兜底内容（页面能用），404 直接放行；5xx 尝试回落缓存 */
          if (net.status === 404) return net
          const cached = await matchAny(req)
          return cached || net
        }
        const cached = await matchAny(req)
        if (cached) return cached
        return offlineResponse()
      })()
    )
    return
  }

  /* config.js：network-first，失败回落缓存，再不行给空 JS（不能返回 null） */
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(
      (async () => {
        const net = await fetchWithTimeout(req, 8000)
        if (net && net.ok) {
          safePut(req, net)
          return net
        }
        let cached = null
        try { cached = await caches.match(req) } catch (e) { /* ignore */ }
        if (cached) return cached
        if (net) return net
        return new Response('/* offline: config fallback */', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' }
        })
      })()
    )
    return
  }

  /* 其余同源 GET（JS / CSS / wasm 数据 chunk / 字体 / 图标）：
     stale-while-revalidate——先返回缓存（如有），后台刷新。
     缓存缺失走网络；网络也失败给 504 空响应（绝不返回 null，
     让页面自身的资源加载错误处理接管，而不是浏览器级报错页）。
     注意子资源不回落 index.html——HTML 当 JS/CSS 加载只会更糟 */
  event.respondWith(
    (async () => {
      let hit = null
      try { hit = await caches.match(req) } catch (e) { /* ignore */ }
      if (hit) {
        fetchWithTimeout(req, 15000).then((res) => { if (res && res.ok) safePut(req, res) })
        return hit
      }
      const net = await fetchWithTimeout(req, 15000)
      if (net) {
        if (net.ok) safePut(req, net)
        return net
      }
      return new Response('', { status: 504, statusText: 'Offline' })
    })()
  )
})

/* ── 通知点击：唤醒 / 打开应用并跳转到对应会话 ──
   本站无真实推送后端（纯静态 + 本地模拟消息），但用户点系统通知必须
   能把应用带回前台并定位到对应聊天，否则点了毫无反应。
   已有窗口则聚焦 + 发消息让前端路由跳转；无窗口则新开。 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const route = data.route || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'NOTIFICATION_NAVIGATE', route })
          return c.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(route)
    })
  )
})

/* ── 真实 Web Push（预留，当前不触发）──
   本站是纯静态部署，没有带 VAPID 的推送后端，也无 pushManager 订阅，
   因此此分支不会触发。若未来接入推送服务，消息经 FCM/APNs 下发到 SW 后
   在此弹出——届时即便 App 已彻底关闭也能收到系统通知。 */
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch (e) { /* ignore */ }
  const options = {
    body: payload.body || '',
    icon: SCOPE_ROOT + 'icon-192.png',
    badge: SCOPE_ROOT + 'icon-192.png',
    tag: payload.tag || 'eunoia-push',
    data: payload.data || {}
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Eunoia', options))
})
