<template>
  <div class="gn-wrap">
    <!-- 顶栏：模式 + 双方角色（对方在左、我在右） -->
    <div class="gn-bar">
      <span class="gn-side" :class="{ on: inAiGuess }">
        <AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="22" />{{ opponent.name }}
        <em v-if="roleOf('ai')">{{ roleOf('ai') }}</em>
      </span>
      <span class="gn-mode-tag">{{ mode === 'easy' ? '简单 1-100' : '困难 1-1000' }}</span>
      <span class="gn-side" :class="{ on: inMyGuess }">
        <em v-if="roleOf('me')">{{ roleOf('me') }}</em>我<AppAvatar :name="'我'" :avatar="myAvatar" :size="22" />
      </span>
    </div>

    <!-- 阶段一：选择难度 -->
    <div v-if="phase === 'mode'" class="gn-mid">
      <p class="gn-status">选择难度，开始游戏</p>
      <div class="gn-modes">
        <button class="gn-mode-btn" :class="{ picked: picked === 'easy' }" @click="chooseMode('easy')">
          <b>简单</b><span>1 ~ 100</span>
        </button>
        <button class="gn-mode-btn" :class="{ picked: picked === 'hard' }" @click="chooseMode('hard')">
          <b>困难</b><span>1 ~ 1000</span>
        </button>
      </div>
      <p class="gn-tip">双方先掷骰子，点数大的一方出题；两轮后比谁猜得快</p>
    </div>

    <!-- 阶段二：掷骰子定先后 -->
    <div v-else-if="phase === 'roll'" class="gn-mid">
      <div class="gn-dice-pair">
        <span class="gn-die" :class="{ rolling }">{{ myDieFace }}</span>
        <span class="gn-vs">VS</span>
        <span class="gn-die" :class="{ rolling }">{{ aiDieFace }}</span>
      </div>
      <p class="gn-status">{{ rollStatus }}</p>
      <button class="md-btn primary" :disabled="rolling" @click="rollDice">掷骰子定先后</button>
      <p class="gn-tip">点数大的一方先出题（想一个数），对方来猜</p>
    </div>

    <!-- 阶段三：我出题——输入我的数 -->
    <div v-else-if="phase === 'host-input'" class="gn-mid">
      <p class="gn-status">你想一个 {{ rangeText }} 的整数，让对方来猜</p>
      <div class="gn-input">
        <input v-model="secretInput" type="number" :min="1" :max="rangeMax" placeholder="悄悄输入你的数" @keyup.enter="confirmSecret" />
        <button class="md-btn primary" :disabled="!secretValid" @click="confirmSecret">想好了</button>
      </div>
      <p class="gn-tip">对方会根据「大了 / 小了」的提示来猜</p>
    </div>

    <!-- 阶段四：我猜对方的数 -->
    <div v-else-if="phase === 'guess'" class="gn-mid">
      <div class="gn-range">范围 {{ lo }} ~ {{ hi }}</div>
      <p class="gn-status">第 {{ round }} 轮 · 你已经猜了 {{ myAttempts }} 次</p>
      <div class="gn-input">
        <input v-model="input" type="number" :min="lo" :max="hi" :placeholder="`输入 ${lo}-${hi} 的整数`" @keyup.enter="submit" />
        <button class="md-btn primary" :disabled="!input" @click="submit">猜</button>
      </div>
      <div class="gn-history" v-if="myHistory.length">
        <div v-for="(h, i) in myHistory" :key="i" class="gn-row" :class="h.hint">
          <span class="gn-num">{{ h.value }}</span>
          <span class="gn-hint">{{ h.hint === 'up' ? '小了 ↑' : h.hint === 'down' ? '大了 ↓' : '猜中了！' }}</span>
        </div>
      </div>
    </div>

    <!-- 阶段五：对方猜我的数 -->
    <div v-else-if="phase === 'ai-guess'" class="gn-mid">
      <p class="gn-status">第 {{ round }} 轮 · 对方已经猜了 {{ aiAttempts }} 次</p>
      <div class="gn-history ai" v-if="aiHistory.length">
        <div v-for="(h, i) in aiHistory" :key="i" class="gn-row" :class="h.hint">
          <span class="gn-num">{{ h.value }}</span>
          <span class="gn-hint">{{ h.hint === 'up' ? '小了 ↑' : h.hint === 'down' ? '大了 ↓' : '猜中了！' }}</span>
        </div>
      </div>
      <p v-else class="gn-tip">对方正在思考…</p>
    </div>

    <!-- 阶段六：结算（两轮后比次数） -->
    <div v-else class="gn-mid">
      <div class="gn-big">{{ overTie ? '🤝' : overWin ? '🎉' : '😵' }}</div>
      <p class="gn-status">{{ resultText }}</p>
      <div class="gn-score">
        <span>你猜用 <b>{{ results.me }}</b> 次</span>
        <span>对方猜用 <b>{{ results.ai }}</b> 次</span>
      </div>
    </div>

    <p class="gn-best" v-if="bestText">最佳纪录：{{ bestText }}</p>
    <div class="gn-btns">
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useGameRecords } from '@/composables/useGameRecords'
import { aiDelay } from './aiDelay.js'

