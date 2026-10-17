<template>
  <div class="ap-wrap">
    <div class="ap-bar">
      <span class="ap-side" :class="{ on: turn === 'ai' && !over }"><AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="20" />对方 <b>{{ aiHome }}</b>/4</span>
      <span class="ap-dice" :class="{ rolling }" @click="roll">{{ diceFace }}</span>
      <span class="ap-side" :class="{ on: turn === 'me' && !over }"><b>{{ myHome }}</b>/4 我<AppAvatar :name="'我'" :avatar="myAvatar" :size="20" /></span>
    </div>

    <!-- 双方飞机进度（每架一个点：停机坪 / 赛道上 / 通道中 / 已到家） -->
    <div class="ap-prog">
      <span class="ap-prog-side ai"><i v-for="(p, i) in aiPlanes" :key="i" class="ap-pdot" :class="dotCls(p.st)"></i></span>
      <span class="ap-prog-side me"><i v-for="(p, i) in myPlanes" :key="i" class="ap-pdot" :class="dotCls(p.st)"></i></span>
    </div>

    <!-- 传统飞行棋棋盘：四角停机坪 + 外围公共赛道 + 三角飞行格 + 中心十字终点通道 -->
    <div class="ap-board">
      <span v-for="i in 225" :key="i" class="ap-cell" :class="cellCls(i - 1)"></span>
      <!-- 中心终点 -->
      <span class="ap-goal">🏁</span>
      <!-- 飞机：绝对定位，格子间平滑移动（能看到对方飞机走位） -->
      <span
        v-for="(p, i) in myPlanes" :key="'m' + i"
        class="ap-plane me" :class="{ sel: pending && pending.options.includes(i) }"
        :style="planeStyle('blue', i, p.st)" @click="onPlaneClick(i)">✈️</span>
      <span v-for="(p, i) in aiPlanes" :key="'a' + i" class="ap-plane ai" :style="planeStyle('red', i, p.st)">✈️</span>
    </div>
    <p class="ap-legend">↻ 沿公共赛道顺时针前进 · 踩同色三角飞到远端 · 经本方通道冲向中心终点</p>

    <p class="ap-status">{{ statusText }}</p>
    <p class="ap-log">{{ logText }}</p>
    <div class="ap-btns">
      <button class="md-btn primary" :disabled="over || turn !== 'me' || rolling || !!pending" @click="roll">{{ turn === 'me' && !over ? (pending ? '选择飞机' : '掷骰子') : '对方回合' }}</button>
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { aiDelay } from './aiDelay.js'
import AppAvatar from '@/components/common/AppAvatar.vue'

/* 飞行棋（传统四色棋盘，双人对战）：
   15×15 棋盘：四角为红/黄/蓝/绿停机坪（各 4 架飞机），外围 56 格公共赛道顺时针行进，
   每色有专属起飞点；踩到本方三角飞行格可飞到远端同色三角；走完一圈后进入本方颜色
   终点通道（中心十字）冲向中心终点，需精确点数、超过反弹；落到对方所在格把对方撞回
   停机坪。双方各执一色（你=蓝、对方=红），谁先把任意一架飞机开到中心终点谁获胜。
   - 掷出 6 点一架飞机起飞（落到本方起飞点），并可再掷一次；
   - 一步可能触发：起飞 / 前进 / 飞行 / 进通道 / 反弹 / 撞机 / 到达终点。 */
const SIZE = 15
const RING_N = 56
const CENTER = 62 /* st=62 即到达中心终点 */
const BOUNCE_BASE = 124 /* 超过终点反弹：124 - target */
const FLY = 26 /* 三角飞行格间距 */

/* 环形赛道坐标（15×15 外圈，顺时针）：顶行 0-14、右列 15-28、底行 29-42、左列 43-55 */
const RING = []
for (let c = 0; c <= 14; c++) RING.push([0, c])
for (let r = 1; r <= 14; r++) RING.push([r, 14])
for (let c = 13; c >= 0; c--) RING.push([14, c])
for (let r = 13; r >= 1; r--) RING.push([r, 0])

