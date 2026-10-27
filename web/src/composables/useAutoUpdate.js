import { onMounted, onUnmounted } from 'vue'

/* 60s：version.json 在慢链路下一次请求可能耗时数十秒，15s 轮询太吵；
   且部署不是分钟级敏感事，60s 足够及时 */
const CHECK_MS = 60 * 1000

/* version.json 必须用 BASE_URL 拼绝对路径：相对路径在深链接（如 /settings/oss）
   下会解析到 /settings/version.json 而 404，自动更新静默失效。 */
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`.replace(/\/{2,}/g, '/')

/**
 * 自动检测新版本：定期拉取 version.json（构建时由 scripts/version.mjs 写入 dist），
 * 与「当前页面文档自带的构建版本号」（构建时注入 index.html 的 meta）比较，
 * 不同就刷新页面以加载最新 bundle。
 *
 * 为什么用 meta 而不是 localStorage 记录已见版本：
 * 旧 bundle + index.html 的 HTTP 缓存（GitHub Pages max-age=600）会「半更新」——
 * reload 前把新版本号写进 localStorage，reload 后跑的仍旧代码，于是页面永远
 * 认为自己是最新的，再也收不到后续部署（死锁）。
 * meta 方案下版本号跟着文档走：旧文档必然带旧版本号，与 version.json 永远对不上。
 */
function bundleVersion() {
  const m = document.querySelector('meta[name="app-version"]')
  return m ? m.getAttribute('content') || '' : ''
}

/**
 * 探测「此刻真正能拿到的最新文档」自带的版本号。
 * 带一次性 query 绕开 SW 的 SWR 缓存与 HTTP 缓存，直接回源取文档本体
 * （GitHub Pages 对带 query 的同路径仍返回同一份 HTML；深链接路径返回
 * 404.html —— CI 里 cp 自 index.html，meta 一致，text() 照常可读）。
 */
async function probeFreshDocVersion() {
  const u = new URL(location.href)
  u.searchParams.set('__upd', String(Date.now()))
  const res = await fetch(u, { cache: 'no-store' })
  const html = await res.text()
  const m = html.match(/<meta\s+name="app-version"\s+content="([^"]*)"/i)
  return m ? m[1] : ''
}

/**
 * 发现新版本后的刷新动作——但刷新前必须先确认「现在刷过去真的能拿到新文档」：
 * GitHub Pages 部署有分钟级传播窗口，且 SW 导航回退（网络 10s 超时回落缓存）、
 * CDN/HTTP 缓存都可能让 reload 拿到的仍是旧文档。旧文档 meta 还是旧版本号，
 * 下一轮比对依旧「有新版本」→ 再 reload → 无限刷新循环（线上「页面每隔
 * 一分钟就自己刷一次」的根源）。
 * 因此：探测到的文档版本与 version.json 一致才 reload；否则本轮跳过，等下一轮。
 * 返回 true = 已触发刷新。
 */
async function reloadIfNewDocReady(server) {
  let fresh = ''
  try {
    fresh = await probeFreshDocVersion()
  } catch (e) {
    return false /* 探测失败：网络异常，本轮不刷 */
  }
  if (!fresh || fresh !== server) return false /* 上游还没就绪，刷了也白刷 */
  /* 新文档确认可取：先推一把 SW 更新，再刷新 */
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.update()
  } catch (e) { /* SW 不可用忽略，照常刷新 */ }
  location.reload()
  return true
}

/* 手动检查更新：返回 'updated'（已触发刷新）| 'latest'（已是最新）|
 * 'pending'（有新版本但上游尚未就绪）| 'error'（网络异常）。
 * 供「关于」页【检查更新】按钮使用，逻辑与生产环境自动轮询复用同一套。 */
export async function checkForUpdate() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' })
    if (!res.ok) return 'error'
    const data = await res.json()
    const server = data && data.v
    const mine = bundleVersion()
    if (!server || !mine) return 'error'
    if (server === mine) return 'latest'
    return (await reloadIfNewDocReady(server)) ? 'updated' : 'pending'
  } catch (e) {
    return 'error'
  }
}

export function useAutoUpdate() {
  let timer = null

  async function check() {
    try {
      const res = await fetch(VERSION_URL, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const server = data && data.v
      const mine = bundleVersion()
      if (!server || !mine) return
      if (server !== mine) await reloadIfNewDocReady(server)
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
