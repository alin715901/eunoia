/* 概率换算工具：UI 上用户按「每小时 %」或「每次 %」配置，
   服务里的定时 tick 是每分钟粒度，需要换算后才能与 Math.random() 比较 */

/** 每小时概率(%) → 每分钟触发概率（泊松近似：1-(1-P)^(1/60)） */
export function hourlyToPerMinute(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100
  if (p <= 0) return 0
  if (p >= 1) return 1
  return 1 - Math.pow(1 - p, 1 / 60)
}

/** 百分比(%) → 0-1 概率（用于「每次触发」类判断） */
export function pctToProb(pct) {
  return Math.max(0, Math.min(100, Number(pct) || 0)) / 100
}
