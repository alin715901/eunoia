<template>
  <div class="go-wrap">
    <div class="go-bar">
      <span class="go-side me"><AppAvatar :name="'我'" :avatar="myAvatar" :size="20" />我 ⚫ 提 {{ myCaps }}</span>
      <span class="go-status" :class="{ win: result === 'win', lose: result === 'lose' }">{{ statusText }}</span>
      <span class="go-side ai"><AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="20" />{{ opponent.name }} ⚪ 提 {{ aiCaps }}</span>
    </div>
    <div class="go-board">
      <button
        v-for="(cell, i) in cells"
        :key="i"
        class="go-cell"
        :class="{ black: cell === 1, white: cell === 2, last: lastMove === i }"
        :disabled="cell !== 0 || over || thinking"
        @click="play(i)"
      ></button>
    </div>
    <div class="go-btns">
      <button class="md-btn ghost" :disabled="over || thinking" @click="pass">虚着</button>
      <button class="md-btn ghost" :disabled="over || thinking" @click="giveUp">认输</button>
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'

/* 围棋：9×9，我执黑先手。标准吃子（无气提子）、禁止自杀、双方连续虚着终局，
   按中国规则数地（子 + 围空，无贴目）。AI：优先提子 > 随机占角边 > 虚着。 */
const SIZE = 9
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
const result = ref('')
const lastMove = ref(-1)
const myCaps = ref(0)
const aiCaps = ref(0)
const passes = ref(0) // 连续虚着次数
const scoreText = ref('')

const statusText = computed(() => {
  if (over.value) return scoreText.value || (result.value === 'win' ? '你赢了！' : result.value === 'lose' ? '对方赢了' : '平局')
  return thinking.value ? '对方思考中…' : '你的回合，落子'
})

function idx(r, c) { return r * SIZE + c }
function inBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE }
const NBR = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/* 提取 (r,c) 所在棋块的气数集合 */
function libertiesOf(board, r, c) {
  const color = board[idx(r, c)]
  const stones = [[r, c]]
  const seen = new Set([idx(r, c)])
  const libs = new Set()
  const stack = [[r, c]]
  while (stack.length) {
    const [cr, cc] = stack.pop()
    for (const [dr, dc] of NBR) {
      const nr = cr + dr
      const nc = cc + dc
      if (!inBoard(nr, nc)) continue
      const v = board[idx(nr, nc)]
      if (v === EMPTY) libs.add(idx(nr, nc))
      else if (v === color && !seen.has(idx(nr, nc))) {
        seen.add(idx(nr, nc))
        stones.push([nr, nc])
        stack.push([nr, nc])
      }
    }
  }
  return { stones, libs }
}

function restart() {
  cells.value = new Array(SIZE * SIZE).fill(EMPTY)
  over.value = false
  thinking.value = false
  result.value = ''
  lastMove.value = -1
  myCaps.value = 0
  aiCaps.value = 0
  passes.value = 0
  scoreText.value = ''
}

/* 尝试落子：返回提掉的对方子数；非法（占位/自杀）返回 -1 */
function tryPlace(board, r, c, color) {
  if (board[idx(r, c)] !== EMPTY) return -1
  board[idx(r, c)] = color
  let captured = 0
  for (const [dr, dc] of NBR) {
    const nr = r + dr
    const nc = c + dc
    if (!inBoard(nr, nc)) continue
    const v = board[idx(nr, nc)]
    if (v !== EMPTY && v !== color) {
      const { stones, libs } = libertiesOf(board, nr, nc)
      if (libs.size === 0) {
        for (const [sr, sc] of stones) board[idx(sr, sc)] = EMPTY
        captured += stones.length
      }
    }
  }
  const mine = libertiesOf(board, r, c)
  if (mine.libs.size === 0) {
    /* 自杀，回滚 */
    board[idx(r, c)] = EMPTY
    return -1
  }
  return captured
}

function play(i) {
  if (over.value || thinking.value || cells.value[i] !== EMPTY) return
  const r = Math.floor(i / SIZE)
  const c = i % SIZE
  const board = cells.value.slice()
  const cap = tryPlace(board, r, c, ME)
  if (cap < 0) return
  cells.value = board
  myCaps.value += cap
  lastMove.value = i
  passes.value = 0
  if (board.every((v) => v !== EMPTY)) return finish()
  thinking.value = true
  setTimeout(aiPlay, 400)
}

