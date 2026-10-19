<template>
  <div class="pr-page">
    <AppHeader title="经期" back />

    <div class="pr-body">
      <!-- 日历 -->
      <!-- 头部行：左侧状态文字（经期第X天/排卵期第X天/距预测经期X天 + 周期共N天），右侧回到今天 + 月份切换 -->
      <div class="pr-head-row">
        <div class="pr-status">
          <span v-if="calStatus.main" class="pr-status-main">{{ calStatus.main }}</span>
          <span class="pr-status-sub">{{ calStatus.sub }}</span>
        </div>
        <div class="pr-head-right">
          <button class="pr-today" @click="goToday">回到今天</button>
          <button class="pr-arrow" type="button" aria-label="上个月" @click="shift(-1)">‹</button>
          <span class="pr-title">{{ year }}年{{ month }}月</span>
          <button class="pr-arrow" type="button" aria-label="下个月" @click="shift(1)">›</button>
        </div>
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
        <div class="pr-card-head">
          <span v-if="dayIndex > 0" class="pr-card-idx">经期第 {{ dayIndex }} 天</span>
          <span v-else />
          <button class="pr-trash" type="button" :disabled="!inCycle" aria-label="删除这一天的记录" @click="askDeleteDay">
            <AppIcon name="trash" :size="17" color="#b08d8d" />
          </button>
        </div>
        <div v-if="showStartSwitch || showEndSwitch" class="pr-row">
          <span class="pr-row-ic"><AppIcon name="drop" :size="18" color="#c98891" /></span>
          <span class="pr-row-label">{{ showEndSwitch ? '经期结束了吗？' : '经期开始了吗？' }}</span>
          <ToggleSwitch :model-value="switchOn" @update:model-value="onSwitch" />
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
      </div>

      <button class="pr-clear" type="button" @click="askClearAll">清空经期记录</button>

      <!-- 更新预测加载反馈（参考华为「正在更新预测...」） -->
      <div v-if="updating" class="pr-updating">
        <div class="pr-updating-card">
          <span class="pr-spinner" />
          <span>正在更新预测...</span>
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
import { confirmDialog } from '@/utils/dialog'
import {
  cyclesFromItems, cycleOf, predictedDates,
  fmtDate, addDays, parseDate, dayDiff,
  ongoingCycle, ongoingDisplayEnd, ovulationWindow,
  avgCycle, predictNext
} from '@/utils/period'

const { items, loading, load, add, update, remove: removeItem } = useItems('period')
const toast = useNotificationsStore()

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const dayDate = ref(fmtDate(now))

const cycles = computed(() => cyclesFromItems(items.value))
/* 有任意经期记录即按规律预测（封存 <2 条时用默认 28/7 天，够后按真实统计） */
const enough = computed(() => cycles.value.length > 0)
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
function CN(s) {
  const d = parseDate(s)
  return d ? `${d.getMonth() + 1}月${d.getDate()}` : s
}

/* ═══ 日历头部状态（固定显示）═══
   经期中 → 「经期第 X 天」；排卵窗口内 → 「排卵期第 X 天」；
   否则 → 「距预测经期 X 天」；副标题固定「周期共 N 天」 */
