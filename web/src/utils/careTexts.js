/**
 * 经期特殊关怀文案：默认句子 + 用户自定义（localStorage）。
 * period.service（发送时取句池）与 settings/CareTextsView（编辑页）共用本模块，
 * UI 不直接依赖服务层。
 *
 * 自定义存储：{ today: [...], soon: [...] }，缺省的组回落默认池；
 * 与默认完全一致时由编辑页负责移除 key，行为与从未自定义无异。
 */
export const CARE_DEFAULT_TEXTS = {
  today: [
    '生理期来了吧？别碰凉的，多喝热水，不舒服就告诉我。',
    '今天身体还好吗？记得暖暖肚子，别太累着自己。',
    '来例假了记得照顾好自己，红糖水和暖宝宝备上～',
    '生理期的第一天，想提醒你别熬夜，我在这儿陪着你。',
    '例假第一天，肚子疼的话就歇着，别硬撑。'
  ],
  soon: [
    '过两天生理期可能要来了，提前把暖宝宝和红糖备好呀。',
    '算算日子，过两三天该来例假了，这两天别贪凉。',
    '提醒一下，生理期快到了，注意肚子别着凉～',
    '差不多该来例假了，这两天照顾好自己，我记着呢。',
    '再过两三天生理期就要来了，少喝冰的，照顾好自己。'
  ]
}
export const CARE_TEXTS_KEY = 'period_care_texts_v1'
export const CARE_MAX_PER_GROUP = 8
export const CARE_MAX_LEN = 60

/* 当前生效的关怀句池：有自定义用自定义（滤空、截断），否则回落默认 */
export function careTexts(kind) {
  const def = CARE_DEFAULT_TEXTS[kind] || []
  try {
    const raw = JSON.parse(localStorage.getItem(CARE_TEXTS_KEY) || 'null')
    const list = raw && Array.isArray(raw[kind])
      ? raw[kind].filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, CARE_MAX_LEN))
      : []
    return list.length ? list : def
  } catch (e) {
    return def
  }
}