function aiPlay() {
  if (over.value) return
  const board = cells.value.slice()
  const occupied = board.map((v, i) => (v !== EMPTY ? i : -1)).filter((i) => i >= 0)
  if (!occupied.length) {
    /* 开局占星位 */
    tryPlace(board, 2, 2, AI)
    cells.value = board
    lastMove.value = idx(2, 2)
    thinking.value = false
    return
  }
  const cands = new Set()
  for (const i of occupied) {
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    for (const [dr, dc] of NBR) {
      const nr = r + dr
      const nc = c + dc
      if (inBoard(nr, nc) && board[idx(nr, nc)] === EMPTY) cands.add(idx(nr, nc))
    }
  }
  let best = -1
  let bestScore = -Infinity
  for (const i of cands) {
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    const sim = board.slice()
    const cap = tryPlace(sim, r, c, AI)
    if (cap < 0) continue
    let score = Math.random() * 6
    if (cap > 0) score += 200 + cap * 20 // 提子优先
    else {
      /* 别把自己送入被吃的险地：落完后己方棋块气越少越糟 */
      const { libs } = libertiesOf(sim, r, c)
      score += Math.min(libs.size, 4) * 4
      /* 对方单气棋块 → 叫吃，加分 */
      for (const [dr, dc] of NBR) {
        const nr = r + dr
        const nc = c + dc
        if (!inBoard(nr, nc) || sim[idx(nr, nc)] !== ME) continue
        const eg = libertiesOf(sim, nr, nc)
        if (eg.libs.size === 1) score += 60
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  if (best < 0) {
    /* 无子可下 → 虚着 */
    passes.value += 1
    thinking.value = false
    if (passes.value >= 2) finish()
    return
  }
  const cap = tryPlace(board, Math.floor(best / SIZE), best % SIZE, AI)
  cells.value = board
  aiCaps.value += cap
  lastMove.value = best
  passes.value = 0
  if (board.every((v) => v !== EMPTY)) {
    thinking.value = false
    return finish()
  }
  thinking.value = false
}

function pass() {
  if (over.value || thinking.value) return
  passes.value += 1
  if (passes.value >= 2) return finish()
  thinking.value = true
  setTimeout(aiPlay, 400)
}

function giveUp() {
  if (over.value) return
  over.value = true
  result.value = 'lose'
  scoreText.value = '你认输了，对方赢'
  emit('over', { win: false, title: '失利', detail: '认输' })
}

/* 终局数地：空区只挨黑子 → 黑地，只挨白子 → 白地，都挨 → 公空 */
function finish() {
  if (over.value) return
  const board = cells.value
  const owner = new Array(SIZE * SIZE).fill(0)
  const seen = new Set()
  let black = 0
  let white = 0
  for (let i = 0; i < board.length; i++) {
    if (board[i] === ME) black++
    else if (board[i] === AI) white++
  }
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== EMPTY || seen.has(i)) continue
    const region = [i]
    seen.add(i)
    let touchesMe = false
    let touchesAi = false
    for (let k = 0; k < region.length; k++) {
      const r = Math.floor(region[k] / SIZE)
      const c = region[k] % SIZE
      for (const [dr, dc] of NBR) {
        const nr = r + dr
        const nc = c + dc
        if (!inBoard(nr, nc)) continue
        const v = board[idx(nr, nc)]
        const j = idx(nr, nc)
        if (v === EMPTY && !seen.has(j)) {
          seen.add(j)
          region.push(j)
        } else if (v === ME) touchesMe = true
        else if (v === AI) touchesAi = true
      }
    }
    if (touchesMe && !touchesAi) black += region.length
    else if (touchesAi && !touchesMe) white += region.length
  }
  over.value = true
  thinking.value = false
  scoreText.value = `黑 ${black} : 白 ${white}`
  if (black > white) result.value = 'win'
  else if (white > black) result.value = 'lose'
  else result.value = 'draw'
  emit('over', { win: result.value === 'win', tie: result.value === 'draw', title: result.value === 'win' ? '胜利' : result.value === 'lose' ? '失利' : '平局', detail: scoreText.value })
}

defineExpose({ restart })
restart()
</script>

<style scoped>
.go-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.go-side { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-soft); }
.go-status { font-size: 13px; color: var(--accent); font-weight: 600; }
.go-status.win { color: #4caf50; }
.go-status.lose { color: #e53935; }
.go-board {
  display: grid; grid-template-columns: repeat(9, 1fr); gap: 1px;
  background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
}
.go-cell { aspect-ratio: 1; background: var(--bg-soft); border: 0; padding: 0; cursor: pointer; }
.go-cell:disabled { cursor: default; }
.go-cell.black { background: #222; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--bg-soft); }
.go-cell.white { background: #fff; border-radius: 50%; box-shadow: inset 0 0 0 1px #ddd; }
.go-cell.last { outline: 2px solid var(--accent); outline-offset: -2px; }
.go-btns { display: flex; justify-content: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
</style>
