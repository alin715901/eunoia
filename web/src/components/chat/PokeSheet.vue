<template>
  <Teleport to="body">
    <transition name="poke">
      <div v-if="show" class="poke-mask" @click="onMaskClick">
        <div class="poke-dialog" @click.stop>
          <div class="poke-head">
            <span class="poke-title">拍一拍</span>
            <button class="poke-x" @click="$emit('close')" aria-label="关闭">
              <AppIcon name="close" :size="18" />
            </button>
          </div>
          <div class="poke-items">
            <button
              v-for="it in items"
              :key="it.id"
              class="poke-item"
              @click="$emit('pick', it)"
            >{{ it.raw }}</button>
            <div v-if="!items.length" class="poke-empty">
              拍一拍库还是空的，点下面的「添加拍一拍」加几个吧
            </div>
          </div>
          <button class="poke-add" @click="$emit('add')">
            <AppIcon name="plus" :size="16" />
            <span>添加拍一拍</span>
          </button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  items: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'pick', 'add'])

/* 双击/双触头像触发后，浏览器或移动端会补发一个合成 click，
   若落在刚出现的遮罩上会立刻「关闭」，表现为面板一闪即没。
   遮罩打开后的极短时间内忽略点击关闭，避开这个误触。 */
const justOpened = ref(false)
watch(
  () => props.show,
  (v) => {
    if (v) {
      justOpened.value = true
      setTimeout(() => { justOpened.value = false }, 300)
    }
  }
)
function onMaskClick() {
  if (justOpened.value) return
  emit('close')
}
</script>

<style scoped>
.poke-mask {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.poke-dialog {
  width: 100%;
  max-width: 320px;
  max-height: 56vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-screen);
  border-radius: 16px;
  padding: 14px 14px 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}
.poke-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.poke-title { font-size: 15px; font-weight: 700; color: var(--text); }
.poke-x {
  border: none;
  background: transparent;
  color: var(--text-soft);
  padding: 2px;
}
.poke-items {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}
.poke-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--text);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 14px;
}
.poke-item:active { background: var(--accent-soft); }
.poke-empty {
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
  padding: 16px 0;
}
.poke-add {
  margin-top: 10px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
}
.poke-add:active { opacity: 0.9; }

/* 居中对话框：遮罩淡入 + 面板轻微放大弹入；离开时淡出 */
.poke-enter-active, .poke-leave-active { transition: opacity 0.18s ease; }
.poke-enter-from, .poke-leave-to { opacity: 0; }
.poke-enter-active .poke-dialog { animation: poke-pop 0.2s ease; }
@keyframes poke-pop {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
