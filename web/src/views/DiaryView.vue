<template>
  <div class="md-page">
    <AppHeader title="感知" back>
      <template #right>
        <button class="np-info" @click="infoOpen = true" aria-label="说明"><AppIcon name="more" :size="22" /></button>
      </template>
    </AppHeader>

    <div class="md-body np-body">
      <!-- 模块标题：与心迹「感知此刻」弹窗一致 -->
      <div class="now-head">
        <span class="now-head-ic"><AppIcon name="diary" :size="20" color="var(--accent)" /></span>
        <span class="now-head-title">感知此刻</span>
      </div>

      <!-- 波纹雷达（RippleRadar 复刻，颜色跟随主题色 --accent） -->
      <div class="now-radar" :style="{ opacity: rolling ? 0.35 : 1 }">
        <svg v-if="visual" viewBox="0 0 240 240" class="nr-svg" role="img" aria-label="感知波纹">
          <defs>
            <radialGradient :id="gradId" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="var(--accent)" :stop-opacity="0.35 + visual.intensity * 0.5" />
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
            </radialGradient>
          </defs>
          <circle :cx="cx" :cy="cy" :r="maxR * (0.5 + visual.intensity * 0.4)" :fill="`url(#${gradId})`" />
          <circle
            v-for="(ring, i) in rings"
            :key="'r' + i"
            :cx="cx + Math.sin(tick * Math.PI * 2 + i) * visual.jitter * 10"
            :cy="cy + Math.cos(tick * Math.PI * 2 + i * 1.3) * visual.jitter * 10"
            :r="ring.r"
            fill="none"
            stroke="var(--accent)"
            :stroke-width="1 + visual.intensity * 1.4"
            :stroke-opacity="Math.max(0, ring.opacity)"
          />
          <circle
            v-for="(d, i) in dotPositions"
            :key="'d' + i"
            :cx="d.x"
            :cy="d.y"
            :r="d.r"
            fill="var(--accent)"
            :fill-opacity="d.o"
          />
          <circle :cx="cx" :cy="cy" :r="Math.max(3, coreR)" fill="var(--accent)" :fill-opacity="0.55 + visual.intensity * 0.45" />
          <circle :cx="cx" :cy="cy" :r="Math.max(1.5, coreR * 0.4)" fill="var(--text)" fill-opacity="0.7" />
        </svg>
        <div v-else class="nr-placeholder" />
      </div>

      <!-- 三项结果：空间感 / 存在感 / 情绪状态 -->
      <div class="now-cards">
        <div v-for="r in cards" :key="r.label" class="now-card" :style="{ background: 'color-mix(in oklab, var(--accent) 8%, transparent)' }">
          <span class="nc-label">{{ r.label }}</span>
          <span class="nc-value" :style="{ opacity: result ? 1 : 0.4 }">{{ result ? result[r.key] : '—' }}</span>
        </div>
      </div>

      <div class="now-actions">
        <button class="np-btn ghost" @click="roll" :disabled="rolling">
          <AppIcon name="loop" :size="14" :class="{ spinning: rolling }" />再感知一次
        </button>
      </div>
    </div>

    <!-- 说明弹窗：居中弹窗，右上角 × 关闭 -->
    <div v-if="infoOpen" class="np-mask" @click.self="infoOpen = false">
      <div class="np-dialog">
        <div class="np-dialog-head">
          <h3 class="np-sheet-title">说明</h3>
          <button class="np-close" @click="infoOpen = false" aria-label="关闭"><AppIcon name="close" :size="18" /></button>
        </div>
        <div class="np-dialog-body">
          <div class="np-info-group" v-for="g in INFO_GROUPS" :key="g.title">
            <div class="np-info-row">
              <span class="np-info-title">{{ g.title }}</span>
              <span class="np-info-hint">{{ g.hint }}</span>
            </div>
            <div class="np-info-tags">
              <span class="np-info-tag" v-for="it in g.items" :key="it">{{ it }}</span>
            </div>
          </div>
          <p class="np-info-foot">仅供参考，请注意辨别。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onUnmounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'

/* ═══ 心迹「感知此刻」1:1 抄录：一次性随机感知，三项完全独立，不写入任何记录 ═══ */
const SPACE_OPTIONS = ['就在身边','刚刚来过','正在靠近','距离较远','不在这里','被阻挡了','信号很弱','若即若离','刚离开不久','在附近但没进来']
const PRESENCE_OPTIONS = ['只有一个人','这里有好几个人','有人在附近','有人在附近徘徊','这里没有人','有人经过','有人刚走','有人停在旁边','有人在不远处','有人正往这边来']
const EMOTION_OPTIONS = ['平静','波动','强烈','忽强忽弱','压抑','冷漠','冷静','温和','紧绷','翻涌','忧郁','苦恼','犹豫','激动']

