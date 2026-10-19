<template>
  <div class="pr-page">
    <AppHeader title="经期" back>
      <template #right>
        <button class="pr-op" @click="openCycleAdd" aria-label="新建记录"><AppIcon name="plus" :size="22" /></button>
      </template>
    </AppHeader>

    <div class="pr-body">
      <div class="pr-summary">
        <span class="pr-sum-ic"><AppIcon name="drop" :size="26" color="#c98891" /></span>
        <span class="pr-sum-main">
          <span class="pr-sum-title">{{ summaryTitle }}</span>
          <span class="pr-sum-sub">{{ summarySub }}</span>
        </span>
      </div>

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
          :class="{ empty: !c.day, today: c.today, selected: c.date === dayDate, ovu: c.ovu }"
          :style="cellStyle(c)"
          :data-date="c.date || null"
          @click="c.day && openDay(c)"
        >
          <span class="pr-day">{{ c.day || '' }}</span>
          <span v-if="c.dayRec" class="pr-marks">
            <i class="pr-flow" :class="c.dayRec.flow" />
            <i v-if="c.dayRec.pain && c.dayRec.pain !== 'none'" class="pr-pain" :class="c.dayRec.pain" />
          </span>
          <i v-else-if="c.ovu" class="pr-ovu-dot" />
        </button>
      </div>

      <!-- 日历下方：经期开关条 -->
      <div class="pr-toggle" :class="{ on: periodOn }">
        <div class="pr-toggle-left">
          <span class="pr-toggle-ic"><AppIcon name="drop" :size="18" color="#c98891" /></span>
          <span class="pr-toggle-txt">
            <span class="pr-toggle-title">{{ periodOn ? '经期结束了' : '经期开始了' }}</span>
            <span class="pr-toggle-sub">{{ periodOn ? '已持续 ' + ongoingDays + ' 天 · 点开关结束并封存本次经期' : '点开关，开始记录本次经期' }}</span>
          </span>
        </div>
        <ToggleSwitch :model-value="periodOn" @update:model-value="onToggle" />
      </div>

      <div class="pr-legend">
        <span><i class="pr-lg pr-lg-flow-light" /> 少</span>
        <span><i class="pr-lg pr-lg-flow-mid" /> 中</span>
        <span><i class="pr-lg pr-lg-flow-heavy" /> 多</span>
        <span><i class="pr-lg pr-lg-pain-mild" /> 轻微</span>
        <span><i class="pr-lg pr-lg-pain-severe" /> 严重</span>
        <span><i class="pr-lg pr-lg-pred" /> 预测</span>
        <span><i class="pr-lg pr-lg-ovu" /> 排卵期</span>
      </div>

      <p v-if="!cycles.length" class="pr-tip">点「＋」记录一次经期，或点日历上的某一天补充当天的流量与痛经</p>
    </div>

    <!-- 新建 / 编辑周期（显式起止） -->
    <div v-if="cycleShow" class="pr-mask" @click.self="cycleShow = false">
      <div class="pr-sheet">
        <h3 class="pr-sheet-title">{{ cycleEditing ? '编辑经期记录' : '新建经期记录' }}</h3>
        <div class="pr-scroll">
        <div class="pr-fld">
          <span class="pr-fld-label">开始日（经期开始）</span>
          <input v-model="cycleForm.start" class="pr-input" type="date" />
        </div>
        <div class="pr-fld">
          <span class="pr-fld-label">结束日（经期结束）</span>
          <input v-model="cycleForm.end" class="pr-input" type="date" />
        </div>
        <div class="pr-fld">
          <span class="pr-fld-label">备注（可选）</span>
          <textarea v-model="cycleForm.note" class="pr-textarea" placeholder="身体状态、心情…" />
        </div>
        </div>
        <div class="pr-actions">
          <button class="pr-btn ghost" @click="cycleShow = false">取消</button>
          <button class="pr-btn primary" @click="saveCycle">保存</button>
        </div>
      </div>
    </div>

    <!-- 当日详情（每天补充流量/痛经） -->
    <div v-if="dayShow" class="pr-mask" @click.self="dayShow = false">
      <div class="pr-sheet">
        <h3 class="pr-sheet-title">{{ dayLabel }}</h3>
        <div class="pr-scroll">
        <template v-if="dayCycle">
          <div class="pr-fld">
            <span class="pr-fld-label">流量</span>
            <div class="pr-seg">
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === '' }" @click="dayForm.flow = ''">—</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'light' }" @click="dayForm.flow = 'light'">少</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'mid' }" @click="dayForm.flow = 'mid'">中</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'heavy' }" @click="dayForm.flow = 'heavy'">多</button>
            </div>
          </div>
          <div class="pr-fld">
            <span class="pr-fld-label">痛经</span>
            <div class="pr-seg">
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'none' }" @click="dayForm.pain = 'none'">无</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'mild' }" @click="dayForm.pain = 'mild'">轻微</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'severe' }" @click="dayForm.pain = 'severe'">严重</button>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="pr-tip">这一天不在任何经期记录中。若现在正处于经期，请先点下方开关「开始」；也可直接为它新建一条记录。</p>
          <div class="pr-fld">
            <span class="pr-fld-label">流量</span>
            <div class="pr-seg">
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'light' }" @click="dayForm.flow = 'light'">少</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'mid' }" @click="dayForm.flow = 'mid'">中</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.flow === 'heavy' }" @click="dayForm.flow = 'heavy'">多</button>
            </div>
          </div>
          <div class="pr-fld">
            <span class="pr-fld-label">痛经</span>
            <div class="pr-seg">
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'none' }" @click="dayForm.pain = 'none'">无</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'mild' }" @click="dayForm.pain = 'mild'">轻微</button>
              <button class="pr-seg-btn" :class="{ on: dayForm.pain === 'severe' }" @click="dayForm.pain = 'severe'">严重</button>
            </div>
          </div>
        </template>
        </div>
        <div class="pr-actions">
          <template v-if="dayCycle">
            <button class="pr-btn danger" @click="removeDay">移除这一天</button>
            <button class="pr-btn ghost" @click="dayShow = false">取消</button>
            <button class="pr-btn primary" @click="saveDay">保存</button>
          </template>
          <template v-else>
            <button class="pr-btn ghost" @click="dayShow = false">取消</button>
            <button class="pr-btn primary" @click="createCycleHere">新建并保存</button>
          </template>
        </div>
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
  cyclesFromItems, cycleOf, predictedDates, avgCycle as calcCycle, avgLen as calcLen,
  predictNext, fmtDate, addDays, parseDate, dayDiff,
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
const predSet = computed(() => new Set(predictedDates(cycles.value)))
/* 排卵期窗口（下次经期开始 - 14 天 ±2 天）所有日期 */
const ovuSet = computed(() => {
  const ovu = ovulationWindow(cycles.value)
  if (!ovu) return new Set()
  const s = new Set()
  let cur = ovu.start
  for (let i = 0; i < 5; i++) { s.add(cur); cur = addDays(cur, 1) }
  return s
})
/* 当前进行中的经期（开关「开」即存在） */
const periodOn = computed(() => !!ongoingCycle(cycles.value))
const ongoingDays = computed(() => { const c = ongoingCycle(cycles.value); return c ? durationOf(c) : 0 })

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