/* 四色起飞点（赛道格索引）：红=右上、黄=右下、蓝=左下、绿=左上 */
const TAKEOFF = { red: 8, yellow: 22, blue: 36, green: 50 }
/* 三角飞行格：A=起飞点后第 5 格（踩到起飞），B=再前进 26 格的远端同色三角（目的地） */
const TRI_A = { red: 13, yellow: 27, blue: 41, green: 55 }
const TRI_B = { red: 39, yellow: 53, blue: 11, green: 25 }
/* 停机坪（5×5 色块）左上角格子 */
const HANGAR = { green: [1, 1], red: [1, 9], blue: [9, 1], yellow: [9, 9] }
/* 每色终点通道 6 格（从赛道入口笔直通往中心 (7,7)） */
const ARM_CELLS = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]]
}

/* 预计算 225 个格子的类型/归属色 */
const CELL_MAP = []
for (let i = 0; i < SIZE * SIZE; i++) CELL_MAP.push({ t: 'empty' })
const zoneOf = (idx) => {
  for (const c of ['red', 'yellow', 'blue', 'green']) {
    if ((idx - TAKEOFF[c] + RING_N) % RING_N <= 13) return c
  }
  return null
}
RING.forEach(([r, c], idx) => {
  const cell = CELL_MAP[r * SIZE + c]
  cell.t = 'ring'
  cell.color = zoneOf(idx)
  /* 三角飞行格：A 在本方色区内（起飞点后第 5 格）；B 在远端，虽落在对方色区也标本方色 */
  for (const color of ['red', 'yellow', 'blue', 'green']) {
    if (idx === TRI_A[color]) { cell.tri = 'A'; cell.color = color }
    if (idx === TRI_B[color]) { cell.tri = 'B'; cell.color = color }
  }
})
for (const color of ['red', 'yellow', 'blue', 'green']) {
  ARM_CELLS[color].forEach(([r, c]) => {
    const cell = CELL_MAP[r * SIZE + c]
    cell.t = 'arm'
    cell.color = color
  })
  const [hr, hc] = HANGAR[color]
  for (let dr = 0; dr < 5; dr++) {
    for (let dc = 0; dc < 5; dc++) {
      const cell = CELL_MAP[(hr + dr) * SIZE + (hc + dc)]
      cell.t = 'hangar'
      cell.color = color
    }
  }
  /* 停机坪内 4 个停机位 */
  for (const [sr, sc] of [[1, 1], [1, 3], [3, 1], [3, 3]]) {
    CELL_MAP[(hr + sr) * SIZE + (hc + sc)].t = 'slot'
  }
}
CELL_MAP[7 * SIZE + 7].t = 'center'

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' }
})
const emit = defineEmits(['over'])

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const MY = 'blue' /* 我方颜色（左下停机坪） */
const AI = 'red' /* 对方颜色（右上停机坪） */

/* 飞机状态：st = -1 停机坪 | 0..55 赛道（0=本方起飞点，55=通道入口格） | 56..61 通道 1..6 格 | 62 终点 */
const myPlanes = ref([{ st: -1 }, { st: -1 }, { st: -1 }, { st: -1 }])
const aiPlanes = ref([{ st: -1 }, { st: -1 }, { st: -1 }, { st: -1 }])
const turn = ref('me')
const rolling = ref(false)
const pending = ref(null) /* { v, options } 等我点选一架飞机 */
const diceValue = ref(6)
const over = ref(false)
const logText = ref('掷出 6 点，一架飞机起飞')
const resultText = ref('')

const diceFace = computed(() => DICE_FACES[diceValue.value - 1] || '🎲')
const myHome = computed(() => myPlanes.value.filter((p) => p.st >= CENTER).length)
const aiHome = computed(() => aiPlanes.value.filter((p) => p.st >= CENTER).length)
const statusText = computed(() => {
  if (over.value) return resultText.value
  if (rolling.value) return '骰子飞转中…'
  if (pending.value) return '你的回合：点选一架飞机前进'
  if (turn.value === 'me') {
    return myPlanes.value.every((p) => p.st === -1) ? '你的回合：掷出 6 点起飞' : '你的回合：掷骰子前进'
  }
  return '对方回合…'
})

