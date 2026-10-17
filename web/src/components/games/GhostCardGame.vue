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
            :class="{ pairing: drawShow && drawShow.paired === c }"
            :disabled="!canDraw"
            @click="drawFromAi(i)"
          >?</button>
        </div>
      </div>

      <div class="gh-mid">
        <!-- 抽牌展示：抽到的牌翻开亮相，能配对的两张一起高亮弃掉 -->
        <div v-if="drawShow" class="gh-draw">
          <span
            class="gh-card big"
            :class="{ red: isRed(drawShow.card), joker: drawShow.card.rank === '小王', discard: drawShow.discard }"
          >
            <b>{{ drawShow.card.rank }}</b><i>{{ drawShow.card.suit }}</i>
          </span>
          <span
            v-if="drawShow.paired"
            class="gh-card big pair"
            :class="{ red: isRed(drawShow.paired), joker: drawShow.paired.rank === '小王', discard: drawShow.discard }"
          >
            <b>{{ drawShow.paired.rank }}</b><i>{{ drawShow.paired.suit }}</i>
          </span>
        </div>
        <!-- 发牌动画：洗牌 → 分发（计数）→ 拆对子 -->
        <template v-else-if="dealPhase !== 'done'">
          <div v-if="dealPhase === 'wash'" class="gh-deal-stack">
            <span v-for="n in 6" :key="n" class="gh-deal-card" :style="{ animationDelay: (n * 0.1) + 's' }">?</span>
          </div>
          <div v-else-if="dealPhase === 'split'" class="gh-deal-count">发牌中 {{ dealt }} / 52</div>
          <div v-else class="gh-deal-count">拆对子…</div>
        </template>
        <template v-else>
          <span class="gh-deck">🂠</span>
          <span class="gh-tip">轮流抽牌 · 留着鬼牌的人输</span>
        </template>
      </div>

      <div class="gh-hand">
        <div class="gh-label">我的手牌（{{ myHand.length }} 张）</div>
        <div class="gh-row">
          <span
            v-for="c in myHand"
            :key="c.id"
            class="gh-card"
            :class="{
              red: isRed(c),
              joker: c.rank === '小王',
              fresh: c.fresh,
              pairing: c.pairing || (drawShow && drawShow.paired === c)
            }"
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

/* 抽鬼牌（标准规则）：
   一副扑克牌只留 1 张 Joker 当鬼牌（另一张王牌拿走不用），共 53 张。
   鬼牌是唯一凑不成对子的牌，谁最后手里留着它，谁输。
   1. 发牌：全部洗牌后平分，多出来的牌放一边不用；
   2. 先弃对子：双方把同点数对子（花色不限）直接丢掉，只剩单牌；
   3. 轮流抽牌：从对方手上盲抽一张（对方手牌背面对着你），
      抽到的牌能配对手上某张 → 这一对直接丢掉；凑不成 → 留在手里；
   4. 手牌全部出光的玩家直接获胜；游戏结束时拿着鬼牌的人就是输家。 */
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['♠', '♥', '♣', '♦']

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) }
})
const emit = defineEmits(['over'])

const myHand = ref([])
const aiHand = ref([])
const turn = ref('me')
const over = ref(false)
const busy = ref(false)
const logText = ref('')
const resultText = ref('')
/* 发牌动画阶段：wash 洗牌 → split 分发 → pairs 拆对子 → done 开局 */
const dealPhase = ref('wash')
const dealt = ref(0)
const extraCard = ref(null)
/* 抽牌展示：抽到的牌翻开亮相；paired 是被配走的另一张 */
const drawShow = ref(null)

