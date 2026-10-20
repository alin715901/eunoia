import { onMounted, onUnmounted } from 'vue'

const SEEN_KEY = 'app_version_seen'
/* 60s：version.json 在慢链路下一次请求可能耗时数十秒，15s 轮询太吵；
   且部署不是分钟级敏感事，60s 足够及时 */
const CHECK_MS = 60 * 1000

/**
 * 自动检测新版本：定期拉取 version.json（构建时由 scripts/version.mjs 写入 dist），
 * 若与本地记录不同（说明部署了新版本）就刷新页面以加载最新 bundle。
 * 首次加载只记下当前版本，不刷新。
 * 用相对路径：GitHub Pages 子路径部署下同样有效。
 */
export function useAutoUpdate() {
  let timer = null

  async function check() {
    try {
      const res = await fetch('version.json', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const server = data && data.v
      if (!server) return
      const seen = localStorage.getItem(SEEN_KEY)
      if (!seen) {
        localStorage.setItem(SEEN_KEY, server)
        return
      }
      if (server !== seen) {
        localStorage.setItem(SEEN_KEY, server)
        /* GitHub Pages 给 index.html 的是 max-age=600，普通 reload 会反复命中旧文档缓存，
           导致新 bundle 迟迟不生效。先以 reload 模式重新拉一次文档本身刷新缓存副本，
           再 reload，才能保证拿到引用新 bundle 的 index.html。 */
        try { await fetch(location.href, { cache: 'reload' }) } catch (e) { /* 网络异常忽略，照常 reload */ }
        location.reload()
      }
    } catch (e) {
      /* 网络异常忽略，下次再查 */
    }
  }

  onMounted(() => {
    check()
    timer = setInterval(check, CHECK_MS)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })
}
