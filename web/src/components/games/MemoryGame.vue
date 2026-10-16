<template>
  <div class="mg-wrap">
    <div class="mg-bar">
      <span class="mg-side" :class="{ on: turn === 'me' }">
        <AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="22" />
        <span class="mg-name">对方</span><b>{{ aiScore }}</b>
      </span>
      <span class="mg-vs">VS</span>
      <span class="mg-side" :class="{ on: turn === 'me' }">
        <b>{{ myScore }}</b><span class="mg-name">我</span>
      </span>
    </div>
    <p class="mg-status">{{ statusText }}</p>
    <div class="mg-grid">
      <button
        v-for="c in cards"
        :key="c.key"
        class="mg-card"
        :class="{ open: c.open || c.done, done: c.done, mine: c.done && c.by === 'me', theirs: c.done && c.by === 'ai' }"
        :disabled="busy || turn !== 'me' || c.done"
        @click="flip(c)"
      >
        <span v-if="c.open || c.done" class="mg-face">{{ c.emoji }}</span>
        <span v-else class="mg-back">🍂</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'

/* 默契翻牌：4×4 共 8 对，图案用动物/植物（不用功能图标）。
   双方轮流翻两张：配对成功加分并继续翻，失败换对方。
   AI 有简单记忆：翻过的牌会记住位置，大概率找回对子。 */
const EMOJI_POOL = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵',
  '🌵', '🌻', '🌲', '🍀', '🌸', '🍄', '🌙', '⭐', '🌈', '🍁', '🐝', '🦋']

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) }
})
const emit = defineEmits(['over'])

const cards = ref([])
const myScore = ref(0)
const aiScore = ref(0)
const turn = ref('me')
const busy = ref(false)
const first = ref(null)
const rounds = ref(0)
const aiMemory = ref(new Map()) // key -> emoji（AI 翻过见过的牌）
let timer = null

const statusText = computed(() => {
  if (over.value) return resultText.value
  if (turn.value === 'me') return busy.value ? '翻牌中…' : '轮到你了，翻两张牌'
  return '对方翻牌中…'
})
const over = ref(false)
const resultText = ref('')

function build() {
  const pool = EMOJI_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 8)
  const deck = [...pool, ...pool]
    .map((emoji, i) => ({ key: `${emoji}-${i}`, emoji, open: false, done: false, by: '' }))
    .sort(() => Math.random() - 0.5)
  cards.value = deck
  myScore.value = 0
  aiScore.value = 0
  turn.value = 'me'
  busy.value = false
  first.value = null
  rounds.value = 0
  aiMemory.value = new Map()
  over.value = false
  resultText.value = ''
}

function checkEnd() {
  if (!cards.value.every((c) => c.done)) return
  over.value = true
  const win = myScore.value > aiScore.value
  const tie = myScore.value === aiScore.value
  resultText.value = tie ? '平局！默契值相当' : win ? '你赢了，默契满分！' : '对方赢了，下次找回场子'
  emit('over', { win, tie, title: tie ? '平局' : win ? '胜利' : '失利', detail: `${myScore.value} : ${aiScore.value}`, rounds: rounds.value })
}

function flip(c) {
  if (busy.value || turn.value !== 'me' || c.open || c.done) return
  c.open = true
  if (!first.value) {
    first.value = c
    return
  }
  const a = first.value
  first.value = null
  rounds.value += 1
  if (a.emoji === c.emoji) {
    a.done = c.done = true
    a.by = c.by = 'me'
    myScore.value += 1
    checkEnd()
    return
  }
  busy.value = true
  aiMemory.value.set(a.key, a.emoji)
  aiMemory.value.set(c.key, c.emoji)
  timer = setTimeout(() => {
    a.open = c.open = false
    busy.value = false
    turn.value = 'ai'
    aiTurn()
  }, 620)
}

/* 对方回合：优先从记忆里找回对子（75%），否则随机翻两张 */
function aiTurn() {
  if (over.value) return
  busy.value = true
  timer = setTimeout(() => {
    const rest = cards.value.filter((c) => !c.done)
    if (!rest.length) { busy.value = false; return }
    let pair = null
    if (Math.random() < 0.75) {
      const seen = rest.filter((c) => aiMemory.value.has(c.key))
      for (let i = 0; i < seen.length && !pair; i++) {
        for (let j = i + 1; j < seen.length && !pair; j++) {
          if (seen[i].emoji === seen[j].emoji) pair = [seen[i], seen[j]]
        }
      }
    }
    if (!pair) {
      const a = rest[Math.floor(Math.random() * rest.length)]
      const b = rest[Math.floor(Math.random() * rest.length)]
      pair = a === b ? [a, rest.find((c) => c !== a)] : [a, b]
    }
    const [a, b] = pair
    if (!a || !b) { busy.value = false; return }
    a.open = b.open = true
    rounds.value += 1
    aiMemory.value.set(a.key, a.emoji)
    aiMemory.value.set(b.key, b.emoji)
    if (a.emoji === b.emoji) {
      a.done = b.done = true
      a.by = b.by = 'ai'
      aiScore.value += 1
      checkEnd()
      if (!over.value) aiTurn()
      else busy.value = false
      return
    }
    timer = setTimeout(() => {
      a.open = b.open = false
      busy.value = false
      turn.value = 'me'
    }, 900)
  }, 750)
}

defineExpose({ restart: build })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
build()
</script>

<style scoped>
.mg-bar { display: flex; align-items: center; justify-content: center; gap: 14px; }
.mg-side { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-soft); padding: 5px 10px; border-radius: 999px; border: 1px solid transparent; }
.mg-side b { font-size: 16px; color: var(--text); }
.mg-side.on { border-color: var(--accent); color: var(--text); background: var(--bg-soft); }
.mg-vs { font-size: 11px; color: var(--text-soft); }
.mg-status { text-align: center; font-size: 13px; color: var(--accent); margin: 12px 0; }
.mg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.mg-card {
  aspect-ratio: 3 / 4; border: 1px solid var(--border); border-radius: 14px;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center; padding: 0;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.mg-card:not(:disabled):active { transform: scale(0.94); }
.mg-card.open, .mg-card.done { background: var(--bg); border-color: var(--accent); }
.mg-card.done.mine { border-color: #4caf50; }
.mg-card.done.theirs { border-color: #ff7043; }
.mg-face { font-size: 30px; line-height: 1; }
.mg-back { font-size: 22px; opacity: 0.45; }
</style>
