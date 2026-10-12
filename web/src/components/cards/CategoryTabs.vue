<template>
  <div class="cat-tabs">
    <button
      v-for="c in categories"
      :key="c.key"
      class="cat-tab"
      :class="{ active: modelValue === c.key }"
      @click="$emit('update:modelValue', c.key)"
    >
      <AppIcon :name="c.icon" :size="15" />
      <span class="cat-label">{{ c.label }}</span>
    </button>
  </div>
</template>

<script setup>
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: 'main' }
})
defineEmits(['update:modelValue'])

const categories = [
  { key: 'main', label: '主字卡', icon: 'cards' },
  { key: 'emoji', label: 'emoji', icon: 'emoji' },
  { key: 'kaomoji', label: '颜文字', icon: 'kaomoji' },
  { key: 'image', label: '图片', icon: 'image' },
  { key: 'sticker', label: '表情包', icon: 'sticker' },
  { key: 'voice', label: '语音字卡', icon: 'voice' }
]
</script>

<style scoped>
.cat-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
}
.cat-tab {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-soft);
  transition: all 0.2s ease;
}
.cat-tab.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.cat-tab :deep(svg) { flex: 0 0 auto; }
</style>
