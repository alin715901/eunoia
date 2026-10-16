<template>
  <div class="gh-wrap">
    <p class="gh-status">{{ statusText }}</p>

    <div class="gh-area">
      <div class="gh-hand">
        <div class="gh-label">对方的手牌（{{ aiHand.length }} 张）</div>
        <div class="gh-row">
          <button
            v-for="(c, i) in aiHand"
            :key="c.id"
            class="gh-card back"
            :disabled="!canDraw"
            @click="drawFromAi(i)"
          >?</button>
        </div>
      </div>

      <div class="gh-mid">
        <span class="gh-deck">🂠</span>
        <span class="gh-tip">{{ phase === 'final' ? '决胜阶段' : '轮流抽牌' }}</span>
      </div>

      <div class="gh-hand">
        <div class="gh-label">我的手牌（{{ myHand.length }} 张）</div>
        <div class="gh-row">
          <span
            v-for="c in myHand"
            :key="c.id"
            class="gh-card"
            :class="{ red: c.suit === '♥' || c.suit === '♦', joker: c.rank === '小王' }"
          >
            <b>{{ c.rank }}</b><i>{{ c.suit }}</i>
          </span>
        </div>
      </div>
    </div>

    <p class="gh-log">{{ logText }}</p>
    <div class="gh-btns">
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

/* 抽鬼牌：标准 54 张随机分一人一半；各自拆掉成对的数、去掉大王；
   剩下双方轮流从对方手里抽一张，抽到能配对的即弃掉这对；
   直到一方手上只剩「小王 + 一张普通牌」进入决胜：由对方抽一张，
   抽到小王的人输；抽到普通牌则小王留在原主人手里，原主人输。
   任一方手牌抽空（或只剩小王）时，持小王的一方判负。 */
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['♠', '♥', '♣', '♦']

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) }
})
const emit = defineEmits(['over'])

const myHand = ref([])
const aiHand = ref([])
const turn = ref('me')
const phase = ref('normal') // normal | final | over
const finalHolder = ref(null) // 'me' | 'ai'
const over = ref(false)
const busy = ref(false)
const logText = ref('')
const resultText = ref('')

let uid = 0
function newCard(rank, suit) {
  return { id: ++uid, rank, suit }
}

function buildDeck() {
  const deck = []
  for (const r of RANKS) for (const s of SUITS) deck.push(newCard(r, s))
  deck.push(newCard('大王', ''))
  deck.push(newCard('小王', ''))
  return deck.sort(() => Math.random() - 0.5)
}

/* 拆对：同点数两两弃掉；大王直接弃掉；小王保留（鬼牌） */
function removePairs(hand) {
  const kept = []
  const byRank = {}
  for (const c of hand) {
    if (c.rank === '大王') continue
    ;(byRank[c.rank] = byRank[c.rank] || []).push(c)
  }
  for (const rank of Object.keys(byRank)) {
    const list = byRank[rank]
    if (rank === '小王') { kept.push(...list); continue }
    const pairs = Math.floor(list.length / 2)
    /* 前 2*pairs 张成对弃掉，剩下的零头留在手里 */
    for (let i = pairs * 2; i < list.length; i++) kept.push(list[i])
  }
  return kept
}

function build() {
  const deck = buildDeck()
  const half = Math.ceil(deck.length / 2)
  myHand.value = removePairs(deck.slice(0, half))
  aiHand.value = removePairs(deck.slice(half))
  turn.value = 'me'
  phase.value = 'normal'
  finalHolder.value = null
  over.value = false
  busy.value = false
  resultText.value = ''
  logText.value = '拆完对子，开始轮流抽牌'
  /* 发完牌就可能直接进入决胜（一方恰好只剩小王+一张普通牌） */
  checkEnd()
  if (over.value) return
  if (phase.value === 'final' && finalHolder.value === 'me') {
    turn.value = 'ai'
    busy.value = true
    setTimeout(aiDraw, 1000)
  }
}

const statusText = computed(() => {
  if (over.value) return resultText.value
  if (phase.value === 'final') {
    return finalHolder.value === 'me'
      ? '你只剩小王和一张普通牌，决胜：对方来抽'
      : '对方只剩小王和一张普通牌，决胜：你来抽'
  }
  return turn.value === 'me' ? '你的回合：点对方一张牌来抽' : '对方思考中…'
})
const canDraw = computed(() => {
  if (over.value || busy.value) return false
  /* 决胜阶段只有非持牌方抽牌 */
  if (phase.value === 'final') return finalHolder.value === 'ai'
  return turn.value === 'me'
})

