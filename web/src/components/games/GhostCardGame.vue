<template>
  <div class="gh-wrap">
    <p class="gh-status">{{ statusText }}</p>

    <div class="gh-area">
      <!-- 对方的手牌：扇形铺开（方向与我相反，牌背朝上） -->
      <div class="gh-hand opp">
        <div class="gh-label">对方的手牌（{{ aiHand.length }} 张）</div>
        <div class="gh-fan">
          <div class="gh-fan-inner">
            <div
              v-for="(c, i) in aiHand"
              :key="c.id"
              class="gh-slot"
              :style="fanStyle(i, aiHand.length, true)"
            >
              <button
                class="gh-card back"
                :class="{ sel: selIdx === i, pairing: c.pairing, fresh: c.fresh }"
                :disabled="!canDraw"
                @click="onAiCardClick(i)"
              ><span>?</span></button>
            </div>
          </div>
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
        <!-- 掷骰子定先手：上对方、下我，各投一次，点数大的先抽 -->
        <div v-else-if="dealPhase === 'dice'" class="gh-dice">
          <div class="gh-dice-row">
            <span class="gh-dice-name">对方</span>
            <span class="gh-die" :class="{ rolling: dieRolling.ai }">{{ aiDieFace }}</span>
            <b v-if="!dieRolling.ai" class="gh-dice-pts">{{ aiDie }} 点</b>
          </div>
          <div class="gh-dice-row">
            <span class="gh-dice-name">我</span>
            <span class="gh-die" :class="{ rolling: dieRolling.me }">{{ myDieFace }}</span>
            <b v-if="!dieRolling.me" class="gh-dice-pts">{{ myDie }} 点</b>
          </div>
        </div>
        <!-- 发牌动画：洗牌（散乱牌堆搅动）→ 分发（计数）→ 拆对子 -->
        <template v-else-if="dealPhase !== 'done'">
          <div v-if="dealPhase === 'wash'" class="gh-wash">
            <span
              v-for="n in 22"
              :key="n"
              class="gh-card back wash"
              :style="washStyle()"
            ><span>?</span></span>
          </div>
          <div v-else-if="dealPhase === 'split'" class="gh-deal-count">发牌中 {{ dealt }} / 52</div>
          <div v-else class="gh-deal-count">拆对子…</div>
        </template>
        <template v-else>
          <span class="gh-deck">🂠</span>
          <span class="gh-tip">点对方的牌选中，再点一次抽出</span>
        </template>
      </div>

      <!-- 我的手牌：扇形铺开（牌面朝上，可左右滑动） -->
      <div class="gh-hand mine">
        <div class="gh-label">我的手牌（{{ myHand.length }} 张）</div>
        <div class="gh-fan">
          <div class="gh-fan-inner">
            <div
              v-for="(c, i) in myHand"
              :key="c.id"
              class="gh-slot"
              :style="fanStyle(i, myHand.length, false)"
            >
              <span
                class="gh-card"
                :class="{
                  red: isRed(c),
                  joker: c.rank === '小王',
                  fresh: c.fresh,
                  sel: aiPick === i,
                  pairing: c.pairing || (drawShow && drawShow.paired === c)
                }"
              >
                <b>{{ c.rank }}</b><i>{{ c.suit }}</i>
              </span>
            </div>
          </div>
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
import { ref, computed, onUnmounted } from 'vue'
import { aiDelay } from './aiDelay.js'

