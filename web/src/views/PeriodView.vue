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
          <i v-else-if="c.inCycle" class="pr-dot" />
          <i v-else-if="c.ovu" class="pr-ovu-dot" />
        </button>
      </div>

      <div class="pr-legend">
        <span><i class="pr-lg pr-lg-dot" /> 经期</span>
        <span><i class="pr-lg pr-lg-flow-light" /> 少</span>
        <span><i class="pr-lg pr-lg-flow-mid" /> 中</span>
        <span><i class="pr-lg pr-lg-flow-heavy" /> 多</span>
        <span><i class="pr-lg pr-lg-pain-mild" /> 轻微</span>
        <span><i class="pr-lg pr-lg-pain-severe" /> 严重</span>
        <span v-if="enough"><i class="pr-lg pr-lg-pred" /> 预测经期</span>
        <span v-if="enough"><i class="pr-lg pr-lg-ovu" /> 排卵期</span>
      </div>

      <!-- 日历下方：选中日期的单卡片（标题=日期，卡片内只有一个开关） -->
      <div v-if="selectedDate" class="pr-record">
        <div class="pr-record-head">
          <span class="pr-record-date">{{ selLabel }}</span>
          <button class="pr-record-close" type="button" @click="selectedDate = ''">收起</button>
        </div>

        <!-- 单开关行：非经期 → 经期开始了（关）；进行中经期内 → 经期结束了（关） -->
        <div v-if="showStartSwitch || showEndSwitch" class="pr-row">
          <span class="pr-row-ic"><AppIcon name="drop" :size="18" color="#c98891" /></span>
          <span class="pr-row-label">{{ showEndSwitch ? '经期结束了' : '经期开始了' }}</span>
          <ToggleSwitch :model-value="false" @update:model-value="onSwitch" />
        </div>

        <!-- 流量/痛经：经期内（含进行中与历史）均可补录 -->
        <template v-if="selCycle">
          <div class="pr-row">
            <span class="pr-row-ic"><AppIcon name="drop" :size="18" color="#e0a4ad" /></span>
            <span class="pr-row-label">流量</span>
            <div class="pr-seg">
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === '' }" @click="setFlow('')">—</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'light' }" @click="setFlow('light')">少</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'mid' }" @click="setFlow('mid')">中</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'heavy' }" @click="setFlow('heavy')">多</button>
            </div>
          </div>
          <div class="pr-row">
            <span class="pr-row-ic"><AppIcon name="bolt" :size="18" color="#d9909a" /></span>
            <span class="pr-row-label">痛经</span>
            <div class="pr-seg">
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'none' }" @click="setPain('none')">无</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'mild' }" @click="setPain('mild')">轻微</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'severe' }" @click="setPain('severe')">严重</button>
            </div>
          </div>
          <div v-if="hasDayRec" class="pr-record-actions">
            <button class="pr-btn danger" type="button" @click="removeDay">移除这一天</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'