const calStatus = computed(() => {
  const t = todayStr()
  const sub = `周期共 ${avgCycle(cycles.value)} 天`
  /* 1. 今天在经期内（含进行中的按规律预测段、已封存周期）→ 经期第 X 天 */
  const todayCyc = cycleOf(cycles.value, t)
  if (todayCyc) return { main: `经期第 ${dayDiff(t, todayCyc.start) + 1} 天`, sub }
  /* 2. 今天在排卵窗口内 → 排卵期第 X 天 */
  const ovu = ovulationWindow(cycles.value)
  if (ovu && t >= ovu.start && t <= ovu.end) {
    return { main: `排卵期第 ${dayDiff(t, ovu.start) + 1} 天`, sub }
  }
  /* 3. 距预测经期 X 天（记录少时按默认 28/7 规律预测） */
  const pred = predictNext(cycles.value)
  if (pred) {
    const du = dayDiff(pred.start, t)
    if (du > 0) return { main: `距预测经期 ${du} 天`, sub }
    if (du === 0) return { main: '预测经期今天来', sub }
    return { main: `预测经期已过 ${-du} 天`, sub }
  }
  /* 无任何记录：只显示默认周期规律 */
  return { main: '', sub }
})

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
/* 卡片左上角：目标日在经期内 → 第几天 */
const dayIndex = computed(() => {
  const c = selCycle.value
  if (!c) return 0
  return dayDiff(targetDate.value, c.start) + 1
})
/* 进行中的经期 */
const oc = computed(() => ongoingCycle(cycles.value))
/* 结束开关的目标周期：
   - 进行中 → 目标日 ∈ (第一天, 今天]（第一天归开始开关；含超过估计最后一天的补结束）
   - 已封存 → 目标日 ∈ [第一天, 结束日]（开关 ON，可提前）
   - 最近一条已封存 → 目标日 ∈ (结束日, 今天]（开关 OFF，可补/延长结束） */
const endTarget = computed(() => {
  if (isFuture.value) return null
  const t = targetDate.value
  if (oc.value) {
    return t > oc.value.start && t <= todayStr() ? oc.value : null
  }
  if (selCycle.value) {
    const c = selCycle.value
    return t >= c.start && t <= (c.end || c.start) ? c : null
  }
  const last = cycles.value[cycles.value.length - 1]
  if (last && t > (last.end || last.start) && t <= todayStr()) return last
  return null
})
const showEndSwitch = computed(() => !!endTarget.value)
/* 开关显示规则：
   - 目标日 ≤ 进行中经期的第一天（含当天）→ 「经期开始了吗？」（打开 → 该日记为/改为第一天）
   - 目标日 ∈ (第一天, 结束日/今天] → 「经期结束了吗？」（打开 → 该日为最后一天）
   - 无进行中经期且该日不在任何记录中 → 「经期开始了吗？」（打开 → 新建经期）
   - 历史经期内的天 / 超出结束日的天 → 结束开关（仅可补录流量/痛经） */
const showStartSwitch = computed(() => {
  if (isFuture.value) return false
  if (endTarget.value) return false
  if (oc.value) return targetDate.value <= oc.value.start
  return !inCycle.value
})
/* 开关状态：
   - 结束开关：已封存且该日 ≤ 结束日 → ON；进行中（未确认结束）→ OFF
   - 开始开关：进行中经期的第一天就是该日 → ON（刚标记过），否则 OFF */
