/**
 * 纪念日在日历中的落点计算。
 * 规则（与纪念日页一致）：
 * - 类型 anniversary（纪念日）：默认每年都有（repeat_yearly）；
 * - 类型 countdown（倒数日）：按条目自身的 repeat_yearly 设置来；
 * - calendar = lunar（农历）：按农历月日换算到目标公历年再匹配（闰月优先平月）；
 *   calendar = solar（公历）：直接按公历月日匹配。
 */

const pad2 = (n) => String(n).padStart(2, '0')
/* en-u-ca-chinese 的数字月份：平月 "6"、闰月 "6bis"，便于程序判断 */
const lunarFmt = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' })

/** 公历日期 'YYYY-MM-DD' -> 农历月日 { m, d, leap }；解析失败返回 null */
export function lunarMDOf(dateStr) {
  try {
    const parts = lunarFmt.formatToParts(new Date(`${dateStr}T12:00:00`))
    const mv = (parts.find((p) => p.type === 'month') || {}).value || ''
    const dv = Number((parts.find((p) => p.type === 'day') || {}).value)
    if (!mv || Number.isNaN(dv)) return null
    return { m: parseInt(mv, 10), d: dv, leap: mv.endsWith('bis') }
  } catch (e) {
    return null
  }
}

/** 纪念日 a 在公历 y 年 m 月里的发生日期集合（'YYYY-MM-DD'） */
export function annDatesInMonth(a, y, m) {
  const out = new Set()
  if (!a || !a.date) return out
  const [ay, am, ad] = String(a.date).split('-').map(Number)
  if (a.calendar === 'lunar') {
    /* 农历条目：不重复时只认原始日期；每年时按农历月日整月扫描匹配 */
    if (!a.repeat_yearly) {
      if (ay === y && am === m) out.add(a.date)
      return out
    }
    const md = lunarMDOf(a.date)
    if (!md) return out
    const days = new Date(y, m, 0).getDate()
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${pad2(m)}-${pad2(d)}`
      const cur = lunarMDOf(ds)
      /* 月日相同即匹配；闰月歧义时优先平月（纪念日设在闰月，则平月也算） */
      if (cur && cur.m === md.m && cur.d === md.d && (cur.leap === md.leap || !cur.leap)) out.add(ds)
    }
  } else {
    if (a.repeat_yearly) {
      const days = new Date(y, m, 0).getDate()
      if (am === m && ad >= 1 && ad <= days) out.add(`${y}-${pad2(m)}-${pad2(ad)}`)
    } else if (ay === y && am === m) {
      out.add(a.date)
    }
  }
  return out
}
