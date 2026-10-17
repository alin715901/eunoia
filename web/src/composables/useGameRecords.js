import { useItems } from './useItems'

/**
 * 小游戏纪录：沿用 app_items（module='game'）存放。
 *  - 最佳成绩：一款游戏一条 title='best_<kind>' 的记录，extra 由各游戏自定义
 *  - 历史记录：每局一条 title='hist_<kind>' 的记录，extra 含
 *    { at, win, tie, detail, opponent, ...游戏自有字段 }，全量留存不清条数
 */
export function useGameRecords() {
  const { items, load, add, update, remove } = useItems('game')

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

  /* ── 历史记录：每局一条，新的在前，全量留存（放不下的由列表滚动展示） ── */

  async function addHistory(kind, rec = {}) {
    await load()
    await add({ title: `hist_${kind}`, extra: { at: Date.now(), ...rec } })
  }

  async function historyOf(kind) {
    await load()
    return items.value
      .filter((x) => x.title === `hist_${kind}`)
      .map((x) => ({ id: x.id, ...(x.extra || {}) }))
      .sort((a, b) => (b.at || 0) - (a.at || 0))
  }

  async function clearHistory(kind) {
    await load()
    const rows = items.value.filter((x) => x.title === `hist_${kind}`)
    for (const r of rows) await remove(r.id)
  }

  return { items, load, bestOf, save, addHistory, historyOf, clearHistory }
}
