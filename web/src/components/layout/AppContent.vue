<template>
  <div class="screen">
    <!-- 主页背景图铺在最外层容器上：这样悬浮底栏的毛玻璃后面才是背景图，
         而不是内容区下面的空白 -->
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
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import BottomTabBar from '@/components/layout/BottomTabBar.vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const settings = useSettingsStore()
const uiStore = useUiStore()

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
</script>

<style scoped>
.screen {
  flex: 1 1 auto;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* 让各页面根容器可被压缩，内部 overflow-y:auto 才能正常滚动（修复“不能滑动”） */
.screen > * { min-height: 0; }

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

/* 桌面端（宽屏两栏）：侧栏已承担主导航，隐藏底部手机 tabbar，
   并去掉主页面给 tabbar 预留的底部留白 */
@media (min-width: 501px) {
  :deep(.tabbar) { display: none; }
  .rv-wrap.with-tabbar { padding-bottom: 0; }
  /* 宽屏下内容居中限宽：单列移动页面在超宽区域里直接铺满会被拉空，
     统一给一个舒适的阅读宽度并水平居中，两侧由壁纸/底色留白 */
  .rv-wrap { align-items: center; }
  .rv-wrap > * { width: 100%; max-width: 720px; }
}
</style>
