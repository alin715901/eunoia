<template>
  <div class="mg-wrap">
    <!-- 双人模式：双方轮流，每人翻两张，无输赢，翻完全部结束。
         布局固定「对方在左、我在右」，与其余游戏一致 -->
    <div v-if="together" class="mg-vs">
      <span class="mg-side" :class="{ on: turn === 'ai' }">
        <AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="22" />
        {{ opponent.name }} <b>{{ aiSteps }}</b>
      </span>
      <span class="mg-turn">{{ turn === 'me' ? '你的回合' : '对方翻牌中…' }}</span>
      <span class="mg-side" :class="{ on: turn === 'me' }">
        <b>{{ mySteps }}</b> 我
        <AppAvatar :name="'我'" :avatar="myAvatar" :size="22" />
      </span>
    </div>

    <div class="mg-bar">
      <span v-if="!together" class="mg-stat">步数 <b>{{ steps }}</b></span>
      <span v-if="together" class="mg-stat">共 <b>{{ steps }}</b> 步</span>
      <span class="mg-stat">用时 <b>{{ timeText }}</b></span>
      <span v-if="!together" class="mg-stat">最佳 <b>{{ bestText }}</b></span>
    </div>

    <div class="mg-grid" :class="{ busy: together && turn !== 'me' }">
      <button
        v-for="c in cards"
        :key="c.key"
        class="mg-card"
        :class="{ open: c.open, done: c.done, first: c === first }"
        :disabled="together && turn !== 'me'"
        @click="flip(c)"
      >
        <span v-if="c.open || c.done" class="mg-face">{{ c.emoji }}</span>
        <span v-else class="mg-back">🍂</span>
      </button>
    </div>

    <p v-if="cleared" class="mg-win">全部配对成功！{{ steps }} 步 · {{ timeText }}</p>
    <p v-else-if="together && first" class="mg-hint">已翻开一张，再翻一张试试配对</p>

    <div class="mg-btns">
      <button class="md-btn ghost" @click="reset">重新开始</button>
      <button class="md-btn primary" @click="shuffle">换一批</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onDeactivated } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useGameRecords } from '@/composables/useGameRecords'
import { aiDelay } from './aiDelay.js'

/* 默契翻牌：
   - 单人：休闲计时局，没有输赢，翻完所有配对即结束，比步数和用时；
   - 双人（受邀一起玩）：双方轮流，每人翻两张，同样没有输赢，
     翻完全部为结束。图案用动物/植物（不用功能图标）。 */
const EMOJI_POOL = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵',
  '🌵', '🌻', '🌲', '🍀', '🌸', '🍄', '🌙', '⭐', '🌈', '🍁', '🐝', '🦋']

