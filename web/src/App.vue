<template>
  <div class="app-root">
    <div class="phone-frame">
      <div class="phone-screen">
        <div
          class="rv-wrap"
          :class="{ 'with-tabbar': showTabBar && !uiStore.tabbarHidden }"
          :style="isHome ? homeBgStyle : null"
        >
          <router-view v-slot="{ Component }">
            <!-- 带 :id 的联系人内页用完整 path 作 key，
                 避免从 A 联系人切到 B 联系人时复用同一实例（onMounted 不再执行）。
                 注释必须放在 keep-alive 外：dev 模式下编译器会把 keep-alive 内的
                 注释节点也计为子节点，报 “expects exactly one child component” -->
            <keep-alive>
              <component :is="Component" :key="viewKey" />
            </keep-alive>
          </router-view>
        </div>
        <BottomTabBar v-if="showTabBar && !uiStore.tabbarHidden" />
      </div>
    </div>

    <Toast />
    <ConfirmDialog />

    <!-- 全局通话组件：独立于路由，跨页面保持（主叫/来电/通话中/可拖动悬浮窗） -->
    <CallOverlay />

    <!-- 全局音乐悬浮窗：独立于路由，跨页面常驻 -->
    <MusicFloat />

    <!-- 全局歌词页：独立于路由，全屏覆盖 -->
    <MusicLyrics />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import BottomTabBar from '@/components/layout/BottomTabBar.vue'
import Toast from '@/components/common/Toast.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import CallOverlay from '@/components/chat/CallOverlay.vue'
import MusicFloat from '@/components/music/MusicFloat.vue'
import MusicLyrics from '@/components/music/MusicLyrics.vue'
import { connect, disconnect } from '@/composables/useSSE'
import { useAutoUpdate } from '@/composables/useAutoUpdate'
import { requestNotificationPermission } from '@/composables/useNotification'
import { useSettingsStore } from '@/stores/settings'
import { useContactsStore } from '@/stores/contacts'
import { useCompanionStore } from '@/stores/companion'
import { useMusicStore } from '@/stores/music'
import { useDesktopStore } from '@/stores/desktop'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const settings = useSettingsStore()
const contactsStore = useContactsStore()
const desktop = useDesktopStore()
const uiStore = useUiStore()

/* 自动检测新版本并刷新：部署后无需手动清缓存/换链接即可生效 */
useAutoUpdate()

/* 主页背景图铺在最外层容器上：这样悬浮底栏的毛玻璃后面才是背景图，
   而不是内容区下面的空白 */
const isHome = computed(() => route.path === '/')

/* 路由切换时复位底栏隐藏标记（字卡库管理态会在 onActivated 里按需重新置位） */
watch(() => route.path, () => uiStore.setTabbarHidden(false))
const homeBgStyle = computed(() => {
  const t = settings.global?.theme || {}
  if (!t.homeBg) return null
  /* 背景图有自己独立的透明度：数值越高，蒙层越薄，背景图越清晰；
     与「卡片透明度」互不影响，各自独立控制。
     深色模式下蒙层换成黑色，图片整体压暗，不再刺眼 */
  let op = Number(t.homeBgOpacity)
  if (!Number.isFinite(op)) op = 100
  op = Math.max(0, Math.min(100, op))
  const k = 1 - op / 100
  const mask = (settings.isDark ? 0.32 + k * 0.5 : 0.1 + k * 0.77).toFixed(3)
  const rgb = settings.isDark ? '0,0,0' : '255,255,255'
  return {
    backgroundImage: `linear-gradient(rgba(${rgb},${mask}), rgba(${rgb},${mask})), url(${t.homeBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})

/* 底部 tab 只在 主页 / 字卡 / 设置 三个主页面出现；
   桌面上的功能图标（聊天、信件、朋友圈、日记…）进入后都不显示底栏 */
const TAB_ROUTES = ['/', '/cards', '/settings']
const showTabBar = computed(() => TAB_ROUTES.includes(route.path))

/* 联系人内页（chat/settings/space/cards/mailbox）随 id 重建实例；
   其余页面（主页/聊天列表/字卡/设置/朋友圈/信件）保持稳定 key 以复用 keep-alive 缓存 */
const viewKey = computed(() =>
  /^\/contacts\/\d+\//.test(route.path) ? route.fullPath : route.path
)

/* 开屏选择联系人的开关已从设置页移除，启动直接进入当前桌面 */
async function boot() {
  connect()
  // 尽早申请系统通知权限（部分浏览器要求用户交互后授权；失败静默忽略）
  requestNotificationPermission().catch(() => {})
  try {
    await settings.load()
    await contactsStore.load()
    useCompanionStore().init().catch(() => {})
    useMusicStore().initListen().catch(() => {})
    await desktop.ensureValid()
    await desktop.load()
  } catch (e) {
    /* 忽略 */
  }
}

onMounted(() => {
  boot()
  /* 拦截系统级横滑后退手势（iOS Safari 边缘横滑 / 安卓 WebView 边缘横滑）：
     这类手势会绕过应用内返回层级、直接跳浏览器历史记录（hash 路由被弹出 → 跳页）。
     overscroll-behavior-x 在部分系统上拦不住，这里在「从屏幕左右边缘起手且横向位移占主导」时
     preventDefault 拦截，正常纵向滚动与其它横向滚动不受影响 */
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.phone-frame {
  position: relative;
  width: 100%;
  max-width: 420px;
  height: 860px;
  max-height: 96vh;
  background: var(--bg-screen);
  border-radius: 38px;
  box-shadow: 0 20px 60px var(--shadow-strong);
  border: 10px solid #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 500px) {
  .app-root { padding: 0; }
  .phone-frame {
    max-width: 100%;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
  }
}

.phone-screen {
  flex: 1 1 auto;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* 让各页面根容器可被压缩，内部 overflow-y:auto 才能正常滚动（修复“不能滑动”） */
.phone-screen > * { min-height: 0; }

/* 页面容器：底栏悬浮时给内容底部留出空间，避免被圆角浮条遮住。
   主页背景图铺在这里，底栏毛玻璃透出的就是背景图 */
.rv-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-body);
  overscroll-behavior-x: none;
}
.rv-wrap > * { flex: 1 1 auto; min-height: 0; }
.rv-wrap.with-tabbar { padding-bottom: 86px; }

/* 禁用系统级横滑后退手势（安卓/ vivo 浏览器从屏幕边缘横滑会跨过应用内层级直接跳页）；
   返回统一走应用内返回按钮，遵循页面层级逻辑 */
html, body { overscroll-behavior-x: none; touch-action: pan-y; }
.app-root, .phone-screen, .rv-wrap { overscroll-behavior-x: none; }
/* 各纵向滚动容器只允许纵向滑动，避免横向手势触发浏览器/系统后退 */
.hub-scroll, .cards-main, .card-grid, .msg-list, .search-results, .cm-scroll { touch-action: pan-y; }
</style>
