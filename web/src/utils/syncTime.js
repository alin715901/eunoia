/**
 * 同步时间格式化（OSS 页顶部与设置页 OSS 行共用）
 * t: 上次同步的时间戳（ms）
 */
export function fmtSyncTime(t) {
  const diff = Date.now() - t
  const d = new Date(t)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diff < 60 * 1000) return '刚刚同步'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前同步`
  const startToday = new Date().setHours(0, 0, 0, 0)
  if (t >= startToday) return `今天 ${hm} 同步`
  if (t >= startToday - 24 * 60 * 60 * 1000) return `昨天 ${hm} 同步`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm} 同步`
}
