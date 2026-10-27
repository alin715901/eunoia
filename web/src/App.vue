<template>
  <div class="app-root">
    <!-- 数据库就绪前：骨架屏（JS 下载完即显示，wasm/init 在后台跑） -->
    <div v-if="!dbOk && !dbErr" class="frame boot-frame">
      <div class="screen boot-screen">
        <BootBrand />
        <!-- 进度条：与真实加载进度绑定，满格即数据就绪进入应用 -->
        <div
          class="boot-progress"
          role="progressbar"
          aria-label="加载进度"
          :class="{ stalled: bootStalled }"
          :aria-valuenow="bootProgress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span ref="bootBar" class="boot-progress-bar" :style="{ width: bootProgress + '%' }"></span>
        </div>
        <!-- 提示语轮播：首次开屏时间较长，几条实用提示轮流显示 -->
        <Transition name="boot-fade" mode="out-in">
          <div class="boot-text" :key="bootMsgIdx">{{ bootMsgs[bootMsgIdx] }}</div>
        </Transition>
      </div>
    </div>
    <!-- 数据库初始化失败：错误页 + 重试 -->
    <div v-else-if="dbErr" class="frame boot-frame">
      <div class="screen boot-screen">
        <BootBrand />
        <div class="boot-text boot-err-text">数据初始化失败</div>
        <div class="boot-tip">可能是网络不佳导致组件加载失败，请重试</div>
        <button class="boot-retry" @click="reload">重新加载</button>
      </div>
    </div>
    <template v-else>
      <!-- 主内容：桌面端 = 左侧导航 + 右侧内容（两栏宽屏）；移动端 = 单内容（手机壳） -->
      <div class="shell">
        <SideNav />
        <AppContent />
      </div>
    </template>

    <Toast />
    <ConfirmDialog />

    <!-- 备忘录待办提醒（提醒人选「无」）：屏幕中间的系统弹窗，独立于路由 -->
    <MemoReminderDialog />

    <!-- 首次进入的使用须知：勾选同意后写入本机标记，之后不再弹出 -->
    <NoticeDialog v-if="showNotice" @enter="onNoticeEnter" />

    <!-- 全局通话组件：独立于路由，跨页面保持（主叫/来电/通话中/可拖动悬浮窗） -->
    <CallOverlay />

    <!-- 全局音乐悬浮窗：独立于路由，跨页面常驻 -->
    <MusicFloat />

    <!-- 全局歌词页：独立于路由，全屏覆盖 -->
    <MusicLyrics />

    <!-- 全局「有新版本」提示条：自动更新关闭（套壳 APK 默认）时，探测到新版本
         只通知不强制重刷，用户点一下才刷新——避免白屏卡死与反复重刷 -->
    <Transition name="up-banner">
      <div v-if="showUpdateBanner" class="up-banner" @click="applyUpdate">
        <span class="up-dot" />发现新版本，点击更新
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import BootBrand from '@/components/layout/BootBrand.vue'
import SideNav from '@/components/layout/SideNav.vue'
import AppContent from '@/components/layout/AppContent.vue'
import Toast from '@/components/common/Toast.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import MemoReminderDialog from '@/components/common/MemoReminderDialog.vue'
import NoticeDialog from '@/components/common/NoticeDialog.vue'
import CallOverlay from '@/components/chat/CallOverlay.vue'
import MusicFloat from '@/components/music/MusicFloat.vue'
import MusicLyrics from '@/components/music/MusicLyrics.vue'
import { connect, disconnect } from '@/composables/useSSE'
import { useAutoUpdate } from '@/composables/useAutoUpdate'
import { requestNotificationPermission } from '@/composables/useNotification'
import { dbReady, onDbProgress } from '@/local/db'
import { useSettingsStore } from '@/stores/settings'
import { useContactsStore } from '@/stores/contacts'
import { useCompanionStore } from '@/stores/companion'
import { useMusicStore } from '@/stores/music'
import { useDesktopStore } from '@/stores/desktop'
import { useKeepAlive } from '@/composables/useKeepAlive'

const settings = useSettingsStore()
const contactsStore = useContactsStore()
const desktop = useDesktopStore()

/* 数据库就绪状态：就绪前显示骨架屏，失败显示错误页 */
const dbOk = ref(false)
const dbErr = ref(false)

/* 开屏进度条：db 初始化各阶段 0-100，就绪后满格并稍停片刻再进入应用。
   起步值 52 = index.html 静态骨架动画的终点：挂载瞬间无缝衔接静态条，
   之后单调向右（Math.max 兜底），杜绝「跑到一半缩回去重跑」 */
