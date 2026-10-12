<template>
  <div class="group-bar">
    <div class="gb-scroll">
      <button
        class="gb-chip"
        :class="{ active: modelValue === 'all' }"
        @click="$emit('update:modelValue', 'all')"
      >
        <span class="gb-name">全部</span>
        <span class="gb-count">{{ cards.length }}</span>
      </button>
      <button
        class="gb-chip"
        :class="{ active: modelValue === 'none' }"
        @click="$emit('update:modelValue', 'none')"
      >
        <span class="gb-name">未分组</span>
        <span class="gb-count">{{ noneCount }}</span>
      </button>
      <button
        v-for="(g, i) in groups"
        :key="g.id"
        class="gb-chip"
        :class="{ active: String(modelValue) === String(g.id), blocked: g.blocked }"
        @click="$emit('update:modelValue', g.id)"
      >
        <span class="gb-dot" :style="{ background: dotColor(g) }"></span>
        <span class="gb-name">{{ g.name }}</span>
        <span class="gb-count">{{ countOf(g.id) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  groups: { type: Array, default: () => [] },
  /* 当前库全部字卡（含屏蔽），用于统计各分组数量 */
  cards: { type: Array, default: () => [] },
  /* 'all' | 'none' | 分组 id */
  modelValue: { type: [String, Number], default: 'all' }
})
defineEmits(['update:modelValue'])

const noneCount = computed(() => {
  const ids = new Set(props.groups.map((g) => String(g.id)))
  return props.cards.filter((c) => !ids.has(String(c.group_id))).length
})

function countOf(gid) {
  return props.cards.filter((c) => String(c.group_id) === String(gid)).length
}

/* 分组前的小圆点：优先用户自选颜色，未设置则按 id 稳定取一组柔和色 */
const DOT_COLORS = ['#e5989b', '#f4a261', '#e9c46a', '#8ab17d', '#5fa8a0', '#9b8fc4', '#f28482', '#84a59d', '#cdb4db', '#b8c0ff']
function dotColor(g, i) {
  if (g.color) return g.color
  const n = Number(g.id)
  return DOT_COLORS[Number.isFinite(n) ? n % DOT_COLORS.length : (i || 0) % DOT_COLORS.length]
}
</script>

<style scoped>
.group-bar {
  flex: 0 0 auto;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
}
.gb-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 12px;
  scrollbar-width: none;
}
.gb-scroll::-webkit-scrollbar { display: none; }
.gb-chip {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-soft);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  max-width: 200px;
}
.gb-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.gb-chip.blocked { opacity: 0.55; }
.gb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.gb-name { overflow: hidden; text-overflow: ellipsis; }
.gb-count { font-size: 11px; opacity: 0.75; font-weight: 500; }
</style>
