import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { initDb } from './local/db'
import { startTicks } from './local/ticks'
import './styles/theme.css'
import './styles/animations.css'
import './styles/module.css'

// 本地版：先等 sql.js 数据库就绪（建表/读档 + 种子），再挂载应用。
// 之后所有仓库/服务都同步取用 db，无需关心初始化时机。
// （运行时配置在 index.html 里以 <script src="./config.js"> 先行加载，见 window.__EUNOIA_CONFIG__）
initDb()
  .then(() => {
    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.mount('#app')
    // 启动前端调度器：主动消息 / 朋友圈 / 信件 / 来电 / 红包等定时逻辑（原服务端 cron）
    startTicks()
  })
  .catch((e) => {
    console.error('[main] 本地数据库初始化失败', e)
    document.body.innerHTML =
      '<div style="padding:40px;font-family:sans-serif;color:#b5392a">' +
      '<h2>数据初始化失败</h2><p>请刷新页面重试；若多次失败，可能是浏览器存储被禁用。</p></div>'
  })
