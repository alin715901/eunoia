import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { dbReady } from './local/db'
import { startTicks } from './local/ticks'
import './styles/theme.css'
import './styles/animations.css'
import './styles/module.css'

// 本地版：立即挂载应用（App.vue 在 dbReady 前显示骨架屏），
// 数据库在后台并行初始化；就绪后 App.vue 的 dbReady.then 会加载各 store。
// 这样首屏时间只取决于 JS 下载，wasm 下载与 db init 与骨架屏重叠。
// （运行时配置在 index.html 里以 <script src="./config.js"> 先行加载，见 window.__EUNOIA_CONFIG__）
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// 数据库就绪后再启动前端调度器（主动消息 / 朋友圈 / 信件 / 来电 / 红包等定时逻辑，原服务端 cron）
dbReady
  .then(() => startTicks())
  .catch((e) => {
    // App.vue 已展示错误页与重试入口，这里只留日志
    console.error('[main] 本地数据库初始化失败', e)
  })

/* 开发环境的自动化测试钩子（生产构建会被完全剔除）：
 * E2E 脚本需要拿到「应用正在用的那个」db / api 实例。
 * 若在 page.evaluate 里写 import('/src/local/db.js')，Vite dev 会当成另一个模块实例
 * 重新初始化一份数据库（读到的是 IndexedDB 旧快照），测出来的结论是假的。
 * 这里通过 main.js 的模块图（与业务代码同一批实例）挂到 window 上，仅 DEV 生效。 */
if (import.meta.env.DEV) {
  Promise.all([
    import('./local/db.js'),
    import('./local/api.js'),
    import('./local/services/backup.service.js')
  ]).then(([dbm, api, backupService]) => {
    window.__eunoia = { db: dbm.default, dbm, api, backupService }
  })
}

// Service Worker：缓存同源静态资源，二次访问瞬间打开（GitHub Pages 链路慢的对策）。
// 直接注册（不等 load 事件：慢链路上 load 可能迟迟不来或时机不可靠）。
// 用 BASE_URL 拼绝对路径：相对路径在深链接（如 /settings/oss）下会解析到
// /settings/sw.js 而注册失败，SW 就接管不了缓存与通知跳转。
if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`.replace(/\/{2,}/g, '/')
  navigator.serviceWorker.register(swUrl)
    .then(() => console.log('[sw] 注册成功'))
    .catch((e) => console.warn('[sw] 注册失败（不影响使用）:', e && e.message))

  // 接收 SW 消息（如通知点击要求跳转会话）：点击系统通知时 SW 已聚焦窗口
  // 并 postMessage，这里据此路由到对应页面。
  navigator.serviceWorker.addEventListener('message', (event) => {
    const d = event.data
    if (d && d.type === 'NOTIFICATION_NAVIGATE' && d.route) {
      router.push(d.route).catch(() => {})
    }
  })
}
