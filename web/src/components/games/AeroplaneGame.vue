<template>
  <div class="ap-wrap">
    <div class="ap-bar">
      <span class="ap-side" :class="{ on: turn === 'ai' && !over }"><AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="20" />对方 <b>{{ aiSteps }}</b></span>
      <span class="ap-dice" :class="{ rolling }" @click="roll">{{ diceFace }}</span>
      <span class="ap-side" :class="{ on: turn === 'me' && !over }"><b>{{ mySteps }}</b> 我<AppAvatar :name="'我'" :avatar="myAvatar" :size="20" /></span>
    </div>

    <!-- 传统飞行棋棋盘：方形环形赛道（顺时针），双方飞机同屏可见、逐步移动 -->
    <div class="ap-board">
      <span v-for="i in 49" :key="i" class="ap-cell" :class="cellCls(i - 1)"></span>
      <!-- 中央停机坪：进度总览 -->
      <div class="ap-hub">
        <span class="ap-hub-title">✈ 停机坪</span>
        <span class="ap-hub-row me"><i class="ap-dot me"></i>我 {{ mySteps }}/{{ TRACK }}<em v-if="mySteps === 0">待起飞</em></span>
        <span class="ap-hub-row ai"><i class="ap-dot ai"></i>对方 {{ aiSteps }}/{{ TRACK }}<em v-if="aiSteps === 0">待起飞</em></span>
      </div>
      <!-- 飞机：绝对定位，格子间平滑移动（能看到对方飞机走位） -->
      <span class="ap-plane me" :style="planeStyle(mySteps, true)">✈️</span>
      <span class="ap-plane ai" :style="planeStyle(aiSteps, false)">✈️</span>
    </div>
    <p class="ap-legend">↻ 沿环形赛道顺时针前进，走完一圈回到自己的机场即获胜</p>

    <p class="ap-status">{{ statusText }}</p>
    <p class="ap-log">{{ logText }}</p>
    <div class="ap-btns">
      <button class="md-btn primary" :disabled="over || turn !== 'me' || rolling" @click="roll">{{ turn === 'me' && !over ? '掷骰子' : '对方回合' }}</button>
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { aiDelay } from './aiDelay.js'
import AppAvatar from '@/components/common/AppAvatar.vue'

/* 飞行棋（传统双人版）：
   方形棋盘 + 环形赛道（24 格），我的机场在左下角、对方机场在右上角，
   双方均顺时针前进，各自需要走完一整圈（24 步）回到自己的机场。
   - 掷出 6 点才能起飞（直接落到第 6 格），掷 6 可再掷一次；
   - 点数超出终点时按剩余步数反弹（传统规则）；
   - 落到对方所在格把对方撞回机场重新起飞；
   - 先正好走完 24 步者获胜。 */
const TRACK = 24
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

/* 环形赛道格坐标（7×7 棋盘的外圈，顺时针，从左下角出发） */
const RING = []
for (let c = 0; c <= 6; c++) RING.push([6, c]) /* 底行左→右：0-6 */
for (let r = 5; r >= 0; r--) RING.push([r, 6]) /* 右列下→上：7-12 */
for (let c = 5; c >= 0; c--) RING.push([0, c]) /* 顶行右→左：13-18 */
for (let r = 1; r <= 5; r++) RING.push([r, 0]) /* 左列上→下：19-23 */
const RING_SET = new Set(RING.map(([r, c]) => r * 7 + c))
/* 双方机场格：我在左下(42)、对方在右上(6) */
const AIRPORT = { me: 42, ai: 6 }
const START = { me: 0, ai: 12 }
const cellIdxOf = (steps, isMe) => (START[isMe ? 'me' : 'ai'] + steps) % TRACK

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' }
})
const emit = defineEmits(['over'])

/* steps：0 = 机场待起飞；6~23 = 环线上；24 = 到达终点 */
const mySteps = ref(0)
const aiSteps = ref(0)
const turn = ref('me')
const rolling = ref(false)
const diceValue = ref(6)
const over = ref(false)
const logText = ref('掷出 6 点才能起飞')

