<template>
  <button class="desktop-icon" @click="$emit('click')">
    <div class="di-thumb" :class="{ 'has-img': !!img }" :style="thumbStyle">
      <!-- 有图片背景时只显示图片，不显示图案；删掉图片后自动恢复图案图标 -->
      <span v-if="!img" class="di-ico"><AppIcon :name="icon" :size="30" color="var(--icon-fg)" /></span>
      <Badge :value="badge" />
    </div>
    <span class="di-name">{{ name }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import Badge from '@/components/common/Badge.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  icon: { type: String, default: 'home' },
  name: { type: String, default: '' },
  badge: { type: Number, default: 0 },
  bg: { type: String, default: 'var(--icon-bg)' },
  /* 主题里为该图标单独上传的图片背景 */
  img: { type: String, default: '' },
  delay: { type: Number, default: 0 }
})
defineEmits(['click'])

const thumbStyle = computed(() =>
  props.img
    ? { backgroundImage: `url(${props.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: props.bg }
)
</script>

<style scoped>
.desktop-icon {
  border: none;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 6px;
  width: 76px;
}
.di-thumb {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.desktop-icon:active .di-thumb {
  transform: scale(0.92);
  box-shadow: var(--shadow-strong);
}
.di-name { font-size: 12px; font-weight: 600; color: var(--icon-label, var(--text)); }
</style>
