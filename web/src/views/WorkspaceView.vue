<template>
  <div class="ws-page">
    <AppHeader title="心迹 · 工作台" back />
    <div class="ws-frame">
      <iframe
        class="ws-iframe"
        src="https://alin715901.github.io/heart-trace/"
        title="心迹工作台"
      ></iframe>
    </div>
  </div>
</template>

<script setup>
import AppHeader from '@/components/layout/AppHeader.vue'
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
</style>
