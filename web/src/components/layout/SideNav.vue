<template>
  <aside class="side-nav">
    <div class="sn-brand">
      <span class="sn-logo">Eunoia</span>
      <span class="sn-sub">心迹</span>
    </div>

    <nav class="sn-nav">
      <router-link
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="sn-item"
        :class="{ active: isActive(item.to) }"
      >
        <AppIcon :name="item.icon" :size="20" />
        <span class="sn-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>

<script setup>
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'

const route = useRoute()

/* 桌面端常驻导航：覆盖主要一级入口；二级页面（信件/纪念日/日记…）
   仍从主页图标进入，在右侧内容区渲染 */
const nav = [
  { to: '/', label: '主页', icon: 'home' },
  { to: '/cards', label: '字卡', icon: 'cards' },
  { to: '/chats', label: '聊天', icon: 'chat' },
  { to: '/moments', label: '朋友圈', icon: 'moments' },
  { to: '/workspace', label: '心迹', icon: 'trace' },
  { to: '/music', label: '音乐', icon: 'music' },
  { to: '/settings', label: '设置', icon: 'settings' }
]

function isActive(prefix) {
  if (prefix === '/') return route.path === '/'
  return route.path === prefix || route.path.startsWith(prefix + '/')
}
</script>

<style scoped>
.side-nav {
  display: none; /* 移动端不显示，由桌面端媒体查询开启 */
  flex: 0 0 240px;
  width: 240px;
  flex-direction: column;
  background: var(--bg-soft);
  border-right: 1px solid var(--border);
  padding: 22px 14px;
  overflow-y: auto;
}
/* 桌面端（宽屏两栏）显示侧栏 */
@media (min-width: 501px) {
  .side-nav { display: flex; }
}

.sn-brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px 18px;
}
.sn-logo {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 1px;
}
.sn-sub {
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--text-soft);
}

.sn-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}
.sn-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-soft);
  font-size: 15px;
  font-weight: 600;
  transition: background 0.18s ease, color 0.18s ease;
}
.sn-item:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text);
}
.sn-item.active {
  background: var(--accent);
  color: #fff;
}
.sn-item.active :deep(svg) {
  color: #fff;
}
.sn-label {
  line-height: 1.2;
}
</style>
