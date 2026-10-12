<template>
  <div class="coming-soon">
    <AppHeader :title="title" back />
    <div class="cs-body">
      <div class="cs-ic"><AppIcon name="cards" :size="44" color="var(--accent)" /></div>
      <h2 class="cs-title">{{ title }}</h2>
      <p class="cs-desc">{{ desc || '敬请期待（计划中）' }}</p>
    </div>
  </div>
</template>

<script setup>
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'

defineProps({
  title: { type: String, default: '敬请期待' },
  desc: { type: String, default: '' }
})
</script>

<style scoped>
.coming-soon { flex: 1; display: flex; flex-direction: column; }
.cs-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.cs-ic { animation: icon-pop 0.6s ease; }
.cs-title { font-size: 20px; margin: 14px 0 6px; }
.cs-desc { color: var(--text-soft); font-size: 14px; }
</style>