let uid = 0
function newCard(rank, suit) {
  return { id: ++uid, rank, suit, fresh: false, pairing: false }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
const isRed = (c) => c.suit === '♥' || c.suit === '♦'

/* 53 张：52 张普通牌 + 1 张小王（鬼牌），另一张王牌不用 */
function buildDeck() {
  const deck = []
  for (const r of RANKS) for (const s of SUITS) deck.push(newCard(r, s))
  deck.push(newCard('小王', ''))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/* 标记将要弃掉的对子（同点数前 2*pairs 张，花色不限；小王凑不成对保留） */
function markPairs(hand) {
  const byRank = {}
  for (const c of hand) (byRank[c.rank] = byRank[c.rank] || []).push(c)
  for (const rank of Object.keys(byRank)) {
    if (rank === '小王') continue
    const list = byRank[rank]
    const pairs = Math.floor(list.length / 2)
    for (let i = 0; i < pairs * 2; i++) list[i].pairing = true
  }
}

/* 拆对子：同点数两两弃掉，剩下的零头和小王留在手里 */
function removePairs(hand) {
  const byRank = {}
  for (const c of hand) (byRank[c.rank] = byRank[c.rank] || []).push(c)
  const kept = []
  for (const rank of Object.keys(byRank)) {
    const list = byRank[rank]
    if (rank === '小王') { kept.push(...list); continue }
    for (let i = Math.floor(list.length / 2) * 2; i < list.length; i++) kept.push(list[i])
  }
  return kept
}

/* 开局：洗牌动画 → 平分（多的放一边）→ 拆对子动画 → 开始轮流抽牌 */
async function build() {
  over.value = false
  busy.value = false
  turn.value = 'me'
  myHand.value = []
  aiHand.value = []
  drawShow.value = null
  extraCard.value = null
  resultText.value = ''
  logText.value = ''
  dealPhase.value = 'wash'
  dealt.value = 0
  await sleep(1300) /* 桌面洗牌 */

  const deck = buildDeck()
  extraCard.value = deck.pop() /* 53 张多出 1 张，放一边不用 */
  const mine = deck.slice(0, 26)
  const theirs = deck.slice(26)

  dealPhase.value = 'split'
  for (let i = 0; i < 26; i++) { /* 逐张分发 */
    aiHand.value.push(theirs[i])
    mine[i].fresh = true
    myHand.value.push(mine[i])
    dealt.value = i + 1
    await sleep(55)
  }

  dealPhase.value = 'pairs'
  await sleep(600)
  markPairs(myHand.value) /* 对子先高亮 */
  markPairs(aiHand.value)
  await sleep(800)
  myHand.value = removePairs(myHand.value)
  aiHand.value = removePairs(aiHand.value)
  for (const c of myHand.value) c.fresh = false
  logText.value = '拆完对子，开始轮流抽牌'
  await sleep(500)
  dealPhase.value = 'done'
}

const statusText = computed(() => {
  if (over.value) return resultText.value
  if (dealPhase.value === 'wash') return '洗牌中…'
  if (dealPhase.value === 'split') return '发牌中…'
  if (dealPhase.value === 'pairs') return '拆对子…'
  if (busy.value) return '对方思考中…'
  return '你的回合：点对方一张牌来抽'
})
const canDraw = computed(() =>
  dealPhase.value === 'done' && !over.value && !busy.value && !drawShow.value && turn.value === 'me'
)

/* 终局：手牌全部出光的玩家直接获胜；拿着鬼牌的人就是输家 */
function checkEnd() {
  if (over.value) return
  if (myHand.value.length === 0) return finish(true)
  if (aiHand.value.length === 0) return finish(false)
}

function finish(win) {
  over.value = true
  const detail = win ? '对方留下了小王' : '小王落在了你手里'
  resultText.value = win ? `你赢了！${detail}` : `你输了！${detail}`
  emit('over', { win, title: win ? '胜利' : '失利', detail })
}

/* 手里能跟这张牌配上对的那张（小王凑不成对） */
function findPair(hand, card) {
  if (card.rank === '小王') return -1
  return hand.findIndex((c) => c.rank === card.rank)
}

/* 我从对方手里盲抽一张：翻开亮相 → 能配对则一起弃掉 */
async function drawFromAi(i) {
  if (!canDraw.value) return
  const card = aiHand.value[i]
  if (!card) return
  busy.value = true
  aiHand.value.splice(i, 1)
  const pairIdx = findPair(myHand.value, card)
  drawShow.value = { card, paired: pairIdx >= 0 ? myHand.value[pairIdx] : null, discard: false }
  logText.value = `你抽到了 ${card.rank}${card.suit}`
  await sleep(900) /* 展示抽到的牌 */
  if (pairIdx >= 0) {
    myHand.value.splice(pairIdx, 1)
    drawShow.value.discard = true /* 两张一起高亮弃掉 */
    logText.value = `抽到 ${card.rank}${card.suit}，配对弃牌！`
    await sleep(650)
  } else {
    myHand.value.push(card)
  }
  drawShow.value = null
  busy.value = false
  checkEnd()
  if (!over.value) {
    turn.value = 'ai'
    busy.value = true
    setTimeout(aiDraw, 900)
  }
}

/* 对方从我手里盲抽一张：同样翻开亮相 */
async function aiDraw() {
  if (over.value || dealPhase.value !== 'done') return
  const i = Math.floor(Math.random() * myHand.value.length)
  const card = myHand.value[i]
  if (!card) { busy.value = false; return }
  myHand.value.splice(i, 1)
  const pairIdx = findPair(aiHand.value, card)
  drawShow.value = { card, paired: pairIdx >= 0 ? aiHand.value[pairIdx] : null, discard: false }
  logText.value = `对方从你手里抽走了 ${card.rank}${card.suit}`
  await sleep(900)
  if (pairIdx >= 0) {
    aiHand.value.splice(pairIdx, 1)
    drawShow.value.discard = true
    logText.value = `对方抽到 ${card.rank}${card.suit}，配对弃牌！`
    await sleep(650)
  } else {
    aiHand.value.push(card)
  }
  drawShow.value = null
  busy.value = false
  checkEnd()
  if (!over.value) turn.value = 'me'
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
/* 不可点时只禁光标、不压暗——牌面保持正常亮度 */
.gh-card.back:disabled { cursor: default; }
/* 发牌入场的牌：弹一下出现 */
.gh-card.fresh { animation: gh-deal-in 0.28s ease-out; }
@keyframes gh-deal-in {
  from { opacity: 0; transform: translateY(-10px) scale(0.7); }
  to { opacity: 1; transform: none; }
}
/* 拆对子/配对高亮：用 box-shadow 扩散，不改变元素几何 */
.gh-card.pairing { animation: gh-pulse 0.5s ease-in-out infinite alternate; }
@keyframes gh-pulse {
  from { box-shadow: 0 0 0 1px var(--accent); }
  to { box-shadow: 0 0 0 5px var(--accent); }
}
.gh-mid { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 4px 0; min-height: 64px; }
.gh-deck { font-size: 26px; }
.gh-tip { font-size: 12px; color: var(--text-soft); }
/* 发牌动画 */
.gh-deal-stack { position: relative; width: 44px; height: 60px; }
.gh-deal-card {
  position: absolute; inset: 0; border-radius: 8px;
  background: var(--accent); border: 1px solid var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 15px;
  animation: gh-wash 0.6s ease-in-out infinite alternate;
}
@keyframes gh-wash {
  from { transform: translate(-9px, -4px) rotate(-9deg); }
  to { transform: translate(9px, 4px) rotate(9deg); }
}
.gh-deal-count { font-size: 13px; color: var(--text-soft); }
/* 抽牌展示区 */
.gh-draw { display: flex; gap: 10px; align-items: center; justify-content: center; }
.gh-card.big { width: 52px; height: 72px; }
.gh-card.big b { font-size: 17px; }
.gh-card.big i { font-size: 19px; }
.gh-card.pair { box-shadow: 0 0 0 2px var(--accent); }
.gh-card.discard { animation: gh-discard 0.6s ease-in forwards; }
@keyframes gh-discard {
  to { opacity: 0; transform: translateY(-16px) scale(0.85); }
}
.gh-log { text-align: center; font-size: 12px; color: var(--text-soft); margin: 14px 0 10px; min-height: 16px; }
.gh-btns { display: flex; justify-content: center; }
</style>