const SPACE_VISUAL = {
  就在身边: { distance: 0.06, density: 7, jitter: 0.02 },
  刚刚来过: { distance: 0.2, density: 5, jitter: 0.16 },
  正在靠近: { distance: 0.32, density: 6, jitter: 0.1 },
  距离较远: { distance: 0.66, density: 3, jitter: 0.06 },
  不在这里: { distance: 0.95, density: 2, jitter: 0.3 },
  被阻挡了: { distance: 0.5, density: 4, jitter: 0.42 },
  信号很弱: { distance: 0.78, density: 2, jitter: 0.5 },
  若即若离: { distance: 0.42, density: 5, jitter: 0.34 },
  刚离开不久: { distance: 0.28, density: 4, jitter: 0.22 },
  在附近但没进来: { distance: 0.58, density: 3, jitter: 0.12 },
}
const PRESENCE_DOTS = {
  只有一个人: 1, 这里有好几个人: 4, 有人在附近: 2, 有人在附近徘徊: 3, 这里没有人: 0,
  有人经过: 1, 有人刚走: 1, 有人停在旁边: 2, 有人在不远处: 2, 有人正往这边来: 3,
}
const EMOTION_VISUAL = {
  平静: { intensity: 0.28, turbulence: 0.1 }, 波动: { intensity: 0.55, turbulence: 0.6 }, 强烈: { intensity: 1, turbulence: 0.85 },
  忽强忽弱: { intensity: 0.7, turbulence: 1 }, 压抑: { intensity: 0.62, turbulence: 0.3 }, 冷漠: { intensity: 0.2, turbulence: 0.05 },
  冷静: { intensity: 0.34, turbulence: 0.15 }, 温和: { intensity: 0.4, turbulence: 0.12 }, 紧绷: { intensity: 0.78, turbulence: 0.45 },
  翻涌: { intensity: 0.88, turbulence: 0.95 }, 忧郁: { intensity: 0.45, turbulence: 0.25 }, 苦恼: { intensity: 0.58, turbulence: 0.5 },
  犹豫: { intensity: 0.5, turbulence: 0.7 }, 激动: { intensity: 0.92, turbulence: 0.8 },
}
const DEFAULT_VISUAL = { distance: 0.4, density: 4, jitter: 0.1, intensity: 0.5, turbulence: 0.3, dots: 1 }

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function perceptionVisual(p) {
  const s = SPACE_VISUAL[p.space] ?? { distance: 0.4, density: 4, jitter: 0.1 }
  const e = EMOTION_VISUAL[p.emotion] ?? { intensity: 0.5, turbulence: 0.3 }
  return { ...s, intensity: e.intensity, turbulence: e.turbulence, dots: PRESENCE_DOTS[p.presence] ?? 1 }
}
function rollPerception() {
  return { space: pick(SPACE_OPTIONS), presence: pick(PRESENCE_OPTIONS), emotion: pick(EMOTION_OPTIONS) }
}

const INFO_GROUPS = [
  { title: '空间感', hint: '此刻彼此的距离与状态', items: SPACE_OPTIONS },
  { title: '存在感', hint: '此刻周围有多少「人」', items: PRESENCE_OPTIONS },
  { title: '情绪状态', hint: '此刻情绪的强弱与起伏', items: EMOTION_OPTIONS },
]

/* ── 状态 ── */
const rolling = ref(false)
const result = ref(null)
const infoOpen = ref(false)
const cards = [
  { label: '空间感', key: 'space' },
  { label: '存在感', key: 'presence' },
  { label: '情绪状态', key: 'emotion' },
]

const visual = computed(() => (result.value ? perceptionVisual(result.value) : DEFAULT_VISUAL))
const cx = 120
const cy = 120
const maxR = 114
const tick = ref(0)
const gradId = 'sense-core'

const rings = computed(() => {
  const v = visual.value
  const count = Math.max(2, Math.round(v.density))
  const base = maxR * (0.3 + (1 - v.distance) * 0.65)
  return Array.from({ length: count }, (_, i) => {
    const ratio = (i + 1) / count
    const phase = (tick.value + i / count) % 1
    const grow = 0.55 + phase * 0.45
    const r = base * ratio * grow
    const opacity = (1 - phase) * (0.2 + v.intensity * 0.7) * (1 - ratio * 0.25)
    return { r, opacity }
  })
})
const dotPositions = computed(() => {
  const v = visual.value
  const n = Math.max(0, Math.min(6, v.dots))
  const ringR = maxR * (0.28 + (1 - v.distance) * 0.3)
  return Array.from({ length: n }, (_, i) => {
    const wobble = Math.sin(tick.value * Math.PI * 2 + i) * (4 + v.turbulence * 8)
    const angle = (Math.PI * 2 * i) / n + tick.value * 0.25 * v.turbulence + Math.PI / 6
    return {
      x: cx + Math.cos(angle) * (ringR + wobble),
      y: cy + Math.sin(angle) * (ringR + wobble),
      r: 2 + v.intensity * 2.5,
      o: 0.5 + v.intensity * 0.5,
    }
  })
})
const coreR = computed(() => 5 + visual.value.intensity * 5 + Math.sin(tick.value * Math.PI * 2) * (1 + visual.value.turbulence * 2))