const switchOn = computed(() => {
  if (showEndSwitch.value) {
    const c = endTarget.value
    if (!c) return false
    if (c.ongoing) return false
    return targetDate.value <= (c.end || c.start)
  }
  return !!oc.value && oc.value.start === targetDate.value
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

/* 开关交互（参考华为运动健康）：
   结束开关「经期结束了吗？」：
     - 进行中默认 OFF（未确认结束）；点开 → 以该日为最后一天封存
     - 已封存：该日 ≤ 结束日 → ON；点关 → 最后一天提前到前一天（早于第一天则确认删除整条）
     - 超过结束日的次日/以后 → OFF；点开 → 补/延长结束到该日
   开始开关「经期开始了吗？」：
     - 默认 OFF；点开 → 无进行中经期则新建，有则确认后更改开始日
     - 再点关 → 撤销（改过的恢复原开始日，新建的确认后删除） */
async function onSwitch(val) {
  if (isFuture.value) return
  const t = targetDate.value
  if (showEndSwitch.value) {
    const c = endTarget.value
    if (!c) return
    if (val) {
      /* 点开：以该日为最后一天 */
      if (c.ongoing || t > (c.end || c.start)) await setPeriodEnd(c, t)
    } else if (!c.ongoing && t <= (c.end || c.start)) {
      /* 点关：最后一天提前到前一天 */
      const newEnd = addDays(t, -1)
      if (newEnd < c.start) {
        const ok = await confirmDialog({
          title: '取消这次经期？',
          text: `${CN(c.start)} 将不再是经期开始日，这条经期记录会被删除。`,
          danger: true
        })
        if (ok) await runUpdate(() => removeItem(c.id), { title: '已取消这次经期' })
      } else {
        await setPeriodEnd(c, newEnd)
      }
    }
    return
  }
  if (showStartSwitch.value) {
    if (val) {
      if (oc.value) {
        /* 该日已落在其他经期记录里时，不允许再把开始日改过来 */
        if (selCycle.value && selCycle.value.id !== oc.value.id) {
          toast.pushToast({ title: '该日已在其他经期记录中' })
          return
        }
        await askMoveStart(t)
      } else {
        await runUpdate(() => startPeriod(t), { title: '已记录经期开始' })
      }
    } else if (oc.value && oc.value.start === t) {
      await undoStart()
    }
  }
}

/* 「正在更新预测...」：执行写入 → 短暂加载 → 结果 toast（参考华为） */
const updating = ref(false)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function runUpdate(fn, done) {
  updating.value = true
  try {
    await fn()
  } catch (e) {
    updating.value = false
    toast.pushToast({ title: '失败', text: e.message })
    return
  }
  await sleep(650)
  updating.value = false
  if (done) toast.pushToast(done)
}

async function startPeriod(date) {
  let t = date || todayStr()
  if (t > todayStr()) t = todayStr()
  await add({ title: t, body: '', extra: { start: t, end: t, ongoing: true, days: {} } })
}

/* 更改进行中经期的开始日：先弹窗确认（华为提示样式） */
async function askMoveStart(date) {
  const c = ongoingCycle(cycles.value)
  if (!c || date >= c.start) return
  const ok = await confirmDialog({
    title: '提示',
    text: `您已将 ${CN(c.start)} 标记为经期开始日。是否将经期开始日更改为 ${CN(date)}？`
  })
  if (!ok) return
  await runUpdate(async () => {
    const raw = findRaw(c.id)
    if (!raw) return
    const ex = raw.extra || {}
    await update(c.id, {
      title: date,
      body: ex.note || '',
      extra: { ...ex, start: date, prevStart: c.start }
    })
  }, { title: '已记为经期第一天' })
}

/* 撤销开始日：改过的恢复原开始日；新建的确认后删除 */
async function undoStart() {
  const c = ongoingCycle(cycles.value)
  if (!c) return
  const raw = findRaw(c.id)
  const ex = (raw && raw.extra) || {}
  if (ex.prevStart) {
    await runUpdate(async () => {
      const nx = { ...ex }
      delete nx.prevStart
      await update(c.id, {
        title: ex.prevStart,
        body: ex.note || '',
        extra: { ...nx, start: ex.prevStart }
      })
    }, { title: '已恢复原开始日' })
    return
  }
  const ok = await confirmDialog({
    title: '取消这次经期？',
    text: `${CN(c.start)} 将不再是经期开始日，这条经期记录会被删除。`,
    danger: true
  })
  if (ok) await runUpdate(() => removeItem(c.id), { title: '已取消这次经期' })
}

/* 以 end 为最后一天封存/更新该周期，并刷新统计与预测 */
async function setPeriodEnd(c, end) {
  const raw = findRaw(c.id)
  if (!raw) return
  const ex = raw.extra || {}
  const dur = dayDiff(end, c.start) + 1
  const wasOngoing = !!c.ongoing
  await runUpdate(async () => {
    await update(c.id, {
      title: c.start,
      body: ex.note || '',
      extra: { ...ex, start: c.start, end, ongoing: false, duration: dur }
    })
  }, wasOngoing
    ? { title: '经期已结束', text: `本次共 ${dur} 天，统计与预测已更新` }
    : { title: '已更新经期记录', text: `本次共 ${dur} 天` })
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
  try {
    if (d === start && d === end) {
      /* 单天周期：删除该日即整条移除 */
      await removeItem(cyc.id)
    } else {
      if (d === start && start < end) start = addDays(start, 1)
      else if (d === end && end > start) end = addDays(end, -1)
      if (start > end) await removeItem(cyc.id)
      else await update(cyc.id, { extra: { ...raw.extra, start, end, days }, title: start })
    }
    toast.pushToast({ title: '已删除这一天的记录' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* 右上垃圾桶：删除这一天的记录（该日也不再计入经期） */
async function askDeleteDay() {
  if (!inCycle.value) return
  const d = parseDate(targetDate.value)
  const label = d ? `${d.getMonth() + 1}月${d.getDate()}日` : '这一天'
  const ok = await confirmDialog({
    title: '删除这一天的记录？',
    text: `将删除 ${label} 的流量/痛经记录，该日也不再计入经期。`,
    danger: true
  })
  if (ok) await removeDay()
}

/* 一键清空全部经期记录 */
async function askClearAll() {
  if (!items.value.length) {
    toast.pushToast({ title: '暂无经期记录' })
    return
  }
  const ok = await confirmDialog({
    title: '清空全部经期记录？',
    text: '所有经期记录与统计数据都会被删除，且无法恢复。',
    danger: true
  })
  if (!ok) return
  try {
    for (const it of items.value) await removeItem(it.id)
    toast.pushToast({ title: '已清空经期记录' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

onMounted(load)
</script>

<style scoped>
.pr-page { min-height: 100%; background: #fbf7f4; }
.pr-body { padding: 12px; }

/* 头部行：左状态文字 + 右（回到今天/月份切换），同一行 */
.pr-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin: 4px 0 12px; }
.pr-status { min-width: 0; flex: 1 1 auto; }
.pr-status-main { display: block; font-size: 21px; font-weight: 700; color: #8a5a5a; line-height: 1.25; }
.pr-status-sub { display: block; font-size: 12px; color: var(--text-soft); margin-top: 3px; }
.pr-head-right { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; padding-top: 2px; }
.pr-today { border: 1px solid var(--border); background: rgba(255,255,255,.6); color: var(--text-soft); border-radius: 999px; padding: 4px 12px; font-size: 12px; margin-right: 2px; }
.pr-arrow { border: none; background: transparent; font-size: 18px; color: var(--text-soft); padding: 0 2px; }
.pr-title { font-size: 13px; font-weight: 600; min-width: 84px; text-align: center; white-space: nowrap; }

/* 正在更新预测（参考华为加载反馈） */
.pr-updating { position: fixed; inset: 0; background: rgba(70,45,45,.35); display: flex; align-items: center; justify-content: center; z-index: 80; }
.pr-updating-card { background: #fff; border-radius: 14px; padding: 20px 26px; display: flex; align-items: center; gap: 12px; font-size: 14px; color: #8a5a5a; box-shadow: 0 8px 28px rgba(120,70,70,.28); }
.pr-spinner { width: 18px; height: 18px; border: 2px solid #f0d9dc; border-top-color: #c98891; border-radius: 50%; animation: pr-spin .8s linear infinite; flex: 0 0 auto; }
@keyframes pr-spin { to { transform: rotate(360deg); } }

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
.pr-card-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 0 2px; min-height: 30px; }
.pr-card-idx { font-size: 13px; font-weight: 600; color: #c98891; }
.pr-trash { border: none; background: transparent; padding: 6px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
.pr-trash:disabled { opacity: .35; }
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
/* 一键清空 */
.pr-clear { display: block; margin: 16px auto 8px; border: none; background: transparent; color: var(--text-soft); font-size: 12px; text-decoration: underline; padding: 6px 10px; }
</style>
