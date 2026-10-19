/**
 * 经期共享工具：解析记录、统计周期/持续、预测下次、关怀触发判断。
 * 纯函数，输入「app_items（module=period）的行」，不碰 DB，供 PeriodView 与 period.service 共用。
 *
 * 一条周期记录（cycle）：
 *   { id, start:'YYYY-MM-DD', end:'YYYY-MM-DD', days:{ 'YYYY-MM-DD':{ flow, pain } }, note }
 * flow ∈ 'light'|'mid'|'heavy'（少/中/多）；pain ∈ 'none'|'mild'|'severe'（无/轻微/严重）。
 */

export function parseDate(s) {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtDate(d) {
  if (typeof d === 'string') return d
  const x = d instanceof Date ? d : new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dayDiff(a, b) {
  const da = parseDate(a)
  const db = parseDate(b)
  if (!da || !db) return null
  return Math.round((da - db) / 86400000)
}

export function addDays(s, n) {
  const d = parseDate(s)
  if (!d) return null
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

/* 把 app_items 行整理成 cycle 数组（按开始日升序；无 start 的丢弃；缺 days 兼容处理） */
export function cyclesFromItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const ex = typeof it.extra === 'string' ? safeJson(it.extra) : it.extra || {}
      const start = ex.start || it.title || ''
      const end = ex.end || start
      return { id: it.id, start, end, days: ex.days || {}, note: it.body || '', ongoing: !!ex.ongoing }
    })
    .filter((c) => c.start)
    .sort((a, b) => a.start.localeCompare(b.start))
}

/* 平均周期：相邻两次开始日的间隔（不足 2 条回落 28） */
export function avgCycle(cycles) {
  if (cycles.length < 2) return 28
  let sum = 0
  let n = 0
  for (let i = 1; i < cycles.length; i++) {
    const d = dayDiff(cycles[i].start, cycles[i - 1].start)
    if (d > 0) {
      sum += d
      n++
    }
  }
  return n ? Math.round(sum / n) : 28
}

/* 平均持续天数：有结束日的「已封存」cycle 的 (end-start+1) 均值（进行中的不计入；无数据回落默认 7） */
export function avgLen(cycles) {
  const withEnd = cycles.filter((c) => !c.ongoing && c.end && c.end >= c.start)
  if (!withEnd.length) return 7
  const sum = withEnd.reduce((s, c) => s + (dayDiff(c.end, c.start) + 1), 0)
  return Math.round(sum / withEnd.length)
}

/* 预测下次经期：基于最近一次开始日 + 平均周期；结束日 = 开始日 + 平均持续 - 1 */
export function predictNext(cycles) {
  if (!cycles.length) return null
  const last = cycles[cycles.length - 1]
  const cycle = avgCycle(cycles)
  const len = avgLen(cycles)
  const start = addDays(last.start, cycle)
  const end = addDays(start, len - 1)
  return { start, end, cycle, len }
}

/* 预测区间的所有日期（用于日历浅色圈出） */
export function predictedDates(cycles, limit = 31) {
  const pred = predictNext(cycles)
  if (!pred) return []
  const out = []
  let cur = pred.start
  for (let i = 0; i < pred.len && i < limit; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/* 进行中周期的「变红显示终点」：按周期规律预测（开始日 + 平均持续 - 1），
   但不早于今天；结束后以实际 end 为准（提前/推后结束则相应减少/增加变红天数） */
export function ongoingDisplayEnd(cycles, cycle) {
  const today = fmtDate(new Date())
  let end = cycle.ongoing && cycle.end < today ? today : cycle.end || cycle.start
  if (cycle.ongoing) {
    const predEnd = addDays(cycle.start, avgLen(cycles) - 1)
    if (predEnd > end) end = predEnd
    if (today > end) end = today
  }
  return end
}

/* 某天是否处于已记录周期内（返回该 cycle 或 null）。
   进行中（ongoing）的周期会按周期规律预测延伸变红区间，确保显示与关怀判断一致 */
export function cycleOf(cycles, date) {
  const d = fmtDate(parseDate(date))
  return cycles.find((c) => d >= c.start && d <= ongoingDisplayEnd(cycles, c)) || null
}

/* 当前正在进行中的周期（未封闭的），没有则返回 null */
export function ongoingCycle(cycles) {
  return cycles.find((c) => c.ongoing) || null
}

/* 一条周期的持续天数（进行中按到今天算） */
export function durationOf(cycle) {
  if (!cycle || !cycle.start) return 0
  const today = fmtDate(new Date())
  const end = cycle.ongoing && cycle.end < today ? today : cycle.end || cycle.start
  return dayDiff(end, cycle.start) + 1
}

/* 排卵期窗口：排卵日 ≈ 下次经期开始日 - 14 天，给 ±2 天共 5 天窗口 */
export function ovulationWindow(cycles, limit = 31) {
  const pred = predictNext(cycles)
  if (!pred) return null
  const ovuDay = addDays(pred.start, -14)
  if (!ovuDay) return null
  return { day: ovuDay, start: addDays(ovuDay, -2), end: addDays(ovuDay, 2) }
}

/* 距预测开始日的天数（>0 未来，=0 当天，<0 已过） */
export function daysUntilPredicted(cycles, date) {
  const pred = predictNext(cycles)
  if (!pred) return null
  return dayDiff(pred.start, date)
}

/**
 * 关怀触发判断：
 *  - 'today'：今天落在已记录周期内（正处于经期）
 *  - 'soon' ：距预测开始日还有 2~3 天
 *  - null   ：不触发
 */
export function careTrigger(cycles, date) {
  const d = fmtDate(parseDate(date))
  if (cycleOf(cycles, d)) return 'today'
  const du = daysUntilPredicted(cycles, d)
  if (du != null && du >= 2 && du <= 3) return 'soon'
  return null
}

function safeJson(s) {
  try {
    return JSON.parse(s)
  } catch (e) {
    return {}
  }
}