/* 抽鬼牌（标准规则）：
   一副扑克牌只留 1 张 Joker 当鬼牌（另一张王牌拿走不用），共 53 张。
   鬼牌是唯一凑不成对子的牌，谁最后手里留着它，谁输。
   1. 发牌：洗牌（散乱牌堆搅动）后平分，多出来的牌放一边不用；
   2. 先弃对子：双方把同点数对子（花色不限）直接丢掉，只剩单牌；
   3. 掷骰子定先手：双方各投一次，点数大的先抽；
   4. 轮流抽牌：双方手牌都呈扇形铺开（方向相反、可左右滑动），
      从对方手上点一张选中（牌上浮），再点一次抽出；
      抽到的牌能配对手上某张 → 这一对直接丢掉；凑不成 → 留在手里；
   5. 手牌全部出光的玩家直接获胜；游戏结束时拿着鬼牌的人就是输家。 */
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
/* 发牌动画阶段：wash 洗牌 → split 分发 → pairs 拆对子 → dice 掷骰定先手 → done 开局 */
const dealPhase = ref('wash')
const dealt = ref(0)
const extraCard = ref(null)
/* 掷骰子定先手 */
const myDie = ref(0)
const aiDie = ref(0)
const myDieFace = ref(1)
const aiDieFace = ref(1)
const dieRolling = ref({ me: false, ai: false })
const dieNote = ref('')
/* 抽牌展示：抽到的牌翻开亮相；paired 是被配走的另一张 */
const drawShow = ref(null)
/* 点选抽牌：我点对方牌选中的下标 / 对方从我手里选中的下标 */
const selIdx = ref(-1)
const aiPick = ref(-1)
/* 重入锁：抽牌展示期间禁止并发触发另一段抽牌逻辑 */
const acting = ref(false)
/* 洗牌动画：定时重掷散乱牌堆的随机位姿 */
const washTick = ref(0)
let washTimer = null

let uid = 0
/* 开局序号：restart 或组件挂载会并发触发多次 build()，
   旧 build 在 await 后发现自己不再是“最新一次”就主动放弃，
   避免两次开局的异步步骤交错把状态写脏（骰子重排、发牌错乱、卡死） */
let buildToken = 0
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

/* 扇形布局：第 i 张（共 n 张）绕扇轴张开，边缘自然下垂成弧；
   flip=true 是对方的扇（方向与我相反：弧口朝下、边缘上扬） */
function fanStyle(i, n, flip) {
  const mid = (n - 1) / 2
  const t = i - mid
  const spread = Math.min(60, n * 7) /* 整扇总张角 */
  const k = n > 1 ? spread / (n - 1) : 0
  const ang = t * k * (flip ? -1 : 1)
  const dip = 26 / Math.max(1, mid * mid) /* 边缘最多下垂 26px */
  const y = t * t * dip * (flip ? -1 : 1)
  return { transform: `translateY(${y.toFixed(2)}px) rotate(${ang.toFixed(2)}deg)` }
}