/* 猜数（双向对决）：
   1. 选难度：简单 1-100 / 困难 1-1000；
   2. 双方掷骰子，点数大的一方先出题（想一个数），另一方猜；
   3. 每轮猜者根据「大了 / 小了」缩小范围，猜中即记录次数；
   4. 两轮互换角色（我出题对方猜 ↔ 我猜对方出题）；
   5. 两轮结束比次数：用得少的一方获胜，相同则平局。 */
const RANGE = { easy: 100, hard: 1000 }
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' }
})
const emit = defineEmits(['over'])

const { bestOf, save } = useGameRecords()

/* phase: mode → roll → (host-input | guess) → (ai-guess | guess) → over */
const phase = ref('mode')
const mode = ref('easy')
/* 点选难度：先高亮选中的按钮，再进掷骰（给用户一个选中反馈） */
const picked = ref('')
let pickTimer = null
const round = ref(1)
const host = ref('ai') /* 本轮出题方：me | ai */
const rangeMax = computed(() => RANGE[mode.value])
const rangeText = computed(() => `1 ~ ${rangeMax.value}`)

/* 掷骰定先后 */
const rolling = ref(false)
const myDice = ref(0)
const aiDice = ref(0)
const rollStatus = ref('双方各掷一次，点数大者先出题')
const myDieFace = computed(() => (myDice.value ? DICE_FACES[myDice.value - 1] : '🎲'))
const aiDieFace = computed(() => (aiDice.value ? DICE_FACES[aiDice.value - 1] : '🎲'))

/* 我出题 */
const secretInput = ref('')
const mySecret = ref(0)
const secretValid = computed(() => {
  const v = Number(secretInput.value)
  return Number.isInteger(v) && v >= 1 && v <= rangeMax.value
})

/* 我猜 */
const lo = ref(1)
const hi = ref(100)
const input = ref('')
const myAttempts = ref(0)
const myHistory = ref([])
const aiSecret = ref(0)
/* 本轮已猜中：锁定输入，等 900ms 展示「猜中了」后再进下一轮
   （防止猜中后的展示窗口内重复提交，覆盖次数并重复排定 nextRound） */
const settled = ref(false)

/* 对方猜 */
const aiAttempts = ref(0)
const aiHistory = ref([])

/* 两轮结果：双方各自作为猜者的次数 */
const results = ref({ me: 0, ai: 0 })
const overWin = ref(false)
const overTie = ref(false)
const resultText = ref('')
const bestText = ref('')

const inMyGuess = computed(() => phase.value === 'guess' || phase.value === 'host-input')
const inAiGuess = computed(() => phase.value === 'ai-guess')
function roleOf(side) {
  if (phase.value === 'mode' || phase.value === 'roll' || phase.value === 'over') return ''
  return host.value === side ? '出题' : '猜数'
}

function chooseMode(m) {
  if (picked.value) return
  picked.value = m
  pickTimer = setTimeout(() => {
    picked.value = ''
    mode.value = m
    lo.value = 1
    hi.value = RANGE[m]
    phase.value = 'roll'
    rollStatus.value = '双方各掷一次，点数大者先出题'
    refreshBest()
  }, 340)
}

