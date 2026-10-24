<template>
  <div class="sp-view">
    <AppHeader title="关于" back />
    <div class="sp-body">
      <div class="panel sec about-hero">
        <div class="logo-row">
          <span class="logo-badge"><AppIcon name="cards" :size="26" color="var(--accent)" /></span>
          <div class="logo-main">
            <span class="app-name">Eunoia字卡</span>
            <span class="app-ver">v0.1.0</span>
          </div>
        </div>
        <p class="about-desc">情感陪伴 · 主页共用，各功能的聊天/朋友圈/信件/字卡按联系人独立。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.about-hero { display: flex; flex-direction: column; gap: 12px; }
.logo-row { display: flex; align-items: center; gap: 12px; }
.logo-badge {
  width: 52px; height: 52px; border-radius: 14px;
  background: var(--bg-soft); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.logo-main { display: flex; flex-direction: column; gap: 2px; }
.app-name { font-size: 17px; font-weight: 700; color: var(--text); }
.app-ver { font-size: 12px; color: var(--text-soft); }
.about-desc { margin: 0; font-size: 12px; line-height: 1.7; color: var(--text-soft); }
</style>