/* 洗牌：散乱的牌堆，每张随机散布 + 旋转，定时重掷像在桌面上搅牌 */
function washStyle() {
  void washTick.value /* 依赖 tick：每次自增触发全部重掷 */
  const dx = (Math.random() * 2 - 1) * 88
  const dy = (Math.random() * 2 - 1) * 34
  const rot = (Math.random() * 2 - 1) * 52
  return { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)` }
}
function startWash() {
  stopWash()
  washTimer = setInterval(() => { washTick.value++ }, 170)
}
function stopWash() {
  if (washTimer) { clearInterval(washTimer); washTimer = null }
}
onUnmounted(stopWash)

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

/* 开局：洗牌动画 → 平分（多的放一边）→ 拆对子动画 → 掷骰子定先手 → 开始轮流抽牌 */
async function build() {
  const tok = ++buildToken /* 本次开局的编号；之后每次 await 后核对是否仍是最新 */
  over.value = false
  busy.value = false
  turn.value = 'me'
  myHand.value = []
  aiHand.value = []
  drawShow.value = null
  extraCard.value = null
  resultText.value = ''
  logText.value = ''
  selIdx.value = -1
  aiPick.value = -1
  acting.value = false
  dealPhase.value = 'wash'
  dealt.value = 0
  myDie.value = 0
  aiDie.value = 0
  dieNote.value = ''
  startWash() /* 桌面洗牌：散乱牌堆搅动 */
  await sleep(1500)
  if (tok !== buildToken) return /* 已被新的重新开始取代，放弃后续 */
  stopWash()

  const deck = buildDeck()
  /* 53 张多出 1 张放一边不用；但暗牌绝不能是鬼牌——
     否则对局里没有鬼牌，52 张普通牌全可配对，终局无人持鬼。
     若随机抽到小王，就和牌堆里一张普通牌互换，保证鬼牌一定发到某人手上 */
  let extra = deck.pop()
  if (extra.rank === '小王') {
    const swap = deck.shift() /* 此时牌堆已无王，shift 必为普通牌 */
    deck.push(extra)
    extra = swap
  }
  extraCard.value = extra
  const mine = deck.slice(0, 26)
  const theirs = deck.slice(26)

  dealPhase.value = 'split'
  for (let i = 0; i < 26; i++) { /* 逐张分发 */
    if (tok !== buildToken) return
    aiHand.value.push(theirs[i])
    mine[i].fresh = true
    myHand.value.push(mine[i])
    dealt.value = i + 1
    await sleep(55)
  }

  dealPhase.value = 'pairs'
  await sleep(600)
  if (tok !== buildToken) return
  markPairs(myHand.value) /* 对子先高亮 */
  markPairs(aiHand.value)
  await sleep(800)
  if (tok !== buildToken) return
  myHand.value = removePairs(myHand.value)
  aiHand.value = removePairs(aiHand.value)
  for (const c of myHand.value) c.fresh = false
  logText.value = '拆完对子，掷骰子定先手'
  await sleep(500)
  if (tok !== buildToken) return
  await rollDice(tok)
}

/* 掷骰子定先手：双方各投一次（滚动动画后定格），点数大的先抽；平局重投 */
async function rollDice(tok) {
  dealPhase.value = 'dice'
  for (let round = 1; round <= 5; round++) {
    if (tok !== buildToken) return
    myDie.value = 0
    aiDie.value = 0
    dieNote.value = round > 1 ? `平局！第 ${round} 次投掷` : '掷骰子定先手，点数大的先抽'
    const faces = { me: 1, ai: 1 }
    dieRolling.value = { me: true, ai: true }
    const timer = setInterval(() => {
      faces.me = 1 + Math.floor(Math.random() * 6)
      faces.ai = 1 + Math.floor(Math.random() * 6)
      myDieFace.value = faces.me
      aiDieFace.value = faces.ai
    }, 80)
    await sleep(1100) /* 骰子滚动 */
    clearInterval(timer)
    if (tok !== buildToken) return
    myDie.value = 1 + Math.floor(Math.random() * 6)
    aiDie.value = 1 + Math.floor(Math.random() * 6)
    myDieFace.value = myDie.value
    aiDieFace.value = aiDie.value
    dieRolling.value = { me: false, ai: false }
    await sleep(700)
    if (myDie.value !== aiDie.value) {
      turn.value = myDie.value > aiDie.value ? 'me' : 'ai'
      dieNote.value = myDie.value > aiDie.value
        ? `你 ${myDie.value} 点 > 对方 ${aiDie.value} 点，你先抽！`
        : `对方 ${aiDie.value} 点 > 你 ${myDie.value} 点，对方先抽！`
      break
    }
    /* 5 轮都平局（概率极低）：随机定先手 */
    if (round === 5) {
      turn.value = Math.random() < 0.5 ? 'me' : 'ai'
      dieNote.value = `屡次平局，随机定先手`
    } else {
      dieNote.value = `平局（各 ${myDie.value} 点），重新投！`
      await sleep(900)
    }
  }
  if (tok !== buildToken) return
  await sleep(1200)
  if (tok !== buildToken) return
  dealPhase.value = 'done'
  logText.value = '开始轮流抽牌'
  if (turn.value === 'ai') {
    busy.value = true
    setTimeout(aiDraw, aiDelay())
  }
}

const statusText = computed(() => {
  if (over.value) return resultText.value
  if (dealPhase.value === 'wash') return '洗牌中…'
  if (dealPhase.value === 'split') return '发牌中…'
  if (dealPhase.value === 'pairs') return '拆对子…'
  if (dealPhase.value === 'dice') return dieNote.value
  if (busy.value) return '对方思考中…'
  return selIdx.value >= 0 ? '再点一次这张牌，把它抽出' : '你的回合：点对方一张牌选中'
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
  /* 结算不展示持牌描述，只报胜负 */
  resultText.value = win ? '你赢了！' : '你输了！'
  emit('over', { win, title: win ? '胜利' : '失利', detail: '' })
}

/* 手里能跟这张牌配上对的那张（小王凑不成对） */
function findPair(hand, card) {
  if (card.rank === '小王') return -1
  return hand.findIndex((c) => c.rank === card.rank)
}

/* 点对方的牌：第一次点击选中（牌上浮），再点同一张才抽出；点别的换选中 */
function onAiCardClick(i) {
  if (!canDraw.value || acting.value) return
  if (selIdx.value === i) {
    selIdx.value = -1
    drawFromAi(i)
  } else {
    selIdx.value = i
  }
}

/* 我从对方手里抽出选中的那张：翻开亮相 → 能配对则一起弃掉 */
async function drawFromAi(i) {
  if (acting.value) return
  const card = aiHand.value[i]
  if (!card) return
  acting.value = true
  busy.value = true
  try {
    aiHand.value.splice(i, 1)
    const pairIdx = findPair(myHand.value, card)
    /* 抽牌展示用局部对象，避免异步等待期间被并发置空 */
    const ds = { card, paired: pairIdx >= 0 ? myHand.value[pairIdx] : null, discard: false }
    drawShow.value = ds
    logText.value = `你抽到了 ${card.rank}${card.suit}`
    await sleep(900) /* 展示抽到的牌 */
    if (pairIdx >= 0) {
      myHand.value.splice(pairIdx, 1)
      ds.discard = true /* 两张一起高亮弃掉 */
      logText.value = `抽到 ${card.rank}${card.suit}，配对弃牌！`
      await sleep(650)
    } else {
      myHand.value.push(card)
    }
  } finally {
    drawShow.value = null
    busy.value = false
    acting.value = false
  }
  checkEnd()
  if (!over.value) {
    turn.value = 'ai'
    busy.value = true
    setTimeout(aiDraw, aiDelay())
  }
}

/* 对方从我手里抽一张：先在我方扇形里选中亮出，再翻开亮相 */
async function aiDraw() {
  if (acting.value) return
  if (over.value || dealPhase.value !== 'done') return
  const i = Math.floor(Math.random() * myHand.value.length)
  const card = myHand.value[i]
  if (!card) return
  acting.value = true
  busy.value = true
  try {
    aiPick.value = i /* 在我的扇形上选中这张（牌向桌心浮起） */
    logText.value = '对方正在挑牌…'
    await sleep(800)
    aiPick.value = -1
    myHand.value.splice(i, 1)
    const pairIdx = findPair(aiHand.value, card)
    const ds = { card, paired: pairIdx >= 0 ? aiHand.value[pairIdx] : null, discard: false }
    drawShow.value = ds
    logText.value = `对方从你手里抽走了 ${card.rank}${card.suit}`
    await sleep(900)
    if (pairIdx >= 0) {
      aiHand.value.splice(pairIdx, 1)
      ds.discard = true
      logText.value = `对方抽到 ${card.rank}${card.suit}，配对弃牌！`
      await sleep(650)
    } else {
      aiHand.value.push(card)
    }
  } finally {
    drawShow.value = null
    busy.value = false
    acting.value = false
  }
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
.gh-area { display: flex; flex-direction: column; gap: 10px; }
.gh-label { font-size: 12px; color: var(--text-soft); margin-bottom: 4px; }

/* 扇形手牌：横向滚动条可左右滑动，滚动条隐藏；
   inner 用 margin:auto 居中，牌多溢出时从左起可滑 */
.gh-fan { overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.gh-fan::-webkit-scrollbar { display: none; }
.gh-fan-inner { display: flex; margin: 0 auto; width: max-content; padding: 0 26px; }
/* 对方的扇（弧口朝下，牌底边对齐底缘）；我的扇（弧口朝上，顶边对齐顶缘） */
.gh-hand.opp .gh-fan-inner { align-items: flex-end; }
.gh-hand.mine .gh-fan-inner { align-items: flex-start; }
.gh-slot { width: 54px; height: 76px; flex: none; transition: transform 0.22s ease; }
.gh-slot + .gh-slot { margin-left: -24px; }
.gh-hand .gh-fan { height: 104px; }

.gh-card {
  width: 54px; height: 76px; border-radius: 9px; border: 1px solid var(--border);
  background: var(--bg-screen); display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 14px; color: var(--text); padding: 0;
  -webkit-appearance: none; appearance: none;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.gh-card b { font-size: 14px; line-height: 1.1; }
.gh-card i { font-style: normal; font-size: 16px; line-height: 1; }
.gh-card.red { color: #e53935; }
.gh-card.joker { border-color: var(--accent); color: var(--accent); background: var(--bg-soft); }
/* 牌背：固定经典深蓝 + 斜纹 + 外圈白边（不用主题色），
   外扩白圈让扇形重叠时每张牌界限清晰 */
.gh-card.back {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.16) 0 2px, transparent 2px 6px),
    repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.16) 0 2px, transparent 2px 6px),
    linear-gradient(160deg, #40618f, #27436b);
  border: 1px solid #1e3454;
  box-shadow:
    0 0 0 2px #f2f5f9,
    inset 0 0 0 1px rgba(255, 255, 255, 0.5),
    0 1px 3px rgba(0, 0, 0, 0.18);
  color: #fff; font-size: 15px; cursor: pointer;
}
.gh-card.back span { pointer-events: none; color: rgba(255, 255, 255, 0.9); }
.gh-card.back:not(:disabled):active { transform: scale(0.94); }
/* 不可点时只禁光标、不压暗——牌面保持正常亮度。
   iOS WebKit 对 disabled 表单元素有 UA 级硬编码压暗（约 0.3~0.4），
   标准 opacity 覆盖不住，需显式重置；Blink/WebKit 还会调淡 disabled 的
   color（牌背是白字，显式保留 #fff） */
.gh-card.back:disabled {
  cursor: default;
  opacity: 1;
  -webkit-opacity: 1;
  color: #fff;
  -webkit-text-fill-color: #fff;
}
.gh-card:disabled { opacity: 1; -webkit-opacity: 1; }
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
/* 点选抽牌：选中（第一次点）——牌向桌心浮起并亮框 */
.gh-card.sel {
  box-shadow: 0 0 0 2px var(--accent), 0 4px 10px rgba(0, 0, 0, 0.18);
  z-index: 2;
}
.gh-hand.opp .gh-card.sel { transform: translateY(14px); }
.gh-hand.mine .gh-card.sel { transform: translateY(-14px); }

/* 中间桌面区：固定高度 + 独立底板，洗牌堆/抽牌展示/骰子出现消失都不引起布局抖动 */
.gh-mid {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 10px; min-height: 150px; width: 100%;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 14px;
  overflow: hidden;
}
.gh-deck { font-size: 26px; }
.gh-tip { font-size: 12px; color: var(--text-soft); }
/* 掷骰子定先手：上对方下我 */
.gh-dice { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.gh-dice-row { display: flex; align-items: center; gap: 10px; }
.gh-dice-name { font-size: 12px; color: var(--text-soft); width: 28px; text-align: right; }
.gh-die {
  width: 40px; height: 40px; border-radius: 10px; background: var(--bg-screen);
  border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: var(--text);
}
.gh-die.rolling { animation: gh-die-shake 0.16s linear infinite; border-color: var(--accent); color: var(--accent); }
@keyframes gh-die-shake {
  0% { transform: rotate(-7deg) scale(1.04); }
  50% { transform: rotate(0deg) scale(0.98); }
  100% { transform: rotate(7deg) scale(1.04); }
}
.gh-dice-pts { font-size: 13px; color: var(--accent); min-width: 40px; }
/* 洗牌动画：散乱的牌堆（每张随机散布 + 旋转），定时重掷像在桌面搅牌 */
.gh-wash { position: relative; width: 240px; height: 126px; }
.gh-card.wash {
  position: absolute; left: 50%; top: 50%; margin: -38px 0 0 -27px;
  transition: transform 0.18s ease; pointer-events: none;
}
.gh-deal-count { font-size: 13px; color: var(--text-soft); }
/* 抽牌展示区：固定宽度，牌在里面亮相，不撑动上下布局 */
.gh-draw { display: flex; gap: 10px; align-items: center; justify-content: center; min-width: 128px; }
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
