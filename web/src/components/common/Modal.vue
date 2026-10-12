<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="modal-mask" @click.self="onMaskClick">
        <div class="modal-box anim-pop" :style="{ maxWidth: width }">
          <div class="modal-head">
            <span class="modal-title">{{ title }}</span>
            <button class="modal-close" @click="$emit('close')">✕</button>
          </div>
          <div class="modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="modal-foot">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '340px' },
  closeOnMask: { type: Boolean, default: true }
})
const emit = defineEmits(['close'])

function onMaskClick() {
  if (props.closeOnMask) emit('close')
}
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(60, 50, 56, 0.45);
  /* 不用 backdrop-filter：低端手机 WebView 上全屏模糊层随过渡重绘，取消/确认后像"停留" */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-box {
  width: 88%;
  background: var(--bg-screen);
  border-radius: var(--radius);
  box-shadow: var(--shadow-strong);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-title { font-weight: 700; font-size: 16px; }
.modal-close {
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--text-soft);
}
.modal-body { padding: 16px; max-height: 64vh; overflow: auto; }
.modal-foot { padding: 12px 16px; display: flex; gap: 10px; justify-content: flex-end; }

.modal-fade-enter-active { transition: opacity 0.15s ease; }
.modal-fade-leave-active { transition: opacity 0.1s ease; pointer-events: none; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