/* 赛道格索引（仅赛道上的飞机有；通道/停机坪返回 -1） */
function ringIdx(color, st) {
  return st >= 0 && st <= 55 ? (TAKEOFF[color] + st) % RING_N : -1
}

/* 一步的落点结算：起飞 / 前进 / 踩三角飞行 / 精确到中心 / 超过反弹 */
function resolve(color, st, v) {
  if (st === -1) return v === 6 ? { to: 0, takeoff: true } : null
  let t = st + v
  if (t === 5) t += FLY /* 踩到本方三角飞行格 → 飞到远端同色三角 */
  if (t === CENTER) return { to: CENTER, win: true }
  if (t > CENTER) return { to: BOUNCE_BASE - t } /* 反弹，仍在通道内 */
  return { to: t }
}

/* 格子样式 */
function cellCls(i) {
  const info = CELL_MAP[i]
  const cls = { 'ap-cell': true }
  if (info.t === 'ring') { cls.ring = true; cls[info.color] = true; if (info.tri) cls.tri = true }
  else if (info.t === 'arm') { cls.arm = true; cls[info.color] = true }
  else if (info.t === 'center') cls.center = true
  else if (info.t === 'hangar') { cls.hangar = true; cls[info.color] = true; cls.dim = info.color !== MY && info.color !== AI }
  else if (info.t === 'slot') { cls.slot = true; cls[info.color] = true; cls.dim = info.color !== MY && info.color !== AI }
  return cls
}

/* 飞机定位：停机坪车位 / 赛道格 / 通道格 / 中心 */
function planeStyle(color, idx, st) {
  let r, c
  if (st === -1) {
    const [hr, hc] = HANGAR[color]
    r = hr + 1 + (idx >= 2 ? 2 : 0)
    c = hc + 1 + (idx % 2 ? 2 : 0)
  } else if (st <= 55) {
    const cell = RING[(TAKEOFF[color] + st) % RING_N]
    r = cell[0]; c = cell[1]
  } else if (st <= 61) {
    const cell = ARM_CELLS[color][st - 56]
    r = cell[0]; c = cell[1]
  } else {
    r = 7; c = 7
  }
  return {
    left: `calc(${c} * (100% / ${SIZE}))`,
    top: `calc(${r} * (100% / ${SIZE}))`,
    width: `calc(100% / ${SIZE})`,
    height: `calc(100% / ${SIZE})`
  }
}

/* 进度点状态 */
function dotCls(st) {
  if (st >= CENTER) return 'home'
  if (st >= 56) return 'arm'
  if (st >= 0) return 'ring'
  return 'hangar'
}

function restart() {
  myPlanes.value = [{ st: -1 }, { st: -1 }, { st: -1 }, { st: -1 }]
  aiPlanes.value = [{ st: -1 }, { st: -1 }, { st: -1 }, { st: -1 }]
  turn.value = 'me'
  rolling.value = false
  pending.value = null
  diceValue.value = 6
  over.value = false
  resultText.value = ''
  logText.value = '掷出 6 点，一架飞机起飞'
}

function roll() {
  if (over.value || turn.value !== 'me' || rolling.value || pending.value) return
  rolling.value = true
  let spins = 0
  const spin = setInterval(() => {
    diceValue.value = 1 + Math.floor(Math.random() * 6)
    if (++spins >= 8) {
      clearInterval(spin)
      const v = 1 + Math.floor(Math.random() * 6)
      diceValue.value = v
      rolling.value = false
      doMove('me', v)
    }
  }, 70)
}

