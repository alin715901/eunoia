<template>
  <div class="pr-page">
    <AppHeader title="经期" back />

    <div class="pr-body">
      <!-- 日历 -->
      <div class="pr-nav">
        <button class="pr-today" @click="goToday">回到今天</button>
        <div class="pr-nav-mid">
          <button class="pr-arrow" type="button" aria-label="上个月" @click="shift(-1)">‹</button>
          <span class="pr-title">{{ year }}年{{ month }}月</span>
          <button class="pr-arrow" type="button" aria-label="下个月" @click="shift(1)">›</button>
        </div>
        <span class="pr-nav-side" />
      </div>

      <div class="pr-grid">
        <span v-for="w in WEEK" :key="w" class="pr-week">{{ w }}</span>
        <button
          v-for="(c, i) in cells"
          :key="i"
          class="pr-cell"
          :class="{ empty: !c.day, today: c.today, selected: c.date === dayDate }"
          :style="cellStyle(c)"
          :data-date="c.date || null"
          @click="c.day && selectDay(c)"
        >
          <span class="pr-day">{{ c.day || '' }}</span>
          <span v-if="c.dayRec" class="pr-marks">
            <i class="pr-flow" :class="c.dayRec.flow" />
            <i v-if="c.dayRec.pain && c.dayRec.pain !== 'none'" class="pr-pain" :class="c.dayRec.pain" />
          </span>
        </button>
      </div>

      <div class="pr-legend">
        <span><i class="pr-lg pr-lg-cycle" /> 经期</span>
        <span><i class="pr-lg pr-lg-flow-light" /> 少</span>
        <span><i class="pr-lg pr-lg-flow-mid" /> 中</span>
        <span><i class="pr-lg pr-lg-flow-heavy" /> 多</span>
        <span><i class="pr-lg pr-lg-pain-mild" /> 轻微</span>
        <span><i class="pr-lg pr-lg-pain-severe" /> 严重</span>
        <span v-if="enough"><i class="pr-lg pr-lg-pred" /> 预测经期</span>
        <span v-if="enough"><i class="pr-lg pr-lg-ovu" /> 排卵期</span>
      </div>

      <!-- 未来日期：不能记录 -->
      <div v-if="isFuture" class="pr-future">
        <span class="pr-future-ic"><AppIcon name="calendar" :size="44" color="#e7bcc3" /></span>
        <p class="pr-future-txt">未来的日子不能记录哦</p>
      </div>

      <!-- 常驻记录卡：开关 + 流量 + 痛经（默认记录今天，点选日期后记录该日） -->
      <div v-else class="pr-record">
        <div class="pr-row">
          <span class="pr-row-ic"><AppIcon name="drop" :size="18" color="#c98891" /></span>
          <span class="pr-row-label">{{ isOngoing ? '经期结束了吗？' : '经期开始了吗？' }}</span>
          <ToggleSwitch :key="switchKey" :model-value="false" @update:model-value="onSwitch" />
        </div>
        <div class="pr-row">
          <span class="pr-row-ic"><AppIcon name="drop" :size="18" color="#e0a4ad" /></span>
          <span class="pr-row-label">流量</span>
          <div class="pr-drops">
            <button
              v-for="f in FLOWS"
              :key="f.v"
              type="button"
              class="pr-drop"
              :class="{ on: dayForm.flow === f.v }"
              :disabled="!inCycle"
              :aria-label="f.t"
              @click="setFlow(f.v)"
            >
              <AppIcon name="drop" :size="f.v === 'light' ? 15 : f.v === 'mid' ? 18 : 21" :color="dayForm.flow === f.v ? '#c98891' : '#cfc7c5'" />
            </button>
          </div>
        </div>
        <div class="pr-row">
          <span class="pr-row-ic"><AppIcon name="bolt" :size="18" color="#d9909a" /></span>
          <span class="pr-row-label">痛经</span>
          <div class="pr-seg">
            <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'none' }" :disabled="!inCycle" @click="setPain('none')">无</button>
            <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'mild' }" :disabled="!inCycle" @click="setPain('mild')">轻微</button>
            <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'severe' }" :disabled="!inCycle" @click="setPain('severe')">严重</button>
          </div>
        </div>
        <div v-if="hasDayRec" class="pr-record-actions">
          <button class="pr-btn danger" type="button" @click="removeDay">移除这一天</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'
