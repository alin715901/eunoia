<template>
  <nav class="tabbar">
    <router-link to="/" class="tab" :class="{ active: isActive('/') }">
      <AppIcon name="home" :size="22" />
      <span class="tab-label">主页</span>
    </router-link>
    <router-link to="/cards" class="tab" :class="{ active: isActive('/cards') }">
      <AppIcon name="cards" :size="22" />
      <span class="tab-label">字卡</span>
    </router-link>
    <router-link to="/settings" class="tab" :class="{ active: isActive('/settings') }">
      <AppIcon name="settings" :size="22" />
      <span class="tab-label">设置</span>
    </router-link>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'

const route = useRoute()

function isActive(prefix) {
  if (prefix === '/') return route.path === '/'
  return route.path === prefix || route.path.startsWith(prefix + '/')
}
</script>

<style scoped>
.tabbar {
  /* 悬浮圆角 dock（像 iOS 底栏）：毛玻璃透出下面的主页背景图 */
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 12px;
  height: 62px;
  display: flex;
  background: var(--tab-bg);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid var(--border);
  border-radius: 31px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 60;
}
.tab {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--text-soft);
  transition: color 0.2s ease, transform 0.15s ease;
}
.tab.active { color: var(--accent); }
.tab.active :deep(svg) { transform: translateY(-1px) scale(1.12); }
.tab :deep(svg) { transition: transform 0.2s ease; }
.tab-label { font-size: 11px; font-weight: 600; }
</style>