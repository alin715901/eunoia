<template>
  <div class="gk-wrap">
    <div class="gk-bar">
      <span class="gk-side ai"><AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="20" />{{ opponent.name }} ⚪</span>
      <span class="gk-status" :class="{ win: result === 'win', lose: result === 'lose' }">{{ statusText }}</span>
      <span class="gk-side me"><AppAvatar :name="'我'" :avatar="myAvatar" :size="20" />我 ⚫</span>
    </div>
    <div class="gk-board">
      <button
        v-for="(cell, i) in cells"
        :key="i"
        class="gk-cell"
        :class="{ black: cell === 1, white: cell === 2, last: lastMove === i }"
        :disabled="cell !== 0 || over || thinking"
        @click="play(i)"
      ></button>
    </div>
    <div class="gk-btns">
      <button class="md-btn ghost" @click="restart">重新开始</button>
      <button class="md-btn ghost" @click="giveUp">认输</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { aiDelay } from './aiDelay.js'
import AppAvatar from '@/components/common/AppAvatar.vue'

/* 五子棋：15×15，我执黑先手，对方执白。
   AI 思路：能赢的点直接赢 → 我能赢的点直接堵 → 否则按双方棋形打分取最优。 */
const SIZE = 15
const EMPTY = 0
const ME = 1
const AI = 2

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' }
})
const emit = defineEmits(['over'])

const cells = ref(new Array(SIZE * SIZE).fill(EMPTY))
const over = ref(false)
const thinking = ref(false)
const result = ref('') // win | lose | draw
const lastMove = ref(-1)
const winLine = ref([])

const statusText = computed(() => {
  if (result.value === 'win') return '你赢了！五子连珠'
  if (result.value === 'lose') return '对方赢了，再接再厉'
  if (result.value === 'draw') return '平局'
  return thinking.value ? '对方思考中…' : '你的回合，落子'
})

function restart() {
  cells.value = new Array(SIZE * SIZE).fill(EMPTY)
  over.value = false
  thinking.value = false
  result.value = ''
  lastMove.value = -1
  winLine.value = []
}

function idx(r, c) { return r * SIZE + c }
function inBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE }

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]]

/* 以 (r,c) 落 color 子后是否五连（含两端延伸判断，返回连珠线） */
function winCells(board, r, c, color) {
  for (const [dr, dc] of DIRS) {
    const line = [[r, c]]
    for (const s of [1, -1]) {
      let nr = r + dr * s
      let nc = c + dc * s
      while (inBoard(nr, nc) && board[idx(nr, nc)] === color) {
        line.push([nr, nc])
        nr += dr * s
        nc += dc * s
      }
    }
    if (line.length >= 5) return line
  }
  return null
}

function finish(res) {
  over.value = true
  result.value = res
  const title = res === 'win' ? '胜利' : res === 'lose' ? '失利' : '平局'
  emit('over', { win: res === 'win', tie: res === 'draw', title, detail: '' })
}

function play(i) {
  if (over.value || thinking.value || cells.value[i] !== EMPTY) return
  place(i, ME)
  const line = winCells(cells.value, Math.floor(i / SIZE), i % SIZE, ME)
  if (line) {
    winLine.value = line.map(([r, c]) => idx(r, c))
    return finish('win')
  }
  if (cells.value.every((v) => v !== EMPTY)) return finish('draw')
  thinking.value = true
  setTimeout(aiPlay, aiDelay())
}

function place(i, color) {
  cells.value[i] = color
  lastMove.value = i
}

/* ── AI ── */
function lineScore(board, r, c, color) {
  /* 在 (r,c) 落 color 子，四个方向的棋形总分 */
  let total = 0
  for (const [dr, dc] of DIRS) {
    let count = 1
    let openEnds = 0
    for (const s of [1, -1]) {
      let nr = r + dr * s
      let nc = c + dc * s
      let open = false
      while (inBoard(nr, nc) && board[idx(nr, nc)] === color) {
        count++
        nr += dr * s
        nc += dc * s
      }
      if (inBoard(nr, nc) && board[idx(nr, nc)] === EMPTY) open = true
      if (open) openEnds++
    }
    if (count >= 5) total += 100000
    else if (count === 4) total += openEnds === 2 ? 10000 : openEnds === 1 ? 1200 : 0
    else if (count === 3) total += openEnds === 2 ? 900 : openEnds === 1 ? 120 : 0
    else if (count === 2) total += openEnds === 2 ? 100 : openEnds === 1 ? 15 : 0
    else total += openEnds === 2 ? 10 : 1
  }
  return total
}

function aiPlay() {
  if (over.value) return
  const board = cells.value
  const occupied = board.map((v, i) => (v !== EMPTY ? i : -1)).filter((i) => i >= 0)
  if (!occupied.length) {
    place(idx(7, 7), AI)
    thinking.value = false
    return
  }
  /* 候选点：已有棋子周围 2 格内的空点 */
  const cands = new Set()
  for (const i of occupied) {
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr
        const nc = c + dc
        if (inBoard(nr, nc) && board[idx(nr, nc)] === EMPTY) cands.add(idx(nr, nc))
      }
    }
  }
  let best = -1
  let bestScore = -Infinity
  for (const i of cands) {
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    const atk = lineScore(board, r, c, AI)
    const def = lineScore(board, r, c, ME)
    const score = atk * 1.05 + def * 0.95 + Math.random() * 8
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  if (best < 0) {
    thinking.value = false
    return finish('draw')
  }
  place(best, AI)
  const line = winCells(cells.value, Math.floor(best / SIZE), best % SIZE, AI)
  if (line) {
    winLine.value = line.map(([r, c]) => idx(r, c))
    thinking.value = false
    return finish('lose')
  }
  if (cells.value.every((v) => v !== EMPTY)) {
    thinking.value = false
    return finish('draw')
  }
  thinking.value = false
}

function giveUp() {
  if (over.value) return
  finish('lose')
}

defineExpose({ restart })
restart()
</script>

<style scoped>
.gk-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.gk-side { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-soft); }
.gk-status { font-size: 13px; color: var(--accent); font-weight: 600; }
.gk-status.win { color: #4caf50; }
.gk-status.lose { color: #e53935; }
.gk-board {
  display: grid; grid-template-columns: repeat(15, 1fr); gap: 1px;
  background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
}
.gk-cell { aspect-ratio: 1; background: var(--bg-soft); border: 0; padding: 0; cursor: pointer; -webkit-appearance: none; appearance: none; }
/* 对方思考中：棋盘不可点但不压暗（iOS WebKit 对 disabled 有 UA 级硬编码压暗，
   Blink/WebKit 还会调淡 disabled 的 color） */
.gk-cell:disabled { cursor: default; opacity: 1; -webkit-opacity: 1; color: inherit; -webkit-text-fill-color: currentcolor; }
.gk-cell.black { background: #222; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--bg-soft); }
.gk-cell.white { background: #fff; border-radius: 50%; box-shadow: inset 0 0 0 1px #ddd; }
.gk-cell.last { outline: 2px solid var(--accent); outline-offset: -2px; }
.gk-btns { display: flex; justify-content: center; gap: 10px; margin-top: 16px; }
</style>