const bootProgress = ref(52)
const bootBar = ref(null)
let offDbProgress = null
let firstProgress = true
onMounted(() => {
  offDbProgress = onDbProgress((p) => {
    /* 挂载即就绪（缓存命中/秒开）时，首次回报可能已是 100：先按 52% 渲染，
       下一帧再放到真实进度 —— 用户看到的是条从静态骨架的 52% 平滑涨满，
       而不是瞬间跳满（那一眼就会觉得「进度条造假/没满就进了」） */
    if (firstProgress) {
      firstProgress = false
      bootProgress.value = Math.max(52, Math.min(p, 52))
      requestAnimationFrame(() => { bootProgress.value = Math.max(52, p) })
      return
    }
    bootProgress.value = Math.max(52, p)
  })
})
onUnmounted(() => { if (offDbProgress) { offDbProgress(); offDbProgress = null } })

/* 自动更新关闭（套壳 APK 默认）时，探测到新版本只广播该事件；这里弹出可点击的
   更新条，用户点一下才刷新，避免强制 reload 的「白屏卡死 + 反复重刷」。 */
const showUpdateBanner = ref(false)
function onUpdateAvailable() { showUpdateBanner.value = true }
function applyUpdate() {
  showUpdateBanner.value = false
  location.reload()
}
onMounted(() => { window.addEventListener('eunoia:update-available', onUpdateAvailable) })
onUnmounted(() => { window.removeEventListener('eunoia:update-available', onUpdateAvailable) })

/* 进度停滞感知：超过 1.2s 没有新进度（wasm/数据加载中）时给进度条加流光，
   避免用户以为动画卡死（静态骨架与 Vue 骨架都靠它保持「活着」的观感） */
const bootStalled = ref(false)
let stallTimer = null
function armStallWatch() {
  bootStalled.value = false
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = setTimeout(() => {
    if (!dbOk.value && !dbErr.value) bootStalled.value = true
  }, 1200)
}
watch(bootProgress, armStallWatch)
onMounted(armStallWatch)
onUnmounted(() => { if (stallTimer) clearTimeout(stallTimer) })

/* 开屏提示语轮播：骨架屏期间循环显示，db 就绪/失败即停 */
const bootMsgs = [
  '正在恢复数据…',
  '本网站不收取任何费用',
  '建议定期导出数据 以免数据丢失',
  '心迹为独立网站 请单独导出或导入数据'
]
const bootMsgIdx = ref(0)
let bootMsgTimer = null
function startBootMsgs() {
  stopBootMsgs()
  bootMsgTimer = setInterval(() => {
    bootMsgIdx.value = (bootMsgIdx.value + 1) % bootMsgs.length
  }, 2600)
}
function stopBootMsgs() {
  if (bootMsgTimer) { clearInterval(bootMsgTimer); bootMsgTimer = null }
}
watch(dbOk, (v) => { if (v) stopBootMsgs() })
watch(dbErr, (v) => { if (v) stopBootMsgs() })
onMounted(startBootMsgs)
onUnmounted(stopBootMsgs)

/* 使用须知：本机同意标记（key 带版本号，条款更新时可换 key 重新征集） */
const NOTICE_KEY = 'eunoia-notice-acked-v1'
const showNotice = ref(false)
function onNoticeEnter() {
  try { localStorage.setItem(NOTICE_KEY, '1') } catch (e) { /*  ignore */ }
  showNotice.value = false
}

let bootEntered = false
function enterApp() {
  if (bootEntered) return
  bootEntered = true
  dbOk.value = true
  boot()
  /* 首次进入：数据就绪后弹出使用须知（勾选同意才放行） */
  try {
    if (!localStorage.getItem(NOTICE_KEY)) showNotice.value = true
  } catch (e) { /* 隐私模式等场景降级为每次弹出 */ showNotice.value = true }
}

/* 进度条真正画满再进应用：宽度过渡 0.45s，若到点（420ms）就替换骨架屏，
   用户会看到「条才涨到一半就进入网站」。这里等过渡动画自然结束
   （transitionend）再进入；个别环境不触发该事件时用超时兜底。
   挂载时数据已就绪（条无需过渡）则下一帧直接进入。 */
