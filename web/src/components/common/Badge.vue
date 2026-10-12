<template>
  <span v-if="show" class="badge" :class="{ 'badge-dot': dot }">
    <template v-if="!dot">{{ display }}</template>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  max: { type: Number, default: 99 },
  dot: { type: Boolean, default: false }
})

const show = computed(() => props.dot ? props.value > 0 : props.value > 0)
const display = computed(() => {
  if (props.value > props.max) return props.max + '+'
  return String(props.value)
})
</script>

<style scoped>
.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ff5d73;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(255, 93, 115, 0.5);
  z-index: 5;
}
.badge-dot {
  min-width: 10px;
  height: 10px;
  padding: 0;
  top: -2px;
  right: -2px;
}
</style>