const avgCycle = computed(() => calcCycle(cycles.value))
const avgLen = computed(() => calcLen(cycles.value))

/* 顶部卡片：进行中优先，否则预测下次经期 + 排卵期 */
const summaryTitle = computed(() => {
  if (periodOn.value) return `经期进行中 · 第 ${ongoingDays.value} 天`
  const pred = predictNext(cycles.value)
  if (!pred) return '记录后为你预测'
  const diff = dayDiff(pred.start, todayStr())
  if (diff === 0) return '预测今天是预计开始日'
  if (diff > 0) return `预计 ${diff} 天后（${pred.start.slice(5).replace('-', '月')}日）开始`
  return `已过预计日 ${Math.abs(diff)} 天（${pred.start.slice(5).replace('-', '月')}日）`
})
const summarySub = computed(() => {
  const parts = []
  const ovu = ovulationWindow(cycles.value)
  if (ovu) parts.push(`排卵期 ${ovu.start.slice(5).replace('-', '月')}日-${ovu.end.slice(5).replace('-', '月')}日`)
  parts.push(`平均周期 ${avgCycle.value} 天`)
  if (avgLen.value) parts.push(`平均持续 ${avgLen.value} 天`)
  return parts.join(' · ')
})

/* 开关：开 = 开始本次经期，关 = 结束并封存（记录持续天数，自动参与预测） */
async function onToggle(val) {
  if (val) await startPeriod()
  else await endPeriod()
}
async function startPeriod() {
  if (ongoingCycle(cycles.value)) return
  const t = todayStr()
  try {
    await add({ title: t, body: '', extra: { start: t, end: t, ongoing: true, days: {} } })
    toast.pushToast({ title: '已记录经期开始' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function endPeriod() {
  const cyc = ongoingCycle(cycles.value)
  if (!cyc) return
  const raw = findRaw(cyc.id)
  if (!raw) return
  const ex = raw.extra || {}
  const t = todayStr()
  const dur = dayDiff(t, cyc.start) + 1
  dayShow.value = false
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
}

function cellStyle(c) {
  if (c.inCycle) return { background: 'rgba(201,136,145,.26)' }
  if (c.pred) return { background: 'rgba(201,136,145,.10)', border: '1.5px dashed rgba(201,136,145,.6)' }
  if (c.ovu) return { background: 'rgba(150,120,200,.14)' }
  return null
}

/* ═══ 周期（显式起止）表单 ═══ */
const cycleShow = ref(false)
const cycleEditing = ref(null)
const cycleForm = reactive({ start: '', end: '', note: '' })

function openCycleAdd() {
  cycleEditing.value = null
  Object.assign(cycleForm, { start: todayStr(), end: todayStr(), note: '' })
  cycleShow.value = true
}
async function saveCycle() {
  if (!cycleForm.start) {
    toast.pushToast({ title: '请选择开始日' })
    return
  }
  const end = cycleForm.end || cycleForm.start
  const payload = { title: cycleForm.start, body: (cycleForm.note || '').trim(), extra: { start: cycleForm.start, end, days: {} } }
  cycleShow.value = false
  try {
    if (cycleEditing.value) await update(cycleEditing.value, payload)
    else await add(payload)
    toast.pushToast({ title: '已保存' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* ═══ 当日详情（每天补充） ═══ */
const dayShow = ref(false)
const dayDateSel = ref('')
const dayCycle = ref(null)
const dayForm = reactive({ flow: '', pain: 'none' })

const dayLabel = computed(() => {
  const d = parseDate(dayDateSel.value)
  return d ? `${d.getMonth() + 1}月${d.getDate()}日` : ''
})

function openDay(c) {
  dayDate.value = c.date
  dayDateSel.value = c.date
  const cyc = cycleOf(cycles.value, c.date)
  dayCycle.value = cyc
  const rec = cyc ? cyc.days[c.date] : null
  Object.assign(dayForm, { flow: rec ? rec.flow || '' : '', pain: rec ? rec.pain || 'none' : 'none' })
  dayShow.value = true
}
function findRaw(id) { return items.value.find((x) => x.id === id) }

async function saveDay() {
  const cyc = dayCycle.value
  if (!cyc) return
  const raw = findRaw(cyc.id)
  if (!raw) return
  const days = { ...(raw.extra.days || {}) }
  if (dayForm.flow) days[dayDateSel.value] = { flow: dayForm.flow, pain: dayForm.pain }
  else delete days[dayDateSel.value]
  dayShow.value = false
  try {
    await update(cyc.id, { extra: { ...raw.extra, days } })
    toast.pushToast({ title: '已保存' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function removeDay() {
  const cyc = dayCycle.value
  const raw = findRaw(cyc.id)
  if (!raw) return
  const days = { ...(raw.extra.days || {}) }
  delete days[dayDateSel.value]
  let { start, end } = raw.extra
  if (dayDateSel.value === start && start < end) start = addDays(start, 1)
  else if (dayDateSel.value === end && end > start) end = addDays(end, -1)
  dayShow.value = false
  try {
    if (start > end) await removeItem(cyc.id)
    else await update(cyc.id, { extra: { ...raw.extra, start, end, days }, title: start })
    toast.pushToast({ title: '已移除' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function createCycleHere() {
  const date = dayDateSel.value
  const days = dayForm.flow ? { [date]: { flow: dayForm.flow, pain: dayForm.pain } } : {}
  dayShow.value = false
  try {
    await add({ title: date, body: '', extra: { start: date, end: date, days } })
    toast.pushToast({ title: '已新建经期记录' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

onMounted(load)
</script>

<style scoped>
.pr-page { min-height: 100%; background: #fbf7f4; }
.pr-body { padding: 12px; }
.pr-summary { display: flex; align-items: center; gap: 12px; background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(180,120,120,.08); }
.pr-sum-ic { flex: 0 0 auto; }
.pr-sum-main { display: flex; flex-direction: column; }
.pr-sum-title { font-size: 15px; font-weight: 600; color: #8a5a5a; }
.pr-sum-sub { font-size: 12px; color: var(--text-soft); margin-top: 3px; }

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
.pr-lg-flow-light { width: 5px; height: 5px; }
.pr-lg-flow-mid { width: 7px; height: 7px; }
.pr-lg-flow-heavy { width: 9px; height: 9px; }
.pr-lg-pain-mild::after { content: '△'; font-size: 9px; color: #a85b5b; }
.pr-lg-pain-severe::after { content: '✕'; font-size: 9px; color: #a85b5b; }
.pr-lg-pred { background: transparent; border: 1.5px dashed rgba(201,136,145,.6); }

.pr-tip { font-size: 12px; color: var(--text-soft); text-align: center; margin-top: 16px; line-height: 1.7; }

/* 日历下方：经期开关条（开=进行中，关=未开始） */
.pr-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #fff; border-radius: 14px; padding: 12px 14px; margin: 12px 0; box-shadow: 0 1px 3px rgba(180,120,120,.08); }
.pr-toggle.on { box-shadow: 0 2px 8px rgba(201,136,145,.28); }
.pr-toggle-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pr-toggle-ic { flex: 0 0 auto; display: flex; }
.pr-toggle-txt { display: flex; flex-direction: column; min-width: 0; }
.pr-toggle-title { font-size: 15px; font-weight: 600; color: #8a5a5a; }
.pr-toggle.on .pr-toggle-title { color: #c98891; }
.pr-toggle-sub { font-size: 11.5px; color: var(--text-soft); margin-top: 2px; line-height: 1.4; }
/* 排卵窗口小紫点 */
.pr-ovu-dot { width: 6px; height: 6px; border-radius: 50%; background: #9b7fd0; display: inline-block; margin-top: 3px; }
.pr-lg-ovu { background: #9b7fd0; }

/* 弹层 */
.pr-mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; z-index: 50; }
.pr-sheet { width: 100%; background: var(--bg-screen); border-radius: 16px 16px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); max-height: 86vh; display: flex; flex-direction: column; overflow: hidden; }
.pr-sheet-title { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
.pr-fld { margin-bottom: 12px; }
.pr-fld-label { display: block; font-size: 13px; color: var(--text-soft); margin-bottom: 6px; }
.pr-input, .pr-textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 10px; padding: 10px; font-size: 14px; background: var(--bg-soft); }
.pr-textarea { min-height: 80px; resize: vertical; }
.pr-seg { display: flex; gap: 8px; }
.pr-seg-btn { flex: 1; border: 1px solid var(--border); background: var(--bg-soft); border-radius: 10px; padding: 9px; font-size: 14px; color: var(--text-soft); }
.pr-seg-btn.on { background: #c98891; border-color: #c98891; color: #fff; }
.pr-day-ops { display: flex; gap: 10px; margin-bottom: 12px; }
.pr-day-op { flex: 1; border: 1px solid var(--border); background: transparent; color: #8a5a5a; border-radius: 10px; padding: 10px; font-size: 13px; }
/* 中间内容滚动；标题与按钮固定不随滚动 */
.pr-scroll { flex: 1; min-height: 0; overflow-y: auto; }
/* 取消/保存固定底部，按钮大小与心情弹窗一致 */
.pr-actions { display: flex; gap: 10px; flex: 0 0 auto; margin-top: 12px; }
.pr-btn { flex: 1; border: none; border-radius: 10px; padding: 12px; font-size: 15px; }
.pr-btn.ghost { background: var(--bg-soft); color: var(--text); }
.pr-btn.primary { background: #c98891; color: #fff; }
.pr-btn.danger { background: #fbe9e8; color: #d9534f; }
</style>