function whenBarFull(cb) {
  const bar = bootBar.value
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!bar || reduce) { cb(); return }
  let done = false
  const finish = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    bar.removeEventListener('transitionend', onEnd)
    cb()
  }
  const onEnd = (e) => { if (e.propertyName === 'width') finish() }
  const timer = setTimeout(finish, 1200)
  bar.addEventListener('transitionend', onEnd)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const bw = bar.getBoundingClientRect().width
      const fw = bar.parentElement ? bar.parentElement.getBoundingClientRect().width : 0
      if (fw > 0 && bw >= fw - 1) finish()
    })
  )
}

dbReady
  .then(() => {
    /* 先让进度条平滑涨到 100%，画满瞬间才进入应用 */
    bootProgress.value = 100
    whenBarFull(enterApp)
  })
  .catch((e) => {
    console.error('[app] 数据库初始化失败', e)
    dbErr.value = true
  })

/* 自动检测新版本并刷新：部署后无需手动清缓存/换链接即可生效 */
useAutoUpdate()

/* 开屏选择联系人的开关已从设置页移除，启动直接进入当前桌面。
   db 就绪后调用（dbReady.then → whenBarFull → enterApp → boot）。 */
async function boot() {
  connect()
  // 尽早申请系统通知权限（部分浏览器要求用户交互后授权；失败静默忽略）
  requestNotificationPermission().catch(() => {})
  try {
    await settings.load()
    await contactsStore.load()
    useCompanionStore().init().catch(() => {})
    useMusicStore().initListen().catch(() => {})
    /* 之前开启过后台保活则启动即恢复（无需进设置页） */
    if (settings.global.keepAlive === true) {
      useKeepAlive().setEnabled(true).catch(() => {})
    }
    await desktop.ensureValid()
    await desktop.load()
  } catch (e) {
    /* 忽略 */
  }
}

/* 数据初始化失败页的「重新加载」按钮 */
function reload() {
  location.reload()
}

onMounted(() => {
  /* 横滑后退手势拦截与 db 无关，mount 时即注册（骨架屏期间也生效） */
  let sx = 0, sy = 0, active = false
  let inHScroll = false, hEl = null
  const onTs = (e) => {
    if (e.touches.length !== 1) { active = false; return }
    const t = e.touches[0]
    sx = t.clientX; sy = t.clientY
    /* 起点是否在可横向滚动的容器里（如主页左右翻页器）：先记下该容器，
       由 touchmove 阶段再判断它是否已滚到边缘（iframe 内部触摸不冒泡，天然不受影响） */
    inHScroll = false; hEl = null
    let el = e.target
    while (el && el !== document.documentElement) {
      if (el.nodeType === 1 && el.scrollWidth - el.clientWidth > 4) {
        const ox = getComputedStyle(el).overflowX
        if (ox === 'auto' || ox === 'scroll') { inHScroll = true; hEl = el; break }
      }
      el = el.parentElement
    }
    active = true
  }
  const onTm = (e) => {
    if (!active || e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = t.clientX - sx
    const dy = t.clientY - sy
    /* 纵向主导：不干预，正常滚动 */
    if (Math.abs(dx) <= Math.abs(dy)) return
    if (inHScroll && hEl) {
      /* 横向滚动容器还能往该方向滚 → 放行；已滚到边缘还继续横滑 → 拦截 */
      const max = hEl.scrollWidth - hEl.clientWidth
      if (dx < 0 && hEl.scrollLeft < max - 2) return
      if (dx > 0 && hEl.scrollLeft > 2) return
      e.preventDefault()
      return
    }
    /* 横向位移明显大于纵向 → 浏览器左右滑前进/后退手势，一律拦截。
       不再限定边缘起手：部分浏览器（vivo/QQ 等）全屏任意位置横滑都会触发跳页 */
    if (Math.abs(dx) > 8) e.preventDefault()
  }
  const onTe = () => { active = false }
  document.addEventListener('touchstart', onTs, { passive: true })
  document.addEventListener('touchmove', onTm, { passive: false })
  document.addEventListener('touchend', onTe)
  document.addEventListener('touchcancel', onTe)
  /* 双指捏合也会触发系统导航，统一拦截 */
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })
})

onUnmounted(() => {
  disconnect()
})
</script>