const diceFace = computed(() => DICE_FACES[diceValue.value - 1] || '🎲')
const statusText = computed(() => {
  if (over.value) return resultText.value
  if (rolling.value) return '骰子飞转中…'
  if (turn.value === 'me') {
    if (mySteps.value === 0) return '你的回合：掷出 6 点起飞'
    return '你的回合：掷骰子前进'
  }
  return '对方回合…'
})
const resultText = ref('')

/* 棋盘格子样式：外圈=赛道，四角=机场 */
function cellCls(i) {
  const cls = {}
  if (RING_SET.has(i)) cls.track = true
  if (i === AIRPORT.me) cls['airport-me'] = true
  if (i === AIRPORT.ai) cls['airport-ai'] = true
  if (i === 0 || i === 48) cls['airport-idle'] = true
  return cls
}

/* 飞机定位：steps → 环格 → 百分比坐标，CSS transition 平滑移动 */
function planeStyle(steps, isMe) {
  const [r, c] = RING[cellIdxOf(steps, isMe)]
  return {
    left: `calc(${c} * (100% / 7))`,
    top: `calc(${r} * (100% / 7))`,
    width: 'calc(100% / 7)',
    height: 'calc(100% / 7)'
  }
}

function restart() {
  mySteps.value = 0
  aiSteps.value = 0
  turn.value = 'me'
  rolling.value = false
  over.value = false
  resultText.value = ''
  logText.value = '掷出 6 点才能起飞'
}

function roll() {
  if (over.value || turn.value !== 'me' || rolling.value) return
  rolling.value = true
  let spins = 0
  const spin = setInterval(() => {
    diceValue.value = 1 + Math.floor(Math.random() * 6)
    if (++spins >= 8) {
      clearInterval(spin)
      const v = 1 + Math.floor(Math.random() * 6)
      diceValue.value = v
      rolling.value = false
      move(v, 'me')
    }
  }, 70)
}

function move(v, who) {
  const isMe = who === 'me'
  const steps = isMe ? mySteps.value : aiSteps.value
  let extra = false /* 掷到 6 奖励再掷一次 */
  if (steps === 0) {
    if (v === 6) {
      setSteps(isMe, 6)
      logText.value = isMe ? '起飞成功，直接落到第 6 格！' : '对方起飞了，落到第 6 格'
      checkCrash(isMe)
      extra = true
    } else {
      logText.value = isMe ? '没掷到 6，无法起飞' : '对方没掷到 6，原地待命'
    }
  } else {
    const target = steps + v
    if (target > TRACK) {
      /* 传统规则：超出终点按剩余步数反弹 */
      const back = TRACK * 2 - target
      setSteps(isMe, back)
      checkCrash(isMe)
      logText.value = isMe ? `掷出 ${v} 点，超出终点，反弹到第 ${back} 格` : `对方掷出 ${v} 点，反弹到第 ${back} 格`
      if (v === 6) extra = true
    } else if (target === TRACK) {
      setSteps(isMe, TRACK)
      return finish(isMe)
    } else {
      setSteps(isMe, target)
      checkCrash(isMe)
      logText.value = isMe ? `你前进到第 ${target} 格` : `对方前进到第 ${target} 格`
      if (v === 6) extra = true
    }
  }
  /* 回合交接：奖励回合同方继续，否则换手；AI 走完必须把回合还给对方 */
  if (extra) {
    if (isMe) return
    return aiTurn()
  }
  if (isMe) { turn.value = 'ai'; aiTurn() }
  else { turn.value = 'me' }
}

function setSteps(isMe, v) {
  if (isMe) mySteps.value = v
  else aiSteps.value = v
}

/* 撞机：落到对方所在格，对方回机场 */
function checkCrash(isMe) {
  if (mySteps.value < 6 || aiSteps.value < 6) return
  if (cellIdxOf(mySteps.value, true) === cellIdxOf(aiSteps.value, false)) {
    if (isMe) {
      aiSteps.value = 0
      logText.value = '撞机！对方被撞回机场'
    } else {
      mySteps.value = 0
      logText.value = '被对方撞了，你回到了机场'
    }
  }
}