import {
  cyclesFromItems, cycleOf, predictedDates,
  fmtDate, addDays, parseDate, dayDiff,
  ongoingCycle, durationOf, ovulationWindow
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
/* 当前进行中的经期 */
const periodOn = computed(() => !!ongoingCycle(cycles.value))

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

/* ═══ 选中日期的单卡片 ═══ */
const selectedDate = ref('')
const selCycle = ref(null)
const dayForm = reactive({ flow: '', pain: 'none' })

const selLabel = computed(() => {
  const d = parseDate(selectedDate.value)
  return d ? `${d.getMonth() + 1}月${d.getDate()}日` : ''
})
const hasDayRec = computed(() => {
  const c = selCycle.value
  return !!(c && c.days && c.days[selectedDate.value])
})

/* 单开关：所选日不在任何经期内且当前无进行中经期 → 「经期开始了」 */
const showStartSwitch = computed(() => {
  if (!selectedDate.value || periodOn.value) return false
  return !cycleOf(cycles.value, selectedDate.value)
})
/* 单开关：所选日在进行中的经期内且不晚于今天 → 「经期结束了」 */
const showEndSwitch = computed(() => {
  if (!selectedDate.value) return false
  const oc = ongoingCycle(cycles.value)
  if (!oc) return false
  return selectedDate.value >= oc.start && selectedDate.value <= todayStr()
})

/* 打开开关：该日标记为经期开始日 / 结束日 */
function onSwitch() {
  if (showEndSwitch.value) endPeriod(selectedDate.value)
  else startPeriod(selectedDate.value)
}

async function startPeriod(date) {
  if (ongoingCycle(cycles.value)) return
  const t = date || todayStr()
  try {
    await add({ title: t, body: '', extra: { start: t, end: t, ongoing: true, days: {} } })
    toast.pushToast({ title: '已记录经期开始' })
    refreshSel()
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
    refreshSel()
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
}

function cellStyle(c) {
  if (c.pred) return { border: '1.5px dashed rgba(201,136,145,.65)' }
  if (c.ovu) return { background: 'rgba(150,120,200,.14)' }
  return null
}

function selectDay(c) {
  dayDate.value = c.date
  selectedDate.value = c.date
  refreshSel()
}
function refreshSel() {
  if (!selectedDate.value) return
  const cyc = cycleOf(cycles.value, selectedDate.value)
  selCycle.value = cyc
  const rec = cyc ? cyc.days[selectedDate.value] : null
  Object.assign(dayForm, { flow: rec ? rec.flow || '' : '', pain: rec ? rec.pain || 'none' : 'none' })
}
function findRaw(id) { return items.value.find((x) => x.id === id) }

/* 点选即保存（无保存/取消按钮） */
async function setFlow(v) {
  dayForm.flow = v
  await persistDay()
}
async function setPain(v) {
  dayForm.pain = v
  await persistDay()
}
async function persistDay() {
  const cyc = selCycle.value
  if (!cyc) return
  const raw = findRaw(cyc.id)
  if (!raw) return
  const days = { ...(raw.extra.days || {}) }
  if (dayForm.flow || dayForm.pain !== 'none') days[selectedDate.value] = { flow: dayForm.flow, pain: dayForm.pain }
  else delete days[selectedDate.value]
  try {
    await update(cyc.id, { extra: { ...raw.extra, days } })
  } catch (e) {
    toast.pushToast({ title: '保存失败', text: e.message })
  }
  refreshSel()
}
async function removeDay() {
  const cyc = selCycle.value
  const raw = findRaw(cyc.id)
  if (!raw) return
  const days = { ...(raw.extra.days || {}) }
  delete days[selectedDate.value]
  let { start, end } = raw.extra
  if (selectedDate.value === start && start < end) start = addDays(start, 1)
  else if (selectedDate.value === end && end > start) end = addDays(end, -1)
  try {
    if (start > end) await removeItem(cyc.id)
    else await update(cyc.id, { extra: { ...raw.extra, start, end, days }, title: start })
    toast.pushToast({ title: '已移除' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
  refreshSel()
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
/* 经期日：日期数字下方低饱和豆沙色小圆点 */
.pr-dot { width: 5px; height: 5px; border-radius: 50%; background: #cfa8ad; display: inline-block; margin-top: 3px; }

.pr-legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 2px 4px; font-size: 11px; color: var(--text-soft); align-items: center; }
.pr-legend span { display: inline-flex; align-items: center; gap: 4px; }
.pr-lg { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #c98891; }
.pr-lg-dot { width: 5px; height: 5px; background: #cfa8ad; }
.pr-lg-flow-light { width: 5px; height: 5px; }
.pr-lg-flow-mid { width: 7px; height: 7px; }
.pr-lg-flow-heavy { width: 9px; height: 9px; }
.pr-lg-pain-mild::after { content: '△'; font-size: 9px; color: #a85b5b; }
.pr-lg-pain-severe::after { content: '✕'; font-size: 9px; color: #a85b5b; }
.pr-lg-pred { background: transparent; border: 1.5px dashed rgba(201,136,145,.65); }

/* 排卵窗口小紫点 */
.pr-ovu-dot { width: 6px; height: 6px; border-radius: 50%; background: #9b7fd0; display: inline-block; margin-top: 3px; }
.pr-lg-ovu { background: #9b7fd0; }

/* 日历下方：选中日期的单卡片（行式列表） */
.pr-record { background: #fff; border-radius: 14px; padding: 4px 14px; margin: 12px 0 4px; box-shadow: 0 1px 3px rgba(180,120,120,.08); }
.pr-record-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 0 6px; }
.pr-record-date { font-size: 15px; font-weight: 600; color: #8a5a5a; }
.pr-record-close { border: none; background: transparent; color: var(--text-soft); font-size: 13px; padding: 4px 8px; }
.pr-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f6ecea; }
.pr-row:last-of-type { border-bottom: none; }
.pr-row-ic { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; background: #fbeef0; display: flex; align-items: center; justify-content: center; }
.pr-row-label { flex: 1; font-size: 15px; font-weight: 500; color: #8a5a5a; min-width: 0; }
.pr-seg { display: flex; gap: 6px; flex: 0 0 auto; }
.pr-seg-btn { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 6px 12px; font-size: 13px; color: var(--text-soft); }
.pr-seg-btn.on { background: #c98891; border-color: #c98891; color: #fff; }
.pr-record-actions { display: flex; gap: 10px; padding: 10px 0 12px; }
.pr-btn { flex: 1; border: none; border-radius: 10px; padding: 12px; font-size: 15px; }
.pr-btn.danger { background: #fbe9e8; color: #d9534f; }
</style>
