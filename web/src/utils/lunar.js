/**
 * 农历日期展示：把 YYYY-MM-DD 转成中文农历文本（如「四月十三」）。
 * 用浏览器内置的 Intl 中文农历日历（zh-CN-u-ca-chinese）取月份与日，
 * 再把阿拉伯数字的日转成中文习惯写法（初一 / 十五 / 廿三）。
 * 浏览器不支持时回退为空字符串，调用方自行回退到公历。
 */

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/** 农历日的中文习惯写法：初一…初十、十一…二十、廿一…廿九、三十 */
function cnDay(n) {
  if (n <= 0 || n > 30) return String(n)
  if (n < 10) return `初${CN_NUM[n]}`
  if (n === 10) return '初十'
  if (n < 20) return `十${CN_NUM[n - 10]}`
  if (n === 20) return '二十'
  if (n < 30) return `廿${CN_NUM[n - 20]}`
  return '三十'
}

/** 传入 'YYYY-MM-DD'，返回如「四月十三」「闰六月初一」；失败返回空字符串 */
export function lunarText(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(`${dateStr}T00:00:00`)
    if (Number.isNaN(d.getTime())) return ''
    const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' })
    const parts = fmt.formatToParts(d)
    const month = (parts.find((p) => p.type === 'month') || {}).value || ''
    const dayRaw = (parts.find((p) => p.type === 'day') || {}).value || ''
    const day = Number(dayRaw)
    if (!month) return ''
    return `${month}${Number.isNaN(day) ? dayRaw : cnDay(day)}`
  } catch (e) {
    return ''
  }
}

/** 按条目的历法设置，返回展示用的日期文本：农历时直接显示农历 */
export function displayDate(a) {
  if (!a) return ''
  if (a.calendar === 'lunar') {
    const lt = lunarText(a.date)
    return lt ? `农历${lt}` : a.date || ''
  }
  return a.date || ''
}
