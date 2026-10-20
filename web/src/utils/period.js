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

/* 平均周期：相邻两次开始日的间隔。封存记录 <2 条时沿用默认 28 天，之后按真实统计 */
export function avgCycle(cycles) {
  const sealed = cycles.filter((c) => !c.ongoing && c.end)
  if (sealed.length < 2) return 28
  let sum = 0
  let n = 0
  for (let i = 1; i < sealed.length; i++) {
    const d = dayDiff(sealed[i].start, sealed[i - 1].start)
    if (d > 0) {
      sum += d
      n++
    }
  }
  return n ? Math.round(sum / n) : 28
}

/* 平均持续天数：已封存周期的 (end-start+1) 均值。无任何封存记录时沿用默认 7 天，
   有记录就按自己的真实统计（一个月一次，依据用户记录的经期周期）。
   钳制到 [1, 10]：经期持续一般 2～7 天，极端也少于 10 天；
   异常长记录（误操作产生的十几天）不参与预测，避免污染「变红显示」 */
export function avgLen(cycles) {
  const sealed = cycles.filter((c) => !c.ongoing && c.end)
  if (!sealed.length) return 7
  const sum = sealed.reduce((s, c) => s + (dayDiff(c.end, c.start) + 1), 0)
  const avg = Math.round(sum / sealed.length)
  return Math.min(10, Math.max(1, avg))
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

/* 预测区间的所有日期（用于日历虚线圈出） */
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

/* 进行中周期的「变红显示终点」：严格按周期规律预测（开始日 + 平均持续 - 1），
   不延伸到今天——默认持续几天就只红几天；
   实际结束以结束开关为准（提前/延后结束则相应减少/增加变红天数）。
   上限：不超过本次周期自身推算的排卵期窗口起点前一天
   （排卵期 = 下次经期 - 14 天 ±2，经期先于排卵期，显示不能吞掉排卵期） */
export function ongoingDisplayEnd(cycles, cycle) {
  if (!cycle || !cycle.ongoing) return cycle ? cycle.end || cycle.start : ''
  const predEnd = addDays(cycle.start, avgLen(cycles) - 1)
  const cap = addDays(cycle.start, avgCycle(cycles) - 17)
  const curEnd = cycle.end || cycle.start
  let end = predEnd > curEnd ? predEnd : curEnd
  if (cap && end > cap) end = cap
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

/* 排卵期窗口：排卵日 ≈ 下次经期开始日 - 14 天，给 ±2 天共 5 天窗口（仅预测的下一个） */
export function ovulationWindow(cycles, limit = 31) {
  const pred = predictNext(cycles)
  if (!pred) return null
  const ovuDay = addDays(pred.start, -14)
  if (!ovuDay) return null
  return { day: ovuDay, start: addDays(ovuDay, -2), end: addDays(ovuDay, 2) }
}

/* 所有周期的排卵期窗口：每条已记录周期各算一个（不只标当前/下一个）。
   下一次经期开始 = 下一条记录的开始日（有实际记录时更准）；
   最后一条没有下一条，按平均周期外推（predicted=true，与预测经期同一个）。
   间隔不足 14 天的异常记录不产生窗口（排卵日不可能早于本次经期开始）。 */
export function ovulationWindows(cycles) {
  const list = Array.isArray(cycles) ? cycles : []
  if (!list.length) return []
  const cycle = avgCycle(list)
  const out = []
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (!c || !c.start) continue
    const next = list[i + 1]
    const nextStart = next && next.start ? next.start : addDays(c.start, cycle)
    if (!nextStart) continue
    const ovuDay = addDays(nextStart, -14)
    if (!ovuDay || ovuDay < c.start) continue
    out.push({ day: ovuDay, start: addDays(ovuDay, -2), end: addDays(ovuDay, 2), predicted: !next })
  }
  return out
}

/* 包含 date 的排卵窗口（今天在任意一个周期窗口内都能定位到它），没有返回 null */
export function ovulationWindowOf(cycles, date) {
  const d = fmtDate(parseDate(date))
  if (!d) return null
  return ovulationWindows(cycles).find((w) => d >= w.start && d <= w.end) || null
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