import {
  cyclesFromItems, cycleOf, predictedDates,
  fmtDate, addDays, parseDate, dayDiff,
  ongoingCycle, ovulationWindow
} from '@/utils/period'

const { items, loading, load, add, update, remove: removeItem } = useItems('period')
const toast = useNotificationsStore()

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const dayDate = ref(fmtDate(now))

const cycles = computed(() => cyclesFromItems(items.value))
/* 已封存的周期数：≥2 条才开始显示预测/排卵期；否则沿用默认周期规律 */
const enough = computed(() => cycles.value.filter((c) => !c.ongoing && c.end).length >= 2)
const predSet = computed(() => enough.value ? new Set(predictedDates(cycles.value)) : new Set())
/* 排卵期窗口（下次经期开始 - 14 天 ±2 天）所有日期 */
const ovuSet = computed(() => {
  if (!enough.value) return new Set()
  const ovu = ovulationWindow(cycles.value)
  if (!ovu) return new Set()
  const s = new Set()
  let cur = ovu.start
  for (let i = 0; i < 5; i++) { s.add(cur); cur = addDays(cur, 1) }
  return s
})
const isOngoing = computed(() => !!ongoingCycle(cycles.value))

function todayStr() { return fmtDate(new Date()) }

const cells = computed(() => {
  const first = new Date(year.value, month.value - 1, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(year.value, month.value, 0).getDate()
  const out = []
  for (let i = 0; i < startWeekday; i++) out.push({ empty: true })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = fmtDate(new Date(year.value, month.value - 1, d))
    const cyc = cycleOf(cycles.value, date)
    out.push({
      day: d,
      date,
      today: date === todayStr(),
      inCycle: !!cyc,
      pred: predSet.value.has(date) && !cyc,
      ovu: ovuSet.value.has(date) && !cyc && !predSet.value.has(date),
      dayRec: cyc ? cyc.days[date] || null : null,
      cyc
    })
  }
  return out
})

/* ═══ 常驻记录卡：目标日期 = 选中日期 或 今天 ═══ */
const selectedDate = ref('')
const targetDate = computed(() => selectedDate.value || todayStr())
const isFuture = computed(() => targetDate.value > todayStr())
const selCycle = computed(() => cycleOf(cycles.value, targetDate.value))
const inCycle = computed(() => !!selCycle.value)
const hasDayRec = computed(() => {
  const c = selCycle.value
  return !!(c && c.days && c.days[targetDate.value])
})

const FLOWS = [
  { v: 'light', t: '少' },
  { v: 'mid', t: '中' },
  { v: 'heavy', t: '多' }
]
const dayForm = reactive({ flow: '', pain: 'none' })

/* 目标日期或数据变化时，回显该日记录 */
watch([targetDate, cycles], () => {
  const rec = selCycle.value ? selCycle.value.days[targetDate.value] : null
  Object.assign(dayForm, { flow: rec ? rec.flow || '' : '', pain: rec ? rec.pain || 'none' : 'none' })
}, { immediate: true })

/* 开关：点开即执行（未开始 → 从目标日开始；进行中 → 在目标日结束并封存） */
const switchTick = ref(0)
const switchKey = computed(() => (isOngoing.value ? 'end' : 'start') + '-' + switchTick.value)
function onSwitch() {
  switchTick.value++
  if (isOngoing.value) endPeriod(targetDate.value)
  else startPeriod(targetDate.value)
}

