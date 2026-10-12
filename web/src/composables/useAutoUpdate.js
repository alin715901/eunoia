import { onMounted, onUnmounted } from 'vue'

const SEEN_KEY = 'app_version_seen'
const CHECK_MS = 15000

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
        location.reload(true)
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
