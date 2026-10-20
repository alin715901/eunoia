import { onMounted, onUnmounted } from 'vue'

/* 60s：version.json 在慢链路下一次请求可能耗时数十秒，15s 轮询太吵；
   且部署不是分钟级敏感事，60s 足够及时 */
const CHECK_MS = 60 * 1000

/**
 * 自动检测新版本：定期拉取 version.json（构建时由 scripts/version.mjs 写入 dist），
 * 与「当前页面文档自带的构建版本号」（构建时注入 index.html 的 meta）比较，
 * 不同就刷新页面以加载最新 bundle。
 *
 * 为什么用 meta 而不是 localStorage 记录已见版本：
 * 旧 bundle + index.html 的 HTTP 缓存（GitHub Pages max-age=600）会「半更新」——
 * reload 前把新版本号写进 localStorage，reload 后跑的仍旧代码，于是页面永远
 * 认为自己是最新的，再也收不到后续部署（死锁）。
 * meta 方案下版本号跟着文档走：旧文档必然带旧版本号，与 version.json 永远对不上，
 * 一定会触发刷新，任何缓存组合都不会死锁。
 */
function bundleVersion() {
  const m = document.querySelector('meta[name="app-version"]')
  return m ? m.getAttribute('content') || '' : ''
}

export function useAutoUpdate() {
  let timer = null

  async function check() {
    try {
      const res = await fetch('version.json', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const server = data && data.v
      const mine = bundleVersion()
      if (!server || !mine) return
      if (server !== mine) {
        /* 先强制 SW 更新（新 sw.js 若因自身 10 分钟缓存没到位，这里推一把），
           再以 reload 模式重新拉一次文档本身，刷新浏览器对 index.html 的缓存副本，
           最后 reload —— 否则 max-age=600 会让 reload 反复命中旧文档 */
        try {
          const reg = await navigator.serviceWorker?.getRegistration()
          if (reg) await reg.update()
        } catch (e) { /* SW 不可用忽略，照常走文档刷新 */ }
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
