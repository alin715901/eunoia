<template>
  <div class="mg-wrap">
    <div class="mg-bar">
      <span class="mg-stat">步数 <b>{{ steps }}</b></span>
      <span class="mg-stat">用时 <b>{{ timeText }}</b></span>
      <span class="mg-stat">最佳 <b>{{ bestText }}</b></span>
    </div>

    <div class="mg-grid">
      <button
        v-for="c in cards"
        :key="c.key"
        class="mg-card"
        :class="{ open: c.open, done: c.done }"
        @click="flip(c)"
      >
        <span v-if="c.open || c.done" class="mg-face">{{ c.emoji }}</span>
        <span v-else class="mg-back">🍂</span>
      </button>
    </div>

    <p v-if="cleared" class="mg-win">全部配对成功！{{ steps }} 步 · {{ timeText }}</p>

    <div class="mg-btns">
      <button class="md-btn ghost" @click="reset">重新开始</button>
      <button class="md-btn primary" @click="shuffle">换一批</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useGameRecords } from '@/composables/useGameRecords'

/* 默契翻牌：单人休闲计时局，没有输赢——翻开两张相同的图案即配对成功，
   比的是步数和用时。图案用动物/植物（不用功能图标）。 */
const EMOJI_POOL = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵',
  '🌵', '🌻', '🌲', '🍀', '🌸', '🍄', '🌙', '⭐', '🌈', '🍁', '🐝', '🦋']

const emit = defineEmits(['over'])
const { bestOf, save } = useGameRecords()

const cards = ref([])
const steps = ref(0)
const seconds = ref(0)
const timer = ref(null)
const first = ref(null)
const lock = ref(false)
const best = ref(null)

const cleared = computed(() => cards.value.length > 0 && cards.value.every((c) => c.done))
const timeText = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
const bestText = computed(() => (best.value?.value ? `${best.value.value} 步` : '--'))

function build(pool) {
  const picked = pool.slice(0, 8)
  const deck = [...picked, ...picked]
    .map((emoji, i) => ({ key: `${emoji}-${i}`, emoji, open: false, done: false }))
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
  build(EMOJI_POOL.slice().sort(() => Math.random() - 0.5))
}
function reset() {
  build(EMOJI_POOL.slice().sort(() => Math.random() - 0.5))
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
  if (a.emoji === c.emoji) {
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
  const rec = { value: steps.value }
  try {
    const r = await save('memory', rec, { lowerBetter: true })
    if (r === 'new') {
      best.value = await bestOf('memory')
    }
    emit('over', { solo: true, title: '全部配对成功', detail: `${steps.value} 步 · ${timeText.value}` })
  } catch (e) {
    /* 纪录失败不影响游戏 */
    emit('over', { solo: true, title: '全部配对成功', detail: `${steps.value} 步 · ${timeText.value}` })
  }
}

onMounted(async () => {
  best.value = await bestOf('memory')
  reset()
})
onBeforeUnmount(stopTimer)
</script>

<style scoped>
.mg-bar { display: flex; gap: 14px; justify-content: center; margin-bottom: 14px; }
.mg-stat { font-size: 12px; color: var(--text-soft); }
.mg-stat b { font-size: 14px; color: var(--text); margin-left: 2px; }
.mg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.mg-card {
  aspect-ratio: 3 / 4; border: 1px solid var(--border); border-radius: 14px;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center; padding: 0;
}
.mg-card.open, .mg-card.done { background: var(--bg-screen); border-color: var(--accent); }
.mg-face { font-size: 30px; line-height: 1; }
.mg-back { font-size: 22px; opacity: 0.45; }
.mg-win { text-align: center; color: var(--accent); font-size: 14px; margin-top: 16px; }
.mg-btns { display: flex; justify-content: center; gap: 10px; margin-top: 18px; }
</style>
