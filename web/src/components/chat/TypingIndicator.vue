<template>
  <!-- 群聊：不展示群头像（"群在输入"很怪），只显示一个三点气泡代表"有人正在输入" -->
  <div v-if="plain" class="typing typing-plain">
    <div class="bubble bubble-contact typing-bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  </div>
  <div v-else class="typing">
    <AppAvatar
      :name="name"
      :avatar="avatar"
      :size="36"
      :style="avatarStyle"
    />
    <div class="bubble bubble-contact typing-bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'

const props = defineProps({
  name: { type: String, default: '' },
  avatar: { type: String, default: '' },
  avatarShape: { type: String, default: 'circle' },
  avatarRadius: { type: Number, default: 12 },
  // true：不带头像的纯三点样式（群聊「有人正在输入」）
  plain: { type: Boolean, default: false }
})

/* 跟随头像形状：圆形 / 圆角方形（覆盖 AppAvatar 内部的默认 50%） */
const avatarStyle = computed(() => ({
  borderRadius: props.avatarShape === 'circle' ? '50%' : props.avatarRadius + 'px'
}))
</script>

<style scoped>
.typing {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 8px 0;
  animation: rise-in 0.3s ease;
}
.typing-bubble { display: flex; gap: 4px; padding: 12px 14px; }
/* 群聊：贴左的三点气泡，不带名字头像 */
.typing-plain { justify-content: flex-start; }
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-soft);
  animation: blink 1.2s infinite ease-in-out;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}
</style>