/* 掷完骰子：决定起飞 / 自动走 / 等我选 / 对方走 */
function doMove(side, v) {
  const planes = side === 'me' ? myPlanes.value : aiPlanes.value
  const color = side === 'me' ? MY : AI
  /* 掷 6 且停机坪有飞机 → 自动起飞一架 */
  if (v === 6) {
    const h = planes.findIndex((p) => p.st === -1)
    if (h >= 0) { applyMove(side, h, v, true); return }
  }
  const options = []
  planes.forEach((p, i) => { if (resolve(color, p.st, v)) options.push(i) })
  if (!options.length) {
    logText.value = side === 'me' ? '没有能动的飞机，跳过' : '对方没有能动的飞机'
    passTurn(side)
    return
  }
  if (options.length === 1) { applyMove(side, options[0], v); return }
  if (side === 'me') {
    pending.value = { v, options }
    return
  }
  /* 对方：选落点最远的一架 */
  let best = options[0], bestTo = -1
  for (const i of options) {
    const r = resolve(color, planes[i].st, v)
    if (r.to > bestTo) { bestTo = r.to; best = i }
  }
  applyMove(side, best, v)
}

/* 我点选飞机 */
function onPlaneClick(idx) {
  if (turn.value !== 'me' || !pending.value) return
  if (!pending.value.options.includes(idx)) return
  const v = pending.value.v
  pending.value = null
  applyMove('me', idx, v)
}

function applyMove(side, idx, v, takeoff = false) {
  const planes = side === 'me' ? myPlanes.value : aiPlanes.value
  const color = side === 'me' ? MY : AI
  const from = planes[idx].st
  const r = resolve(color, from, v)
  planes[idx].st = r.to
  const who = side === 'me' ? '你' : '对方'

  /* 事件文案 */
  if (takeoff) logText.value = `${who}掷出 6 点，一架飞机起飞`
  else if (from + v === 5) logText.value = `${who}踩到飞行格，直接飞到远端同色三角！`
  else if (r.win) logText.value = `${who}的飞机冲过终点！`
  else if (r.to !== from + v) logText.value = `${who}超过终点，反弹回通道第 ${r.to - 55} 格`
  else if (from < 56 && r.to >= 56) logText.value = `${who}的飞机进入本方终点通道`
  else logText.value = `${who}前进到${r.to <= 55 ? '第 ' + r.to + ' 格' : '通道第 ' + (r.to - 55) + ' 格'}`

  /* 撞机：落到对方所在格，把对方全部撞回停机坪 */
  if (!r.win) {
    const opp = side === 'me' ? aiPlanes.value : myPlanes.value
    const oppColor = side === 'me' ? AI : MY
    const at = ringIdx(color, r.to)
    if (at >= 0) {
      let hit = 0
      opp.forEach((p) => { if (ringIdx(oppColor, p.st) === at) { p.st = -1; hit++ } })
      if (hit) logText.value = `撞机！${who}把对方撞回了停机坪`
    }
  }

  if (r.win) { finish(side === 'me'); return }
  /* 掷 6 再掷一次 */
  if (v === 6) {
    if (side === 'ai') aiTurn()
    return
  }
  passTurn(side)
}

function passTurn(side) {
  if (side === 'me') {
    turn.value = 'ai'
    aiTurn()
  } else {
    turn.value = 'me'
  }
}

function aiTurn() {
  if (over.value) return
  setTimeout(() => {
    if (over.value) return
    const v = 1 + Math.floor(Math.random() * 6)
    diceValue.value = v
    doMove('ai', v)
  }, aiDelay(900, 4200))
}

function finish(iWin) {
  over.value = true
  resultText.value = iWin ? '你的飞机率先抵达中心终点，获胜！' : '对方的飞机先到终点，你输了'
  emit('over', {
    win: iWin,
    title: iWin ? '胜利' : '失利',
    detail: iWin ? '你的飞机率先抵达中心终点' : '对方抢先抵达中心终点'
  })
}

defineExpose({ restart })
restart()
</script>

