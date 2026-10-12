<template>
  <div class="dr-row">
    <input
      class="dr-input"
      type="number"
      inputmode="decimal"
      :min="min"
      :max="max"
      :step="step"
      :value="lo"
      @change="onLo"
    />
    <span class="dr-sep">~</span>
    <input
      class="dr-input"
      type="number"
      inputmode="decimal"
      :min="min"
      :max="max"
      :step="step"
      :value="hi"
      @change="onHi"
    />
    <span v-if="unit" class="dr-unit">{{ unit }}</span>
  </div>
</template>

<script setup>
// 范围设置（最短 ~ 最长）：两个数字输入框，自动钳制边界并保证 lo <= hi
const props = defineProps({
  lo: { type: Number, required: true },
  hi: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 99999 },
  step: { type: Number, default: 1 },
  unit: { type: String, default: '' }
})
const emit = defineEmits(['update:lo', 'update:hi'])

function clamp(v) {
  v = Number(v)
  if (!Number.isFinite(v)) v = props.min
  return Math.min(props.max, Math.max(props.min, v))
}
function onLo(e) {
  const v = clamp(e.target.value)
  e.target.value = v
  if (v > props.hi) emit('update:hi', v)
  emit('update:lo', v)
}
function onHi(e) {
  const v = clamp(e.target.value)
  e.target.value = v
  if (v < props.lo) emit('update:lo', v)
  emit('update:hi', v)
}
</script>

<style scoped>
.dr-row { display: flex; align-items: center; gap: 8px; }
.dr-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 15px;
  text-align: center;
  color: var(--text);
  font-family: var(--font-serif);
}
.dr-input:focus { border-color: var(--accent); outline: none; }
.dr-sep { flex: 0 0 auto; color: var(--text-soft); font-size: 14px; }
.dr-unit { flex: 0 0 auto; font-size: 12px; color: var(--text-soft); min-width: 24px; }
</style>