<style>
.app-root {
  height: 100%;
  /* 电脑端桌面壁纸：同色系（奶茶驼 + 奶油）柔和渐变 + 两团很淡的柔光，
     移动端被填满、背景不可见 */
  background:
    radial-gradient(620px 520px at 10% 12%, rgba(197, 164, 126, 0.12), transparent 78%),
    radial-gradient(720px 580px at 92% 90%, rgba(197, 164, 126, 0.10), transparent 78%),
    linear-gradient(135deg, #fbfaf7 0%, #f4f0ea 52%, #efe8de 100%);
  background-attachment: fixed;
}

/* 屏幕内容容器：移动端手机壳内 / 桌面端右侧内容区通用 */
.screen {
  flex: 1 1 auto;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.screen > * { min-height: 0; }

/* 框架 / 两栏外壳：移动端=全屏手机壳（白边由媒体查询去掉），
   桌面端=宽屏面板/两栏（无白边） */
.frame, .shell {
  position: relative;
  background: var(--bg-screen);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 10px solid #fff;
  border-radius: 38px;
  box-shadow: var(--shadow-strong);
}

/* ── 移动端（≤500px）：全屏铺满，去掉白边手机壳、圆角与阴影 ── */
@media (max-width: 500px) {
  .app-root {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .frame, .shell {
    width: 100%;
    max-width: 100%;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
}

/* ── 桌面端（≥501px）：居中宽屏面板 / 两栏，去掉白色边框 ── */
@media (min-width: 501px) {
  .app-root {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .frame, .shell {
    width: min(1180px, 96vw);
    height: min(860px, 94vh);
    border: 1px solid var(--border);
    border-radius: 24px;
  }
  /* 主内容外壳在桌面端为左右两栏（侧栏 + 内容） */
  .shell { flex-direction: row; }
}

/* 禁用系统级横滑后退手势（安卓/ vivo 浏览器从屏幕边缘横滑会跨过应用内层级直接跳页）；
   返回统一走应用内返回按钮，遵循页面层级逻辑 */
html, body { overscroll-behavior-x: none; touch-action: pan-y; }
.app-root, .screen, .rv-wrap { overscroll-behavior-x: none; }
/* 各纵向滚动容器只允许纵向滑动，避免横向手势触发浏览器/系统后退 */
.hub-scroll, .cards-main, .card-grid, .msg-list, .search-results, .cm-scroll { touch-action: pan-y; }

/* ── 启动骨架屏（db 初始化期间）── */
.boot-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  /* 与 index.html 静态骨架同色，避免两段开屏切换时背景跳变 */
  background: #f7f3ee;
}
html[data-theme='dark'] .boot-screen {
  background: #141416;
}
/* 确定性进度条：宽度与 bootProgress 绑定，满格时即数据就绪 */
.boot-progress {
  width: 176px;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--accent) 15%, transparent);
  overflow: hidden;
}
.boot-progress-bar {
  display: block;
  position: relative;
  overflow: hidden;
  width: 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in oklab, var(--accent) 72%, transparent), var(--accent));
  transition: width 0.45s ease;
}
/* 进度停滞（wasm/数据还在加载）时条上走一道流光：
   静态骨架冻在 52%、Vue 骨架等下一个进度点时，观感上「还在动」，不是卡死 */
.boot-progress-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  transform: translateX(-100%);
  opacity: 0;
}
.boot-progress.stalled .boot-progress-bar::after {
  opacity: 1;
  animation: bootSheen 1.3s ease-in-out infinite;
}
@keyframes bootSheen {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .boot-progress.stalled .boot-progress-bar::after { animation: none; opacity: 0.5; }
}
/* 提示语轮播的淡入淡出 */
.boot-fade-enter-active,
.boot-fade-leave-active { transition: opacity 0.32s ease, transform 0.32s ease; }
.boot-fade-enter-from { opacity: 0; transform: translateY(7px); }
.boot-fade-leave-to { opacity: 0; transform: translateY(-7px); }
.boot-text {
  font-size: 13px;
  color: var(--text-soft);
  letter-spacing: 0.06em;
  text-align: center;
  max-width: 260px;
  line-height: 1.6;
}
.boot-err-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.boot-tip {
  font-size: 12px;
  color: var(--text-soft);
  max-width: 220px;
  text-align: center;
  line-height: 1.7;
}
.boot-retry {
  margin-top: 6px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border-radius: 999px;
  padding: 10px 36px;
}

/* 全局「有新版本」提示条：固定在底部，点一下刷新 */
.up-banner {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--accent, #c5a47e);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .18);
  cursor: pointer;
  white-space: nowrap;
}
.up-banner .up-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  animation: up-pulse 1.4s ease-in-out infinite;
}
@keyframes up-pulse {
  0%, 100% { opacity: .4; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1.1); }
}
.up-banner-enter-active, .up-banner-leave-active { transition: all .25s ease; }
.up-banner-enter-from, .up-banner-leave-to { opacity: 0; transform: translate(-50%, 12px); }
</style>
