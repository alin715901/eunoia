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
   - config.js：运行时配置，network-first，失败回落缓存。 */
const CACHE = 'eunoia-sw-v2'

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

  /* 导航（HTML）：network-first，失败回落缓存——杜绝旧缓存 HTML 引用
     已下线的旧 hash chunk 导致的白屏/卡死 */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/index.html')))
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
        .catch(() => cached || caches.match('/index.html'))
      return cached || network
    })
  )
})
