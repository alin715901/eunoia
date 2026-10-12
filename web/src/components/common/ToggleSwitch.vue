<template>
  <label class="ts" :class="{ disabled }">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
    <span class="ts-track"></span>
  </label>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.ts { position: relative; width: 46px; height: 26px; flex: 0 0 auto; display: inline-block; cursor: pointer; }
.ts input { opacity: 0; width: 0; height: 0; position: absolute; }
.ts-track {
  position: absolute; inset: 0;
  background: var(--border, #ddd);
  border-radius: 999px;
  transition: background 0.2s ease;
}
.ts-track::before {
  content: '';
  position: absolute;
  width: 20px; height: 20px;
  left: 3px; top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.ts input:checked + .ts-track { background: var(--accent, #c5a47e); }
.ts input:checked + .ts-track::before { transform: translateX(20px); }
.ts.disabled { opacity: 0.5; pointer-events: none; }
</style>
