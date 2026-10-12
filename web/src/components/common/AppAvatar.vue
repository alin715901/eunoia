<template>
  <div class="app-avatar" :style="boxStyle">
    <img v-if="isImage" :src="avatar" :alt="name" />
    <span v-else>{{ text }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: '' },
  avatar: { type: String, default: '' }, // 图片路径（/assets/... 或 http/blob）或空
  size: { type: Number, default: 46 },
  bg: { type: String, default: 'var(--avatar-bg)' },
  color: { type: String, default: 'var(--avatar-fg)' }
})

const isImage = computed(() =>
  !!props.avatar &&
  (props.avatar.startsWith('/assets') ||
    props.avatar.startsWith('http') ||
    props.avatar.startsWith('blob:'))
)
// 非空且非图片路径时，原样显示（emoji 或文字）；否则取名字首字
const showRaw = computed(() => !isImage.value && !!props.avatar && props.avatar.trim() !== '')
const text = computed(() => showRaw.value ? props.avatar : (props.name || '·').charAt(0))
const boxStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  background: props.bg,
  color: props.color,
  fontSize: Math.round(props.size * (showRaw.value ? 0.6 : 0.4)) + 'px'
}))
</script>

<style scoped>
.app-avatar {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-weight: 700;
  flex: 0 0 auto;
  box-shadow: var(--shadow);
  user-select: none;
}
.app-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
