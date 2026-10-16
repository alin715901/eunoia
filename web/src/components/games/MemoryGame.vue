<template>
  <div class="mg-wrap">
    <!-- 双人模式：双方轮流，每人翻两张，无输赢，翻完全部结束 -->
    <div v-if="together" class="mg-vs">
      <span class="mg-side" :class="{ on: turn === 'me' }">
        <AppAvatar :name="'我'" :avatar="myAvatar" :size="22" />
        <b>{{ mySteps }}</b> 我
      </span>
      <span class="mg-turn">{{ turn === 'me' ? '你的回合' : '对方翻牌中…' }}</span>
      <span class="mg-side" :class="{ on: turn === 'ai' }">
        {{ opponent.name }} <b>{{ aiSteps }}</b>
        <AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="22" />
      </span>
    </div>

    <div class="mg-bar">
      <span v-if="!together" class="mg-stat">步数 <b>{{ steps }}</b></span>
      <span v-if="together" class="mg-stat">共 <b>{{ steps }}</b> 步</span>
      <span class="mg-stat">用时 <b>{{ timeText }}</b></span>
      <span v-if="!together" class="mg-stat">最佳 <b>{{ bestText }}</b></span>
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
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useGameRecords } from '@/composables/useGameRecords'

/* 默契翻牌：
   - 单人：休闲计时局，没有输赢，翻完所有配对即结束，比步数和用时；
   - 双人（受邀一起玩）：双方轮流，每人翻两张，同样没有输赢，
     翻完全部为结束。图案用动物/植物（不用功能图标）。 */
const EMOJI_POOL = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵',
  '🌵', '🌻', '🌲', '🍀', '🌸', '🍄', '🌙', '⭐', '🌈', '🍁', '🐝', '🦋']

const props = defineProps({
  opponent: { type: Object, default: () => ({ id: 0, name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' },
  /* 双人模式：由对局页显式告知（受邀进入），不能靠 opponent.id 判断——
     单人玩时对局页也会填一个默认对手行用的联系人 */
  together: { type: Boolean, default: false }
})
const emit = defineEmits(['over'])
const { bestOf, save } = useGameRecords()

/* 双人模式由对局页显式传入（受邀一起玩才为 true） */
const together = computed(() => !!props.together)

const cards = ref([])
const steps = ref(0)
const seconds = ref(0)
const timer = ref(null)
const first = ref(null)
const lock = ref(false)
const best = ref(null)

/* 双人模式状态 */
const turn = ref('me') // me | ai
const mySteps = ref(0)
const aiSteps = ref(0)

const cleared = computed(() => cards.value.length > 0 && cards.value.every((c) => c.done))
const timeText = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
const bestText = computed(() => (best.value?.value ? `${best.value.value} 步` : '--'))

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

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
  turn.value = 'me'
  mySteps.value = 0
  aiSteps.value = 0
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

/* 两张牌结算：同图案配对成功，不同则翻回背面 */
function resolvePair(a, b) {
  if (a.emoji === b.emoji) {
    a.done = true
    b.done = true
    return true
  }
  a.open = false
  b.open = false
  return false
}

async function finishTogether() {
  stopTimer()
  emit('over', {
    noVs: true,
    title: '全部翻完啦',
    detail: `你 ${mySteps.value} 步 · 对方 ${aiSteps.value} 步 · ${timeText.value}`
  })
}

async function saveBest() {
  const rec = { value: steps.value }
  const detail = `${steps.value} 步 · ${timeText.value}`
  try {
    const r = await save('memory', rec, { lowerBetter: true })
    if (r === 'new') {
      best.value = await bestOf('memory')
    }
    emit('over', { solo: true, title: '全部配对成功', detail })
  } catch (e) {
    /* 纪录失败不影响游戏 */
    emit('over', { solo: true, title: '全部配对成功', detail })
  }
}

/* 我翻一张（单人随时可翻；双人仅我的回合且每轮翻两张） */
async function flip(c) {
  if (lock.value || c.open || c.done) return
  if (together.value && turn.value !== 'me') return
  c.open = true
  if (!first.value) {
    first.value = c
    return
  }
  const a = first.value
  first.value = null
  mySteps.value += 1
  steps.value += 1
  const paired = resolvePair(a, c)
  if (!paired) {
    lock.value = true
    await sleep(620)
    lock.value = false
  }
  if (cleared.value) {
    if (together.value) await finishTogether()
    else await saveBest()
    return
  }
  if (together.value) {
    turn.value = 'ai'
    aiTurn()
  }
}

/* 双人模式：对方翻两张 */
async function aiTurn() {
  if (cleared.value) return
  await sleep(750)
  const closed = cards.value.filter((c) => !c.open && !c.done)
  if (closed.length < 2) {
    turn.value = 'me'
    return
  }
  const a = closed[Math.floor(Math.random() * closed.length)]
  a.open = true
  await sleep(680)
  const rest = cards.value.filter((c) => !c.open && !c.done && c !== a)
  if (!rest.length) {
    turn.value = 'me'
    return
  }
  const b = rest[Math.floor(Math.random() * rest.length)]
  b.open = true
  await sleep(520)
  aiSteps.value += 1
  steps.value += 1
  resolvePair(a, b)
  await sleep(650)
  if (cleared.value) {
    await finishTogether()
    return
  }
  turn.value = 'me'
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

/* 双人模式：双方条 + 回合提示 */
.mg-vs {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 14px;
  padding: 8px 12px; margin-bottom: 12px;
}
.mg-side { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-soft); }
.mg-side b { font-size: 15px; color: var(--text); }
.mg-side.on { color: var(--accent); font-weight: 600; }
.mg-side.on b { color: var(--accent); }
.mg-turn { font-size: 12px; color: var(--accent); font-weight: 600; }
</style>