async function startPeriod(date) {
  if (ongoingCycle(cycles.value)) return
  let t = date || todayStr()
  if (t > todayStr()) t = todayStr()
  try {
    await add({ title: t, body: '', extra: { start: t, end: t, ongoing: true, days: {} } })
    toast.pushToast({ title: '已记录经期开始' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function endPeriod(date) {
  const cyc = ongoingCycle(cycles.value)
  if (!cyc) return
  const raw = findRaw(cyc.id)
  if (!raw) return
  const ex = raw.extra || {}
  const today = todayStr()
  let t = date || today
  if (t > today) t = today
  if (t < cyc.start) t = cyc.start
  const dur = dayDiff(t, cyc.start) + 1
  try {
    await update(cyc.id, {
      title: cyc.start,
      body: ex.note || '',
      extra: { ...ex, start: cyc.start, end: t, ongoing: false, duration: dur }
    })
    toast.pushToast({ title: '经期已结束', text: `本次共 ${dur} 天，已封存并用于预测` })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

function shift(n) {
  let m = month.value + n
  let y = year.value
  if (m < 1) { m = 12; y -= 1 }
  if (m > 12) { m = 1; y += 1 }
  year.value = y
  month.value = m
}
function goToday() {
  const t = new Date()
  year.value = t.getFullYear()
  month.value = t.getMonth() + 1
  dayDate.value = fmtDate(t)
  selectedDate.value = ''
}

function cellStyle(c) {
  if (c.inCycle) return { background: 'rgba(201,136,145,.20)' }
  if (c.pred) return { border: '1.5px dashed rgba(201,136,145,.65)' }
  if (c.ovu) return { background: 'rgba(150,120,200,.14)' }
  return null
}

function selectDay(c) {
  dayDate.value = c.date
  selectedDate.value = c.date
}
function findRaw(id) { return items.value.find((x) => x.id === id) }

/* 点选即保存（无保存/取消按钮） */
async function setFlow(v) {
  if (!inCycle.value) return
  dayForm.flow = dayForm.flow === v ? '' : v
  await persistDay()
}
async function setPain(v) {
  if (!inCycle.value) return
  dayForm.pain = v
  await persistDay()
}
async function persistDay() {
  const cyc = selCycle.value
  if (!cyc) return
  const raw = findRaw(cyc.id)
  if (!raw) return
  const days = { ...(raw.extra.days || {}) }
  if (dayForm.flow || dayForm.pain !== 'none') days[targetDate.value] = { flow: dayForm.flow, pain: dayForm.pain }
  else delete days[targetDate.value]
  try {
    await update(cyc.id, { extra: { ...raw.extra, days } })
  } catch (e) {
    toast.pushToast({ title: '保存失败', text: e.message })
  }
}
async function removeDay() {
  const cyc = selCycle.value
  const raw = findRaw(cyc.id)
  if (!raw) return
  const days = { ...(raw.extra.days || {}) }
  delete days[targetDate.value]
  let { start, end } = raw.extra
  const d = targetDate.value
  if (d === start && start < end) start = addDays(start, 1)
  else if (d === end && end > start) end = addDays(end, -1)
  try {
    if (start > end) await removeItem(cyc.id)
    else await update(cyc.id, { extra: { ...raw.extra, start, end, days }, title: start })
    toast.pushToast({ title: '已移除' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

onMounted(load)
</script>

<style scoped>
.pr-page { min-height: 100%; background: #fbf7f4; }
.pr-body { padding: 12px; }

.pr-nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin: 4px 0 10px; }
.pr-today { justify-self: start; border: 1px solid var(--border); background: rgba(255,255,255,.6); color: var(--text-soft); border-radius: 999px; padding: 4px 12px; font-size: 12px; }
.pr-nav-mid { display: flex; align-items: center; justify-content: center; gap: 6px; }
.pr-arrow { border: none; background: transparent; font-size: 20px; color: var(--text-soft); padding: 0 4px; }
.pr-title { font-size: 15px; font-weight: 600; min-width: 96px; text-align: center; }
.pr-nav-side { min-width: 0; }

.pr-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.pr-week { text-align: center; font-size: 11px; color: var(--text-soft); padding-bottom: 4px; }
.pr-cell {
  aspect-ratio: 1 / 1; border: none; background: #fff; border-radius: 10px;
  box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  padding: 0; position: relative; color: #6b5555;
}
.pr-cell.empty { background: transparent; }
.pr-cell.today { outline: 1.5px solid #c98891; }
.pr-cell.selected { border: 2px solid #c98891; }
.pr-day { font-size: 13px; }
.pr-marks { display: flex; align-items: center; gap: 2px; }
.pr-flow { width: 6px; height: 6px; border-radius: 50%; background: #c98891; display: inline-block; }
.pr-flow.light { width: 5px; height: 5px; }
.pr-flow.mid { width: 7px; height: 7px; }
.pr-flow.heavy { width: 9px; height: 9px; }
.pr-pain { font-size: 9px; line-height: 1; color: #a85b5b; }
.pr-pain.mild::after { content: '△'; }
.pr-pain.severe::after { content: '✕'; }

.pr-legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 2px 4px; font-size: 11px; color: var(--text-soft); align-items: center; }
.pr-legend span { display: inline-flex; align-items: center; gap: 4px; }
.pr-lg { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #c98891; }
.pr-lg-cycle { width: 10px; height: 10px; border-radius: 3px; background: rgba(201,136,145,.30); }
.pr-lg-flow-light { width: 5px; height: 5px; }
.pr-lg-flow-mid { width: 7px; height: 7px; }
.pr-lg-flow-heavy { width: 9px; height: 9px; }
.pr-lg-pain-mild::after { content: '△'; font-size: 9px; color: #a85b5b; }
.pr-lg-pain-severe::after { content: '✕'; font-size: 9px; color: #a85b5b; }
.pr-lg-pred { background: transparent; border: 1.5px dashed rgba(201,136,145,.65); }

/* 排卵窗口小紫点 */
.pr-ovu-dot { width: 6px; height: 6px; border-radius: 50%; background: #9b7fd0; display: inline-block; margin-top: 3px; }
.pr-lg-ovu { background: #9b7fd0; }

/* 未来日期提示 */
.pr-future { background: #fff; border-radius: 14px; padding: 34px 14px; margin: 12px 0 4px; box-shadow: 0 1px 3px rgba(180,120,120,.08); display: flex; flex-direction: column; align-items: center; gap: 12px; }
.pr-future-ic { display: flex; }
.pr-future-txt { margin: 0; font-size: 13px; color: var(--text-soft); }

/* 常驻记录卡（行式列表） */
.pr-record { background: #fff; border-radius: 14px; padding: 4px 14px; margin: 12px 0 4px; box-shadow: 0 1px 3px rgba(180,120,120,.08); }
.pr-row { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid #f6ecea; }
.pr-row:last-of-type { border-bottom: none; }
.pr-row-ic { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; background: #fbeef0; display: flex; align-items: center; justify-content: center; }
.pr-row-label { flex: 1; font-size: 15px; font-weight: 500; color: #8a5a5a; min-width: 0; }
.pr-seg { display: flex; gap: 6px; flex: 0 0 auto; }
.pr-seg-btn { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 6px 12px; font-size: 13px; color: var(--text-soft); }
.pr-seg-btn.on { background: #c98891; border-color: #c98891; color: #fff; }
.pr-seg-btn:disabled { opacity: .45; }
/* 流量：三颗水滴按钮 */
.pr-drops { display: flex; gap: 14px; flex: 0 0 auto; align-items: center; }
.pr-drop { border: none; background: transparent; padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
.pr-drop:disabled { opacity: .45; }
.pr-record-actions { display: flex; gap: 10px; padding: 10px 0 12px; }
.pr-btn { flex: 1; border: none; border-radius: 10px; padding: 12px; font-size: 15px; }
.pr-btn.danger { background: #fbe9e8; color: #d9534f; }
</style>
