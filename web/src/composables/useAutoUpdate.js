import { onMounted, onUnmounted } from 'vue'
import { isWebView } from '@/utils/env'

/* 60s：version.json 在慢链路下一次请求可能耗时数十秒，15s 轮询太吵；
   且部署不是分钟级敏感事，60s 足够及时 */
const CHECK_MS = 60 * 1000

/* version.json 必须用 BASE_URL 拼绝对路径：相对路径在深链接（如 /settings/oss）
   下会解析到 /settings/version.json 而 404，自动更新静默失效。 */
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`.replace(/\/{2,}/g, '/')

/* 自动更新总开关：localStorage 显式选择优先；未设置时浏览器默认开、套壳 WebView
   默认关（WebView 里 location.reload + SW 导航超时极易陷入「白屏卡死 + 反复重刷」，
   关闭后由用户手动刷新/重开 App 来更新，体验更稳）。 */
const AUTO_KEY = 'eunoia.autoUpdate'
/* 两次强制刷新最小间隔：弱网/缓存错位下的兜底，防无限重刷 */
const LAST_RELOAD_KEY = 'eunoia.lastReloadAt'
const MIN_RELOAD_GAP_MS = 5 * 60 * 1000

function bundleVersion() {
  const m = document.querySelector('meta[name="app-version"]')
  return m ? m.getAttribute('content') || '' : ''
}

export function isAutoUpdateEnabled() {
  try {
    const v = localStorage.getItem(AUTO_KEY)
    if (v === '0' || v === '1') return v === '1'
  } catch (e) { /* ignore */ }
  return !isWebView()
}

export function setAutoUpdate(on) {
  try { localStorage.setItem(AUTO_KEY, on ? '1' : '0') } catch (e) { /* ignore */ }
}

/**
 * 探测「此刻真正能拿到的最新文档」自带的版本号。
 * 带一次性 query 绕开 SW 的 SWR 缓存与 HTTP 缓存，直接回源取文档本体
 * （GitHub Pages 对带 query 的同路径仍返回同一份 HTML；深链接路径返回
 * 404.html —— CI 里 cp 自 index.html，meta 一致，text() 照常可读）。
 * 加 8s 超时：套壳 WebView 弱网下网络请求可能久久不回，绝不能让它卡住主流程。
 */
async function probeFreshDocVersion() {
  const u = new URL(location.href)
  u.searchParams.set('__upd', String(Date.now()))
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(u, { cache: 'no-store', signal: ctrl.signal })
    const html = await res.text()
    const m = html.match(/<meta\s+name="app-version"\s+content="([^"]*)"/i)
    return m ? m[1] : ''
  } catch (e) {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 发现新版本后的刷新动作——但刷新前必须先确认「现在刷过去真的能拿到新文档」：
 * GitHub Pages 部署有分钟级传播窗口，且 SW 导航回退（网络 10s 超时回落缓存）、
 * CDN/HTTP 缓存都可能让 reload 拿到的仍是旧文档。旧文档 meta 还是旧版本号，
 * 下一轮比对依旧「有新版本」→ 再 reload → 无限刷新循环（线上「页面每隔
 * 一分钟就自己刷一次」的根源）。
 * 因此：探测到的文档版本与 version.json 一致才 reload；否则本轮跳过，等下一轮。
 * 另加 5 分钟最小间隔硬兜底，即使探测逻辑在极端环境也失准也不会无限重刷。
 * 返回 true = 已触发刷新。
 */
async function reloadIfNewDocReady(server) {
  /* 防抖：距上次强制刷新不足 5 分钟则跳过（套壳 APK 弱网时避免无限重刷白屏） */
  try {
    const last = Number(localStorage.getItem(LAST_RELOAD_KEY) || '0')
    if (Date.now() - last < MIN_RELOAD_GAP_MS) return false
  } catch (e) { /* ignore */ }

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

  try { localStorage.setItem(LAST_RELOAD_KEY, String(Date.now())) } catch (e) { /* ignore */ }
  location.reload()
  return true
}

/**
 * 手动检查更新：返回 'updated'（已触发刷新）| 'latest'（已是最新）|
 * 'pending'（有新版本但上游尚未就绪，或已关闭自动更新仅通知）| 'error'（网络异常）。
 * 供「关于」页【检查更新】按钮使用，逻辑与生产环境自动轮询复用同一套。
 */
export async function checkForUpdate() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' })
    if (!res.ok) return 'error'
    const data = await res.json()
    const server = data && data.v
    const mine = bundleVersion()
    if (!server || !mine) return 'error'
    if (server === mine) return 'latest'
    /* 自动更新关闭时：不强制重刷，仅广播「有新版本」让页面弹出手动刷新提示 */
    if (!isAutoUpdateEnabled()) {
      window.dispatchEvent(new CustomEvent('eunoia:update-available'))
      return 'pending'
    }
    return (await reloadIfNewDocReady(server)) ? 'updated' : 'pending'
  } catch (e) {
    return 'error'
  }
}

export function useAutoUpdate() {
  let timer = null

  async function check() {
    if (!isAutoUpdateEnabled()) return
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