function aiTurn() {
  if (over.value) return
  setTimeout(() => {
    if (over.value) return
    const v = 1 + Math.floor(Math.random() * 6)
    diceValue.value = v
    move(v, 'ai')
  }, aiDelay())
}

function finish(isMeWin) {
  over.value = true
  resultText.value = isMeWin ? '你抢先绕场一周，获胜！' : '对方先到达终点，你输了'
  emit('over', { win: isMeWin, title: isMeWin ? '胜利' : '失利', detail: isMeWin ? '率先抵达机场' : '对方率先抵达' })
}

defineExpose({ restart })
restart()
</script>

<style scoped>
.ap-bar { display: flex; align-items: center; justify-content: space-between; }
.ap-side { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-soft); }
.ap-side b { font-size: 16px; color: var(--text); }
.ap-side.on { color: var(--accent); font-weight: 600; }
.ap-dice { font-size: 40px; line-height: 1; cursor: pointer; user-select: none; transition: transform 0.1s; }
.ap-dice.rolling { animation: ap-shake 0.14s infinite; }
@keyframes ap-shake {
  0% { transform: rotate(-8deg) scale(1.05); }
  50% { transform: rotate(8deg) scale(1.1); }
  100% { transform: rotate(-8deg) scale(1.05); }
}
/* 传统方形棋盘：7×7 网格，外圈为环形赛道 */
.ap-board {
  position: relative; width: 100%; max-width: 330px; aspect-ratio: 1 / 1;
  margin: 14px auto 0; display: grid;
  grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(7, 1fr);
}
.ap-cell { border-radius: 4px; }
.ap-cell.track { background: var(--bg-soft); border: 1px solid var(--border); }
.ap-cell.airport-me { background: rgba(59, 130, 246, 0.18); border: 1px solid rgba(59, 130, 246, 0.55); border-radius: 8px; }
.ap-cell.airport-ai { background: rgba(239, 68, 68, 0.16); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; }
.ap-cell.airport-idle { background: var(--bg-soft); border: 1px dashed var(--border); border-radius: 8px; }
/* 中央停机坪 */
.ap-hub {
  position: absolute; left: calc(100% / 7); top: calc(100% / 7);
  width: calc(500% / 7); height: calc(500% / 7);
  border-radius: 14px; background: var(--bg-screen); border: 1px solid var(--border);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  font-size: 11px; color: var(--text-soft);
}
.ap-hub-title { font-size: 12px; font-weight: 700; color: var(--text); }
.ap-hub-row { display: flex; align-items: center; gap: 5px; }
.ap-hub-row em { font-style: normal; font-size: 10px; color: var(--accent); }
.ap-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.ap-dot.me { background: #3b82f6; }
.ap-dot.ai { background: #ef4444; }
/* 飞机：格子间平滑移动 */
.ap-plane {
  position: absolute; display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-style: normal; border-radius: 50%;
  transition: left 0.35s ease, top 0.35s ease; pointer-events: none; z-index: 2;
}
.ap-plane.me { background: rgba(59, 130, 246, 0.22); box-shadow: 0 0 0 1.5px rgba(59, 130, 246, 0.6); }
.ap-plane.ai { background: rgba(239, 68, 68, 0.18); box-shadow: 0 0 0 1.5px rgba(239, 68, 68, 0.55); }
.ap-legend { text-align: center; font-size: 11px; color: var(--text-soft); margin-top: 10px; }
.ap-status { text-align: center; font-size: 14px; color: var(--accent); font-weight: 600; margin: 10px 0 0; }
.ap-log { text-align: center; font-size: 12px; color: var(--text-soft); margin: 8px 0 10px; min-height: 16px; }
.ap-btns { display: flex; justify-content: center; gap: 10px; }
</style>