<style scoped>
/* 柔和四色（降饱和，避免鲜艳刺眼） */
.ap-cell.red, .ap-plane.red, .ap-pdot.red { --cc: #c25e54; }
.ap-cell.yellow, .ap-pdot.yellow { --cc: #c19a4d; }
.ap-cell.blue, .ap-plane.blue, .ap-pdot.blue { --cc: #5c85b8; }
.ap-cell.green, .ap-pdot.green { --cc: #63975f; }

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
/* 双方飞机进度点 */
.ap-prog { display: flex; justify-content: space-between; margin-top: 8px; }
.ap-prog-side { display: flex; gap: 5px; }
.ap-pdot {
  width: 9px; height: 9px; border-radius: 50%; display: inline-block;
  background: var(--cc, var(--border)); opacity: 0.28; transition: all 0.2s;
}
.ap-pdot.ring { opacity: 0.65; }
.ap-pdot.arm { opacity: 1; box-shadow: 0 0 0 2px color-mix(in srgb, var(--cc) 35%, transparent); }
.ap-pdot.home { opacity: 1; background: var(--accent); }
/* 传统方形棋盘：15×15 网格 */
.ap-board {
  position: relative; width: 100%; max-width: 340px; aspect-ratio: 1 / 1;
  margin: 12px auto 0; display: grid;
  grid-template-columns: repeat(15, 1fr); grid-template-rows: repeat(15, 1fr);
}
.ap-cell { border-radius: 3px; }
/* 赛道格：柔色圆点连成珠链赛道 */
.ap-cell.ring { border-radius: 50%; background: color-mix(in srgb, var(--cc) 16%, transparent); border: 1px solid color-mix(in srgb, var(--cc) 48%, transparent); }
/* 三角飞行格：同色小三角 */
.ap-cell.tri { background: transparent; border-color: transparent; position: relative; }
.ap-cell.tri::before {
  content: ''; position: absolute; inset: 18%;
  background: var(--cc); opacity: 0.72;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}
/* 终点通道格 */
.ap-cell.arm { background: color-mix(in srgb, var(--cc) 20%, transparent); border: 1px solid color-mix(in srgb, var(--cc) 52%, transparent); border-radius: 4px; }
/* 停机坪与停机位 */
.ap-cell.hangar { background: color-mix(in srgb, var(--cc) 9%, transparent); border-radius: 6px; }
.ap-cell.slot {
  background: var(--bg-screen); border: 1px solid color-mix(in srgb, var(--cc) 42%, transparent);
  border-radius: 5px; margin: 1px;
}
.ap-cell.dim { opacity: 0.32; }
/* 中心终点 */
.ap-goal {
  position: absolute; left: calc(7 * (100% / 15)); top: calc(7 * (100% / 15));
  width: calc(100% / 15); height: calc(100% / 15);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
  z-index: 1;
}
/* 飞机：格子间平滑移动 */
.ap-plane {
  position: absolute; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-style: normal; border-radius: 50%;
  transition: left 0.35s ease, top 0.35s ease; pointer-events: none; z-index: 2;
}
.ap-plane.me { background: color-mix(in srgb, #5c85b8 24%, transparent); box-shadow: 0 0 0 1.5px color-mix(in srgb, #5c85b8 65%, transparent); }
.ap-plane.ai { background: color-mix(in srgb, #c25e54 20%, transparent); box-shadow: 0 0 0 1.5px color-mix(in srgb, #c25e54 60%, transparent); }
/* 待选飞机：可点击 + 呼吸高亮 */
.ap-plane.sel { pointer-events: auto; cursor: pointer; animation: ap-breathe 0.9s ease-in-out infinite; z-index: 3; }
@keyframes ap-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.22); }
}
.ap-legend { text-align: center; font-size: 11px; color: var(--text-soft); margin-top: 10px; line-height: 1.6; }
.ap-status { text-align: center; font-size: 14px; color: var(--accent); font-weight: 600; margin: 10px 0 0; }
.ap-log { text-align: center; font-size: 12px; color: var(--text-soft); margin: 8px 0 10px; min-height: 16px; }
.ap-btns { display: flex; justify-content: center; gap: 10px; }
</style>
