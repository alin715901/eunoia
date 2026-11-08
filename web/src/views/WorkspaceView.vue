<template>
  <div class="ws-page">
    <AppHeader title="心迹 · 工作台" back />
    <div v-if="traceUrl" class="ws-frame">
      <iframe class="ws-iframe" :src="traceUrl" title="心迹工作台"></iframe>
    </div>
    <div v-else class="ws-empty">
      <div class="ws-empty-title">尚未配置工作台页面</div>
      <p>为避免连到别人的站点，未配置时这里不会加载任何外部页面。</p>
      <p>在 <code>web/public/config.js</code> 填写 <code>traceUrl</code> 后刷新即可显示。</p>
    </div>
  </div>
</template>

<script setup>
import AppHeader from '@/components/layout/AppHeader.vue'
import { RUNTIME_CONFIG } from '@/utils/runtimeConfig'

const traceUrl = RUNTIME_CONFIG.traceUrl
</script>

<style scoped>
.ws-page {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-screen);
}
.ws-frame {
  flex: 1 1 auto;
  min-height: 0;
}
.ws-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: var(--bg-screen);
}
.ws-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 32px;
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.7;
}
.ws-empty p { margin: 0; }
.ws-empty-title { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.ws-empty code {
  background: var(--bg-soft);
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 12px;
}
</style>
