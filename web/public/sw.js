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
   reload 模式绕过 HTTP 缓存真正联网，HTML 只占一次请求，代价可忽略。 */
const CACHE = 'eunoia-sw-v9'

/* SW 作用域根（如 https://xxx.github.io/eunoia/）——
   兜底取 index.html 必须用它拼相对路径：绝对 '/index.html' 指向站点根目录，
   缓存里根本没有这个键，深链接断网时会连兜底都失效。 */
const SCOPE_ROOT = self.registration && self.registration.scope
  ? self.registration.scope.replace(/\/*$/, '/')
  : './'
const INDEX_URL = SCOPE_ROOT + 'index.html'

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

  /* 导航（HTML）：network-first + 绕过 HTTP 缓存（cache:'reload'），失败回落缓存
     ——GitHub Pages index.html max-age=600，默认 fetch 会命中旧文档缓存，
     导致冷打开仍是旧 bundle；reload 模式强制联网拿最新 HTML */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'reload' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req).then((c) => c || caches.match(INDEX_URL)))
    )
    return
  }

  /* config.js：network-first，失败回落缓存 */
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  /* 其余同源 GET（导航 / JS / CSS / wasm 数据 chunk / 图标）：
     stale-while-revalidate——先返回缓存（如有），后台刷新 */
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached || caches.match(INDEX_URL))
      return cached || network
    })
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
