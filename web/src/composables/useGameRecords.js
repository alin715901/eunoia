import { useItems } from './useItems'

/**
 * 小游戏纪录：沿用 app_items（module='game'）存放，一款游戏一条 title='best_<kind>' 的记录。
 * extra 结构由各游戏自定义（如 { rounds } / { wins } / { attempts }），
 * better() 决定「新纪录是否更优」，不更优只累加计数类字段。
 */
export function useGameRecords() {
  const { items, load, add, update } = useItems('game')

  async function bestOf(kind) {
    await load()
    const r = items.value.find((x) => x.title === `best_${kind}`)
    return r ? { id: r.id, ...(r.extra || {}) } : null
  }

  /**
   * 保存一条成绩：
   *  - lowerBetter：分数越低越好（回合数/猜数次数/步数）
   *  - 否则视为胜场累计（wins +1）
   * 返回 'new'（破纪录）/ 'count'（累加）/ 'none'（无变化）
   */
  async function save(kind, rec = {}, { lowerBetter = false, countKey = null } = {}) {
    await load()
    const row = items.value.find((x) => x.title === `best_${kind}`)
    if (countKey) {
      const next = { ...(row ? row.extra || {} : {}), [countKey]: ((row && row.extra && row.extra[countKey]) || 0) + 1 }
      if (row) await update(row.id, { extra: next })
      else await add({ title: `best_${kind}`, extra: next })
      return 'count'
    }
    const prev = row ? row.extra || {} : null
    const better = !prev || (lowerBetter ? rec.value < prev.value : rec.value > prev.value)
    if (better) {
      if (row) await update(row.id, { extra: rec })
      else await add({ title: `best_${kind}`, extra: rec })
      return 'new'
    }
    return 'none'
  }

  return { items, load, bestOf, save }
}
