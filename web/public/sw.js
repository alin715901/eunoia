/* Eunoia Service Worker
   作用：GitHub Pages CDN 在部分网络下链路慢（实测 ~10KB/s），首次访问
   首屏资源下载耗时占比 95%。SW 对同源静态资源做 stale-while-revalidate：
   二次访问瞬间返回缓存，同时后台刷新保持一致。
   版本切换：useAutoUpdate 每 15s 以 no-store 拉 version.json 检测新部署，
   发现变化即 reload——reload 后 SW 缓存此时已被后台刷新覆盖，无缝拿到新包。
   注意：version.json / config.js 不在此缓存策略内特殊处理——version.json
   的请求方本就带 no-store；config.js 体积小且可能被运行时修改，走网络即可
   （失败时回落缓存，避免断网时配置缺失）。 */
const CACHE = 'eunoia-sw-v1'
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => {})
  )
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

  /* version.json：使用方的 no-store 请求不读 SW 缓存，这里也不主动缓存，
     避免任何路径下读到旧版本号导致自动更新失灵 */
  if (url.pathname.endsWith('/version.json')) return

  /* config.js：运行时配置，network-first，失败回落缓存 */
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  /* 其余同源 GET（index.html / 资产 / 图标）：stale-while-revalidate */
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
        .catch(() => cached)
      return cached || network
    })
  )
})
