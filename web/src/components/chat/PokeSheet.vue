<template>
  <Teleport to="body">
    <div v-if="show" class="poke-backdrop" @click="$emit('close')"></div>
    <transition name="sheet-up">
      <div v-if="show" class="poke-sheet">
        <div class="poke-head">
          <span class="poke-title">拍一拍</span>
          <button class="poke-x" @click="$emit('close')" aria-label="关闭">
            <AppIcon name="close" :size="18" />
          </button>
        </div>
        <p class="poke-tip">双击对方头像也能唤起这里 · 选一条即「我拍了拍对方的…」</p>
        <div class="poke-items">
          <button
            v-for="it in items"
            :key="it.id"
            class="poke-item"
            @click="$emit('pick', it)"
          >拍了拍对方的{{ it.raw }}</button>
          <div v-if="!items.length" class="poke-empty">
            拍一拍库还是空的，点下面的「添加拍一拍」加几个吧
          </div>
        </div>
        <button class="poke-add" @click="$emit('add')">
          <AppIcon name="plus" :size="16" />
          <span>添加拍一拍</span>
        </button>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import AppIcon from '@/components/common/AppIcon.vue'

defineProps({
  show: { type: Boolean, default: false },
  items: { type: Array, default: () => [] }
})
defineEmits(['close', 'pick', 'add'])
</script>

<style scoped>
.poke-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: rgba(0, 0, 0, 0.35);
  animation: poke-fade 0.18s ease;
}
@keyframes poke-fade { from { opacity: 0; } to { opacity: 1; } }
.poke-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 96;
  background: var(--bg-screen);
  border-radius: 16px 16px 0 0;
  padding: 14px 16px calc(16px + env(safe-area-inset-bottom));
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.18);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}
.poke-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.poke-title { font-size: 16px; font-weight: 700; color: var(--text); }
.poke-x {
  border: none;
  background: transparent;
  color: var(--text-soft);
  padding: 4px;
}
.poke-tip {
  margin: 6px 0 10px;
  font-size: 12px;
  color: var(--text-soft);
}
.poke-items {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}
.poke-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--text);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 15px;
}
.poke-item:active { background: var(--accent-soft); }
.poke-empty {
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
  padding: 18px 0;
}
.poke-add {
  margin-top: 12px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 12px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
}
.poke-add:active { opacity: 0.9; }

.sheet-up-enter-active, .sheet-up-leave-active { transition: transform 0.22s ease; }
.sheet-up-enter-from, .sheet-up-leave-to { transform: translateY(100%); }
</style>
