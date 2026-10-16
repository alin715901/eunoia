<template>
  <div class="ap-wrap">
    <div class="ap-bar">
      <span class="ap-side" :class="{ on: turn === 'me' && !over }"><AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="20" />对方 <b>{{ aiPos }}</b></span>
      <span class="ap-dice" :class="{ rolling }" @click="roll">{{ diceFace }}</span>
      <span class="ap-side" :class="{ on: turn === 'me' && !over }"><b>{{ myPos }}</b> 我<AppAvatar :name="'我'" :avatar="myAvatar" :size="20" /></span>
    </div>
    <p class="ap-status">{{ statusText }}</p>

    <div class="ap-track">
      <span v-for="n in cellNums" :key="n" class="ap-cell" :class="{ start: n === 0, goal: n === TRACK }">
        <i v-if="myPos === n" class="ap-plane me">✈️</i>
        <i v-if="aiPos === n" class="ap-plane ai">✈️</i>
        <em v-if="myPos !== n && aiPos !== n">{{ n }}</em>
      </span>
    </div>

    <p class="ap-log">{{ logText }}</p>
    <div class="ap-btns">
      <button class="md-btn primary" :disabled="over || turn !== 'me' || rolling" @click="roll">{{ turn === 'me' && !over ? '掷骰子' : '对方回合' }}</button>
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'

/* 飞行棋（双人简化版）：赛道 0→40，起点掷出 6 才能起飞（直接落到 6 格），
   掷出 6 可再掷一次；正好走到 40 者获胜，点数超出则原地不动；
   落到对方所在格把对方撞回起点重新起飞。 */
const TRACK = 40
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
/* 赛道格号 0（起点）→ 40（终点），共 41 格 */
const cellNums = Array.from({ length: TRACK + 1 }, (_, i) => i)

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' }
})
const emit = defineEmits(['over'])

const myPos = ref(0)
const aiPos = ref(0)
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
    if (myPos.value === 0) return '你的回合：掷出 6 点起飞'
    return '你的回合：掷骰子前进'
  }
  return '对方回合…'
})
const resultText = ref('')

function restart() {
  myPos.value = 0
  aiPos.value = 0
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
  const pos = isMe ? myPos.value : aiPos.value
  let extra = false /* 掷到 6 奖励再走一步 */
  if (pos === 0) {
    if (v === 6) {
      setPos(isMe, 6)
      logText.value = isMe ? '起飞成功，直接落到第 6 格！' : '对方起飞了，落到第 6 格'
      checkCrash(isMe)
      extra = true
    } else {
      logText.value = isMe ? '没掷到 6，无法起飞' : '对方没掷到 6，原地待命'
    }
  } else {
    const target = pos + v
    if (target > TRACK) {
      logText.value = isMe ? `掷出 ${v} 点，超出终点，原地不动` : `对方掷出 ${v} 点，超出终点`
    } else if (target === TRACK) {
      setPos(isMe, TRACK)
      return finish(isMe)
    } else {
      setPos(isMe, target)
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

function setPos(isMe, v) {
  if (isMe) myPos.value = v
  else aiPos.value = v
}

/* 撞机：落到对方所在格，对方回起点 */
function checkCrash(isMe) {
  if (myPos.value === aiPos.value && myPos.value !== 0) {
    if (isMe) {
      aiPos.value = 0
      logText.value = `撞机！对方被撞回起点`
    } else {
      myPos.value = 0
      logText.value = `被对方撞了，你回到了起点`
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
  }, 750)
}

function finish(isMeWin) {
  over.value = true
  resultText.value = isMeWin ? '你抢先到达终点，获胜！' : '对方先到达终点，你输了'
  emit('over', { win: isMeWin, title: isMeWin ? '胜利' : '失利', detail: isMeWin ? '率先抵达 40 格' : '对方率先抵达' })
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
.ap-status { text-align: center; font-size: 14px; color: var(--accent); font-weight: 600; margin: 12px 0; }
.ap-track { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.ap-cell {
  width: 26px; height: 34px; border-radius: 6px; background: var(--bg-soft); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--text-soft);
}
.ap-cell.start { border-color: var(--accent); }
.ap-cell.goal { border-color: #4caf50; background: rgba(76, 175, 80, 0.12); }
.ap-plane { font-style: normal; font-size: 15px; }
.ap-plane.me { filter: hue-rotate(180deg); }
.ap-plane.ai { filter: hue-rotate(-30deg); }
.ap-log { text-align: center; font-size: 12px; color: var(--text-soft); margin: 14px 0 10px; min-height: 16px; }
.ap-btns { display: flex; justify-content: center; gap: 10px; }
</style>
