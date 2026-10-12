<template>
  <!-- 全站统一的确认弹窗：替掉浏览器 confirm / alert -->
  <div v-if="d.open" class="dlg-mask" @click.self="closeDialog(false)">
    <div class="dlg">
      <h3 v-if="d.title" class="dlg-title">{{ d.title }}</h3>
      <p v-if="d.text" class="dlg-text">{{ d.text }}</p>
      <input
        v-if="d.isInput"
        ref="inputEl"
        v-model="d.inputValue"
        class="dlg-input"
        :placeholder="d.placeholder"
        @keyup.enter="closeDialog(true)"
      />
      <div class="dlg-actions">
        <button class="dlg-btn" @click="closeDialog(false)">{{ d.cancelText }}</button>
        <button class="dlg-btn primary" :class="{ danger: d.danger }" @click="closeDialog(true)">
          {{ d.okText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useDialogState, closeDialog } from '@/utils/dialog'

const d = useDialogState()
/* 输入弹窗打开时自动聚焦输入框 */
const inputEl = ref(null)
watch(() => d.open, (v) => {
  if (v && d.isInput) nextTick(() => { inputEl.value && inputEl.value.focus() })
})
</script>

<style scoped>
.dlg-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.38);
  /* 必须压过所有 Modal（z-index:1000）：删除分组等确认框要从编辑弹窗之上弹出 */
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.dlg {
  width: 100%;
  max-width: 300px;
  background: var(--bg-screen);
  border-radius: var(--radius-lg);
  padding: 20px 18px 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
  text-align: center;
}
.dlg-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-serif);
  color: var(--text);
}
.dlg-text {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-soft);
  white-space: pre-wrap;
}
.dlg-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  padding: 6px 2px 10px;
  font-size: 15px;
  color: var(--text);
  text-align: center;
  margin: 0 0 18px;
  outline: none;
}
.dlg-input:focus { border-bottom-color: var(--accent); }
.dlg-actions { display: flex; gap: 10px; }
.dlg-btn {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 10px 0;
  font-size: 14px;
  color: var(--text);
}
.dlg-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
.dlg-btn.primary.danger {
  background: #c0576b;
  border-color: #c0576b;
}
</style>
