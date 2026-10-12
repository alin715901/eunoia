<template>
  <div class="md-page">
    <AppHeader title="小游戏" back />
    <div class="md-body">
      <div class="md-summary">
        <span class="md-sum-ic"><AppIcon name="game" :size="26" color="var(--accent)" /></span>
        <span class="md-sum-main">
          <span class="md-sum-title">默契翻牌</span>
          <span class="md-sum-sub">翻开两张相同的图案即配对成功</span>
        </span>
      </div>

      <div class="gm-bar">
        <span class="gm-stat">步数 <b>{{ steps }}</b></span>
        <span class="gm-stat">用时 <b>{{ timeText }}</b></span>
        <span class="gm-stat">最佳 <b>{{ best ? best.steps + ' 步 / ' + best.seconds + ' 秒' : '--' }}</b></span>
      </div>

      <div class="gm-grid">
        <button
          v-for="c in cards"
          :key="c.key"
          class="gm-card"
          :class="{ open: c.open, done: c.done }"
          @click="flip(c)"
        >
          <span v-if="c.open || c.done" class="gm-face"><AppIcon :name="c.icon" :size="30" color="var(--accent)" /></span>
          <span v-else class="gm-back"><AppIcon name="heart" :size="22" color="var(--accent)" /></span>
        </button>
      </div>

      <p v-if="cleared" class="gm-win">全部配对成功！{{ steps }} 步 · {{ timeText }}</p>

      <div class="md-actions gm-btns">
        <button class="md-btn ghost" @click="reset">重新开始</button>
        <button class="md-btn primary" @click="shuffle">换一批</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'

const ICONS = ['heart', 'music', 'film', 'mood', 'letter', 'calendar', 'cards', 'drop']
const { items, load, add, update } = useItems('game')
const toast = useNotificationsStore()

const cards = ref([])
const steps = ref(0)
const seconds = ref(0)
const timer = ref(null)
const first = ref(null)
const lock = ref(false)

const cleared = computed(() => cards.value.length > 0 && cards.value.every((c) => c.done))
const timeText = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
const best = computed(() => {
  const r = items.value.find((x) => x.title === 'best')
  return r ? { steps: r.extra?.steps || 0, seconds: r.extra?.seconds || 0 } : null
})

function build(pool) {
  const picked = pool.slice(0, 8)
  const deck = [...picked, ...picked]
    .map((icon, i) => ({ key: `${icon}-${i}`, icon, open: false, done: false }))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  cards.value = deck
  steps.value = 0
  seconds.value = 0
  first.value = null
  lock.value = false
  startTimer()
}
function shuffle() {
  const pool = ICONS.slice().sort(() => Math.random() - 0.5)
  build(pool)
}
function reset() {
  build(ICONS.slice().sort(() => Math.random() - 0.5))
}
function startTimer() {
  stopTimer()
  timer.value = setInterval(() => {
    seconds.value += 1
  }, 1000)
}
function stopTimer() {
  if (timer.value) clearInterval(timer.value)
  timer.value = null
}

async function flip(c) {
  if (lock.value || c.open || c.done) return
  c.open = true
  if (!first.value) {
    first.value = c
    return
  }
  const a = first.value
  steps.value += 1
  if (a.icon === c.icon) {
    a.done = true
    c.done = true
    first.value = null
    if (cleared.value) {
      stopTimer()
      await saveBest()
    }
    return
  }
  lock.value = true
  setTimeout(() => {
    a.open = false
    c.open = false
    first.value = null
    lock.value = false
  }, 620)
}

async function saveBest() {
  const rec = { steps: steps.value, seconds: seconds.value }
  const row = items.value.find((x) => x.title === 'best')
  try {
    if (!row) {
      await add({ title: 'best', extra: rec })
      toast.pushToast({ title: '新纪录已保存' })
    } else if (!best.value || steps.value < best.value.steps || (steps.value === best.value.steps && seconds.value < best.value.seconds)) {
      await update(row.id, { extra: rec })
      toast.pushToast({ title: '刷新纪录！' })
    } else {
      toast.pushToast({ title: '通关啦' })
    }
  } catch (e) {
    /* 记录失败不影响游戏 */
  }
}

onMounted(async () => {
  await load()
  reset()
})
onBeforeUnmount(stopTimer)
</script>

<style scoped>
.gm-bar { display: flex; gap: 14px; justify-content: center; margin-bottom: 14px; }
.gm-stat { font-size: 12px; color: var(--text-soft); }
.gm-stat b { font-size: 14px; color: var(--text); margin-left: 2px; }
.gm-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.gm-card {
  aspect-ratio: 3 / 4; border: 1px solid var(--border); border-radius: 14px;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center; padding: 0;
}
.gm-card.open, .gm-card.done { background: var(--bg); border-color: var(--accent); }
.gm-face, .gm-back { display: flex; align-items: center; justify-content: center; }
.gm-back { opacity: 0.5; }
.gm-win { text-align: center; color: var(--accent); font-size: 14px; margin-top: 16px; }
.gm-btns { margin-top: 18px; }
</style>