/* 终局判定：手牌空 → 对方持小王判负；只剩小王 → 持小王判负；小王+一张普通牌 → 决胜 */
function checkEnd() {
  if (over.value) return
  const myJokerOnly = myHand.value.length === 1 && myHand.value[0].rank === '小王'
  const aiJokerOnly = aiHand.value.length === 1 && aiHand.value[0].rank === '小王'
  if (myHand.value.length === 0 || myJokerOnly) return finish(false)
  if (aiHand.value.length === 0 || aiJokerOnly) return finish(true)
  const myFinal = myHand.value.length === 2 && myHand.value.some((c) => c.rank === '小王')
  const aiFinal = aiHand.value.length === 2 && aiHand.value.some((c) => c.rank === '小王')
  if (myFinal && phase.value !== 'final') {
    phase.value = 'final'
    finalHolder.value = 'me'
    logText.value = '你只剩小王和一张普通牌，进入决胜！'
  } else if (aiFinal && phase.value !== 'final') {
    phase.value = 'final'
    finalHolder.value = 'ai'
    logText.value = '对方只剩小王和一张普通牌，进入决胜！'
  }
}

function finish(win) {
  over.value = true
  phase.value = 'over'
  const detail = win ? '对方留下了小王' : '小王落在了你手里'
  resultText.value = win ? `你赢了！${detail}` : `你输了！${detail}`
  emit('over', { win, title: win ? '胜利' : '失利', detail })
}

function pairOff(hand, card) {
  if (card.rank === '小王') return false
  const idx = hand.findIndex((c) => c.rank === card.rank)
  if (idx >= 0) {
    hand.splice(idx, 1)
    return true
  }
  return false
}

/* 一步走完后的调度：终局 → 决胜交接 → 正常轮转 */
function afterMove(fromMe) {
  checkEnd()
  if (over.value) return
  if (phase.value === 'final') {
    /* 决胜阶段：非持牌方执行那决定性的一抽 */
    if (finalHolder.value === 'me') {
      turn.value = 'ai'
      busy.value = true
      setTimeout(aiDraw, 1000)
    } else {
      turn.value = 'me'
      busy.value = false
    }
    return
  }
  if (fromMe) {
    turn.value = 'ai'
    busy.value = true
    setTimeout(aiDraw, 900)
  } else {
    turn.value = 'me'
    busy.value = false
  }
}

/* 我从对方手里抽一张 */
function drawFromAi(i) {
  if (!canDraw.value) return
  const card = aiHand.value[i]
  if (!card) return
  aiHand.value.splice(i, 1)
  const isFinal = phase.value === 'final'
  if (isFinal && card.rank === '小王') return finish(false)
  myHand.value.push(card)
  const paired = pairOff(myHand.value, card)
  if (isFinal) return finish(true) // 决胜抽到普通牌：小王留在对方手里，对方输
  logText.value = paired ? `你抽到 ${card.rank}${card.suit}，配对弃牌！` : `你抽到 ${card.rank}${card.suit}`
  afterMove(true)
}

/* 对方从我手里抽一张 */
function aiDraw() {
  if (over.value) return
  const isFinal = phase.value === 'final' && finalHolder.value === 'me'
  const i = Math.floor(Math.random() * myHand.value.length)
  const card = myHand.value[i]
  if (!card) { busy.value = false; return }
  myHand.value.splice(i, 1)
  if (isFinal && card.rank === '小王') return finish(true)
  aiHand.value.push(card)
  pairOff(aiHand.value, card)
  if (isFinal) return finish(false) // 决胜抽到普通牌：小王留在你手里，你输
  logText.value = '对方抽走了你的一张牌'
  afterMove(false)
}

function restart() {
  build()
}

defineExpose({ restart })
build()
</script>

<style scoped>
.gh-status { text-align: center; font-size: 14px; color: var(--accent); margin-bottom: 14px; font-weight: 600; }
.gh-area { display: flex; flex-direction: column; gap: 12px; }
.gh-label { font-size: 12px; color: var(--text-soft); margin-bottom: 6px; }
.gh-row { display: flex; flex-wrap: wrap; gap: 6px; min-height: 52px; }
.gh-card {
  width: 38px; height: 52px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg-screen); display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 13px; color: var(--text); padding: 0;
}
.gh-card b { font-size: 13px; line-height: 1.1; }
.gh-card i { font-style: normal; font-size: 15px; line-height: 1; }
.gh-card.red { color: #e53935; }
.gh-card.joker { border-color: var(--accent); color: var(--accent); background: var(--bg-soft); }
.gh-card.back {
  background: var(--accent); border-color: var(--accent); color: #fff; font-size: 15px; cursor: pointer;
}
.gh-card.back:not(:disabled):active { transform: scale(0.94); }
.gh-card.back:disabled { opacity: 0.75; cursor: default; }
.gh-mid { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 4px 0; }
.gh-deck { font-size: 26px; }
.gh-tip { font-size: 12px; color: var(--text-soft); }
.gh-log { text-align: center; font-size: 12px; color: var(--text-soft); margin: 14px 0 10px; min-height: 16px; }
.gh-btns { display: flex; justify-content: center; }
</style>
