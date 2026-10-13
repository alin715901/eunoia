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

// Service Worker：缓存同源静态资源，二次访问瞬间打开（GitHub Pages 链路慢的对策）。
// 相对路径注册，GitHub Pages /<仓库名>/ 子路径部署同样有效。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 注册失败（如 http 环境）静默忽略，不影响首次访问 */
    })
  })
}