function rollDice() {
  if (rolling.value) return
  rolling.value = true
  let spins = 0
  const spin = setInterval(() => {
    myDice.value = 1 + Math.floor(Math.random() * 6)
    aiDice.value = 1 + Math.floor(Math.random() * 6)
    if (++spins >= 8) {
      clearInterval(spin)
      rolling.value = false
      if (myDice.value === aiDice.value) {
        rollStatus.value = `都是 ${myDice.value} 点，同点数再来一次`
        setTimeout(rollDice, 900)
        return
      }
      host.value = myDice.value > aiDice.value ? 'me' : 'ai'
      rollStatus.value = `你 ${myDice.value} 点 : 对方 ${aiDice.value} 点 —— ${host.value === 'me' ? '你先出题' : '对方先出题'}`
      setTimeout(startRound, 900)
    }
  }, 70)
}

function startRound() {
  myAttempts.value = 0
  aiAttempts.value = 0
  myHistory.value = []
  aiHistory.value = []
  settled.value = false
  lo.value = 1
  hi.value = RANGE[mode.value]
  input.value = ''
  secretInput.value = ''
  if (host.value === 'me') {
    phase.value = 'host-input'
  } else {
    aiSecret.value = 1 + Math.floor(Math.random() * rangeMax.value)
    phase.value = 'guess'
  }
}

/* 我出题：确认秘密数 → 对方开始猜 */
function confirmSecret() {
  if (!secretValid.value) return
  mySecret.value = Number(secretInput.value)
  phase.value = 'ai-guess'
  scheduleAiGuess()
}

/* 我猜对方的数 */
function submit() {
  if (phase.value !== 'guess' || !input.value || settled.value) return
  const v = Number(input.value)
  if (!Number.isInteger(v) || v < lo.value || v > hi.value) return
  myAttempts.value += 1
  input.value = ''
  if (v === aiSecret.value) {
    settled.value = true
    myHistory.value.unshift({ value: v, hint: 'hit' })
    results.value.me = myAttempts.value
    saveBest()
    setTimeout(nextRound, 900)
    return
  }
  const hint = v < aiSecret.value ? 'up' : 'down'
  if (v < aiSecret.value) lo.value = Math.max(lo.value, v + 1)
  else hi.value = Math.min(hi.value, v - 1)
  myHistory.value.unshift({ value: v, hint })
}

/* 对方猜我的数：二分查找为主，带轻微抖动模拟真人 */
function scheduleAiGuess() {
  setTimeout(() => {
    if (phase.value !== 'ai-guess') return
    aiGuess()
  }, aiDelay())
}

function aiGuess() {
  const mid = Math.floor((lo.value + hi.value) / 2)
  const jitter = Math.floor(Math.random() * 3) - 1
  const pick = Math.min(hi.value, Math.max(lo.value, mid + jitter))
  aiAttempts.value += 1
  if (pick === mySecret.value) {
    aiHistory.value.unshift({ value: pick, hint: 'hit' })
    results.value.ai = aiAttempts.value
    setTimeout(nextRound, 900)
    return
  }
  const hint = pick < mySecret.value ? 'up' : 'down'
  if (pick < mySecret.value) lo.value = Math.max(lo.value, pick + 1)
  else hi.value = Math.min(hi.value, pick - 1)
  aiHistory.value.unshift({ value: pick, hint })
  scheduleAiGuess()
}

/* 两轮互换角色后结算 */
function nextRound() {
  /*  stale 定时器兜底：期间用户点了重新开始（phase 回 mode）则不再推进 */
  if (phase.value === 'mode' || phase.value === 'over') return
  if (round.value === 1) {
    round.value = 2
    host.value = host.value === 'me' ? 'ai' : 'me'
    startRound()
    return
  }
  const me = results.value.me
  const ai = results.value.ai
  overTie.value = me === ai
  overWin.value = me < ai
  resultText.value = overTie.value
    ? '平局！双方用了相同的次数'
    : overWin.value ? '你赢了！你猜得更快' : '你输了，对方猜得更快'
  phase.value = 'over'
  emit('over', {
    win: overWin.value,
    tie: overTie.value,
    title: overTie.value ? '平局' : overWin.value ? '胜利' : '失利',
    detail: `${mode.value === 'easy' ? '简单' : '困难'} · 你 ${me} 次 : 对方 ${ai} 次`,
    /* 历史记录用简写「简单 · 6 : 6」（rec 在对局页覆盖历史 detail，弹窗仍用上面详细文案） */
    rec: { detail: `${mode.value === 'easy' ? '简单' : '困难'} · ${me} : ${ai}` }
  })
}