/* ── 感知结果持久化 ──
   仅作为「再感知一次」过程的中间存档；每次进入感知页（冷启动 /
   keep-alive 返回再进入 / reload）都会重新感知，不再恢复旧结果 */
const LAST_KEY = 'diary_perception_last'
function saveLast(p) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(p)) } catch (e) { /* 忽略 */ }
}

function roll() {
  rolling.value = true
  clearTimeout(rollTimer)
  rollTimer = setTimeout(() => {
    result.value = rollPerception()
    saveLast(result.value)
    rolling.value = false
  }, 420)
}
let rollTimer = null

/* rAF 驱动水波呼吸（波动越强节奏越快） */
let raf = null
let last = 0
function loop(now) {
  const period = 1400 - (visual.value.turbulence ?? 0.3) * 700
  const dt = last ? now - last : 0
  last = now
  tick.value += dt / period
  raf = requestAnimationFrame(loop)
}
onMounted(() => {
  raf = requestAnimationFrame(loop)
  /* 每次进入都重新感知（含 keep-alive 返回再进入，见 onActivated） */
  roll()
})
/* keep-alive 全局缓存：返回桌面再进入只会触发激活，不会重新挂载。
   用户要求每次返回再进入都刷新，这里激活即重新感知 */
onActivated(() => { roll() })
onUnmounted(() => { if (raf) cancelAnimationFrame(raf); clearTimeout(rollTimer) })
</script>

<style scoped>
.np-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.np-info {
  border: none;
  background: transparent;
  padding: 4px;
  color: var(--text-soft);
  display: flex;
}

/* 模块标题：波浪图标 + 感知此刻 */
.now-head { display: flex; align-items: center; gap: 8px; margin: 10px 0 4px; }
.now-head-ic { flex: 0 0 auto; display: flex; }
.now-head-title { font-size: 17px; font-weight: 700; }

/* 波纹雷达区 */
.now-radar { width: 240px; height: 240px; margin: 8px auto 4px; transition: opacity 0.3s; }
.nr-svg { width: 100%; height: 100%; }
.nr-placeholder {
  width: 160px; height: 160px; margin: 40px auto;
  border-radius: 50%;
  border: 1px dashed var(--border);
}

/* 结果卡：窄屏单列，宽屏三列（与心迹一致） */
.now-cards { display: grid; gap: 10px; grid-template-columns: 1fr; width: 100%; margin: 10px 0 4px; }
@media (min-width: 560px) {
  .now-cards { grid-template-columns: repeat(3, 1fr); }
}
.now-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.nc-label { font-size: 11px; color: var(--text-soft); letter-spacing: 1px; }
.nc-value { font-family: var(--font-serif); font-size: 19px; font-weight: 700; color: var(--text); }

/* 操作按钮 */
.now-actions { display: flex; gap: 10px; margin-top: 14px; }
.np-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 999px; padding: 9px 18px; font-size: 13px; font-weight: 600;
}
.np-btn.ghost { border: 1px solid var(--border); background: var(--card-bg-soft); color: var(--text); }
.np-btn :deep(.spinning) { animation: np-spin 0.8s linear infinite; }
@keyframes np-spin { to { transform: rotate(360deg); } }

/* 说明弹窗：居中 */
.np-mask {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: center; justify-content: center; z-index: 50;
  padding: 24px;
}
.np-dialog {
  width: 100%; max-width: 420px; max-height: 80vh;
  display: flex; flex-direction: column;
  background: var(--bg-screen);
  border-radius: 18px; padding: 16px 18px calc(16px + env(safe-area-inset-bottom));
  box-shadow: var(--shadow-strong);
}
.np-dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px; flex: 0 0 auto;
}
.np-dialog-body { overflow-y: auto; min-height: 0; }
.np-close {
  border: none; background: var(--bg-soft); color: var(--text-soft);
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
}
.np-sheet-title { font-size: 16px; font-weight: 700; margin: 0; }
.np-info-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.np-info-row { display: flex; align-items: baseline; gap: 8px; }
.np-info-title { font-size: 13px; font-weight: 600; color: var(--text); }
.np-info-hint { font-size: 11px; color: var(--text-soft); }
.np-info-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.np-info-tag {
  border: 1px solid var(--border); border-radius: 999px;
  padding: 4px 10px; font-size: 12px; color: var(--text-soft);
}
.np-info-foot { text-align: center; font-size: 11px; color: var(--text-soft); margin-top: 4px; }
</style>