const props = defineProps({
  opponent: { type: Object, default: () => ({ id: 0, name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' },
  /* 双人模式：由对局页显式告知（受邀进入），不能靠 opponent.id 判断——
     单人玩时对局页也会填一个默认对手行用的联系人 */
  together: { type: Boolean, default: false }
})
const emit = defineEmits(['over'])
const { bestOf, save } = useGameRecords()

/* 双人模式由对局页显式传入（受邀一起玩才为 true） */
const together = computed(() => !!props.together)

const cards = ref([])
const steps = ref(0)
const seconds = ref(0)
const timer = ref(null)
const first = ref(null)
const lock = ref(false)
const best = ref(null)

/* 双人模式状态 */
const turn = ref('me') // me | ai
const mySteps = ref(0)
const aiSteps = ref(0)

const cleared = computed(() => cards.value.length > 0 && cards.value.every((c) => c.done))
const timeText = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
const bestText = computed(() => (best.value?.value ? `${best.value.value} 步` : '--'))

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function build(pool) {
  const picked = pool.slice(0, 8)
  const deck = [...picked, ...picked]
    .map((emoji, i) => ({ key: `${emoji}-${i}`, emoji, open: false, done: false }))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  cards.value = deck
  steps.value = 0
  seconds.value = 0
  first.value = null
  lock.value = false
  turn.value = 'me'
  mySteps.value = 0
  aiSteps.value = 0
  startTimer()
}
function shuffle() {
  build(EMOJI_POOL.slice().sort(() => Math.random() - 0.5))
}
function reset() {
  build(EMOJI_POOL.slice().sort(() => Math.random() - 0.5))
}
function startTimer() {
  stopTimer()
  timer.value = setInterval(() => {
    seconds.value += 1
  }, 1000)
}
function stopTimer() {
  if (timer.value) clearInterval(timer.value)
  timer.value = null
}

/* 两张牌结算：同图案配对成功，不同则翻回背面 */
function resolvePair(a, b) {
  if (a.emoji === b.emoji) {
    a.done = true
    b.done = true
    return true
  }
  a.open = false
  b.open = false
  return false
}

/* 组件被 keep-alive 停用 / 销毁后，旧的异步翻牌链不再向对局页抛结算，
   避免退出对局后又被残留的 aiTurn 链弹出结算弹窗 */
let gone = false
onDeactivated(() => { gone = true })
onBeforeUnmount(() => { gone = true; stopTimer() })

async function finishTogether() {
  if (gone) return
  stopTimer()
  emit('over', {
    noVs: true,
    title: '全部翻完啦',
    detail: `你 ${mySteps.value} 步 · 对方 ${aiSteps.value} 步 · ${timeText.value}`,
    rec: { mode: 'together', seconds: seconds.value, mySteps: mySteps.value, aiSteps: aiSteps.value }
  })
}

async function saveBest() {
  const rec = { value: steps.value }
  const detail = `${steps.value} 步 · ${timeText.value}`
  const historyRec = { mode: 'solo', seconds: seconds.value, steps: steps.value }
  try {
    const r = await save('memory', rec, { lowerBetter: true })
    if (r === 'new') {
      best.value = await bestOf('memory')
    }
    if (!gone) emit('over', { solo: true, title: '全部配对成功', detail, rec: historyRec })
  } catch (e) {
    /* 纪录失败不影响游戏 */
    if (!gone) emit('over', { solo: true, title: '全部配对成功', detail, rec: historyRec })
  }
}

/* 我翻一张（单人随时可翻；双人仅我的回合且每轮翻两张） */
async function flip(c) {
  if (lock.value || c.open || c.done) return
  if (together.value && turn.value !== 'me') return
  c.open = true
  if (!first.value) {
    first.value = c
    return
  }
  const a = first.value
  first.value = null
  mySteps.value += 1
  steps.value += 1
  if (a.emoji === c.emoji) {
    /* 配对成功：两张标记为已完成，保持亮色摆在桌上（✓ 角标标识），
       第二张牌翻上来的瞬间就能看到配对成功的高亮 */
    a.done = true
    c.done = true
  } else {
    /* 配对失败：先把两张都亮一会儿让用户看清「第二张确实翻开了」，
       再翻回背面——避免同一同步块里开→关，看着像第二张翻不了 */
    lock.value = true
    await sleep(520)
    a.open = false
    c.open = false
    await sleep(180)
    lock.value = false
  }
  if (cleared.value) {
    if (together.value) await finishTogether()
    else await saveBest()
    return
  }
  if (together.value) {
    turn.value = 'ai'
    aiTurn()
  }
}

/* 双人模式：对方翻两张 */
async function aiTurn() {
  if (gone) return
  if (cleared.value) return
  await sleep(aiDelay(1000, 5000))
  if (gone) return
  const closed = cards.value.filter((c) => !c.open && !c.done)
  if (closed.length < 2) {
    turn.value = 'me'
    return
  }
  const a = closed[Math.floor(Math.random() * closed.length)]
  a.open = true
  await sleep(680)
  const rest = cards.value.filter((c) => !c.open && !c.done && c !== a)
  if (!rest.length) {
    /* 理论上不可达（closed>=2 保证 rest>=1）；兜底：先把翻开的第一张翻回再还回合 */
    a.open = false
    turn.value = 'me'
    return
  }
  const b = rest[Math.floor(Math.random() * rest.length)]
  b.open = true
  await sleep(520)
  aiSteps.value += 1
  steps.value += 1
  resolvePair(a, b)
  await sleep(650)
  if (cleared.value) {
    await finishTogether()
    return
  }
  turn.value = 'me'
}

onMounted(async () => {
  best.value = await bestOf('memory')
  reset()
})
</script>

<style scoped>
.mg-bar { display: flex; gap: 14px; justify-content: center; margin-bottom: 14px; }
.mg-stat { font-size: 12px; color: var(--text-soft); }
.mg-stat b { font-size: 14px; color: var(--text); margin-left: 2px; }
.mg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.mg-card {
  aspect-ratio: 3 / 4; border: 1px solid var(--border); border-radius: 14px;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center; padding: 0;
  position: relative;
  /* 去掉 iOS 原生按钮渲染：原生 appearance 会带来 UA 级背景/描边，
     与我们的自定义样式叠加后在 disabled 态出现不可控的压暗 */
  -webkit-appearance: none; appearance: none;
}
/* 翻开/配对态：背景与牌背保持一致（不翻转、不混色）——深色主题下
   --bg-screen 比牌背 --bg-soft 更暗，任何「换底色」的写法都会让翻开的牌
   看起来变暗（用户反馈过三次）。状态区分靠 accent 边框 + ✓ 角标 +
   第一张的光圈脉冲 + 牌面图案本身，深浅主题下观感一致 */
.mg-card.open, .mg-card.done { border-color: var(--accent); }
/* 已配对：保持正常亮色不变暗——第二张牌翻上来时看得见「配对成功」的高亮瞬间。
   与「正在翻」的牌靠 ✓ 角标 + 实线边框区分（正在翻的第一张有光圈脉冲） */
.mg-card.done::after {
  content: '✓'; position: absolute; top: 4px; right: 7px;
  font-size: 12px; font-weight: 700; color: var(--accent); line-height: 1;
}
/* 当前翻开的第一张：光圈脉冲提示「再翻一张配对」。
   用 box-shadow 而不用 transform：不改变元素几何，避免牌面持续位移
   （自动化工具/辅助技术的稳定性判定、误触判定都会受影响） */
.mg-card.first { border-color: var(--accent); animation: mg-pulse 1.1s ease-in-out infinite; }
@keyframes mg-pulse {
  0%, 100% { box-shadow: 0 0 0 1px var(--accent); }
  50% { box-shadow: 0 0 0 4px var(--accent); }
}
/* 对方回合：整板不可点但不压暗——牌面保持正常亮度，避免看得费劲。
   iOS WebKit 对 disabled 表单元素有 UA 级硬编码压暗（约 0.3~0.4），
   且标准 opacity 不一定覆盖得住，必须显式重置 opacity / -webkit-opacity；
   Blink/WebKit 还会把 disabled 的 color 调淡（-webkit-text-fill-color 跟随
   currentcolor），一并重置回继承色——用户先后反馈过四次「变暗」，根因即此 */
.mg-grid.busy,
.mg-grid.busy .mg-card,
.mg-card:disabled {
  opacity: 1;
  -webkit-opacity: 1;
}
.mg-card:disabled {
  cursor: default;
  color: inherit;
  -webkit-text-fill-color: currentcolor;
}
.mg-face { font-size: 30px; line-height: 1.5; }
/* 牌背正常亮度：不刻意压暗，和牌面一样看得清 */
.mg-back { font-size: 22px; }
.mg-win { text-align: center; color: var(--accent); font-size: 14px; margin-top: 16px; }
.mg-hint { text-align: center; color: var(--text-soft); font-size: 12px; margin-top: 14px; }
.mg-btns { display: flex; justify-content: center; gap: 10px; margin-top: 18px; }

/* 双人模式：双方条 + 回合提示 */
.mg-vs {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 14px;
  padding: 8px 12px; margin-bottom: 12px;
}
.mg-side { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-soft); }
.mg-side b { font-size: 15px; color: var(--text); }
.mg-side.on { color: var(--accent); font-weight: 600; }
.mg-side.on b { color: var(--accent); }
.mg-turn { font-size: 12px; color: var(--accent); font-weight: 600; }
</style>