/* 最佳纪录按模式分别记录（次数越少越好） */
async function saveBest() {
  try {
    const cur = results.value.me
    const row = await bestOf('guess', mode.value)
    const prev = row ? row.value : null
    if (cur && (prev == null || cur < prev)) {
      await save('guess', { value: cur }, { lowerBetter: true, key: mode.value })
    }
    refreshBest()
  } catch (e) { /* ignore */ }
}

async function refreshBest() {
  try {
    const row = await bestOf('guess', mode.value)
    bestText.value = row ? `${mode.value === 'easy' ? '简单' : '困难'}模式 ${row.value} 次猜中` : ''
  } catch (e) { /* ignore */ }
}

function restart() {
  if (pickTimer) { clearTimeout(pickTimer); pickTimer = null }
  picked.value = ''
  phase.value = 'mode'
  mode.value = 'easy'
  round.value = 1
  host.value = 'ai'
  rolling.value = false
  myDice.value = 0
  aiDice.value = 0
  rollStatus.value = '双方各掷一次，点数大者先出题'
  secretInput.value = ''
  mySecret.value = 0
  input.value = ''
  myAttempts.value = 0
  aiAttempts.value = 0
  myHistory.value = []
  aiHistory.value = []
  results.value = { me: 0, ai: 0 }
  settled.value = false
  overWin.value = false
  overTie.value = false
  resultText.value = ''
  refreshBest()
}

defineExpose({ restart })
restart()
</script>

<style scoped>
.gn-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.gn-side { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-soft); }
.gn-side em {
  font-style: normal; font-size: 10px; font-weight: 700; color: var(--accent);
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px;
}
.gn-side.on { color: var(--accent); font-weight: 600; }
.gn-mode-tag {
  flex: none; font-size: 11px; font-weight: 700; color: var(--accent);
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px;
}
.gn-mid { text-align: center; padding: 18px 0 6px; }
.gn-big { font-size: 56px; line-height: 1; }
.gn-status { font-size: 14px; color: var(--accent); font-weight: 600; margin-top: 10px; }
.gn-range {
  display: inline-block; font-size: 12px; color: var(--accent); font-weight: 600;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 999px; padding: 3px 12px;
}
.gn-tip { font-size: 11px; color: var(--text-soft); margin-top: 12px; line-height: 1.6; }
.gn-modes { display: flex; gap: 12px; margin-top: 16px; }
.gn-mode-btn {
  flex: 1; display: flex; flex-direction: column; gap: 4px; align-items: center;
  padding: 18px 0; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-soft);
}
.gn-mode-btn b { font-size: 17px; color: var(--text); }
.gn-mode-btn span { font-size: 12px; color: var(--text-soft); }
/* 点选高亮：选中的难度按钮亮起高亮框 */
.gn-mode-btn.picked {
  border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-soft));
}
.gn-mode-btn:active { transform: scale(0.97); }
.gn-dice-pair { display: flex; align-items: center; justify-content: center; gap: 18px; }
.gn-die { font-size: 46px; line-height: 1; }
.gn-die.rolling { animation: gn-shake 0.14s infinite; }
@keyframes gn-shake {
  0% { transform: rotate(-8deg) scale(1.05); }
  50% { transform: rotate(8deg) scale(1.1); }
  100% { transform: rotate(-8deg) scale(1.05); }
}
.gn-vs { font-size: 14px; font-weight: 700; color: var(--text-soft); }
.gn-input { display: flex; gap: 10px; margin-top: 14px; }
.gn-input input {
  flex: 1; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-soft);
  padding: 10px 14px; font-size: 15px; color: var(--text); outline: none;
}
.gn-input input:focus { border-color: var(--accent); }
.gn-history { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; max-height: 298px; overflow: auto; }
.gn-history.ai .gn-num::before { content: '对方 '; font-size: 10px; color: var(--text-soft); font-weight: 400; }
.gn-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 7px 12px; border-radius: 10px; background: var(--bg-soft); }
.gn-row.up { color: #4caf50; }
.gn-row.down { color: #ff7043; }
.gn-row.hit { color: var(--accent); font-weight: 700; }
.gn-num { min-width: 34px; font-weight: 700; }
.gn-score { display: flex; justify-content: center; gap: 18px; margin-top: 12px; font-size: 13px; color: var(--text-soft); }
.gn-score b { color: var(--text); font-size: 16px; }
.gn-best { text-align: center; font-size: 12px; color: var(--text-soft); margin-top: 12px; }
.gn-btns { display: flex; justify-content: center; margin-top: 10px; }
</style>
