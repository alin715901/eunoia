// 「进门安静窗口」：
// 冷启动（全新加载）或从后台切回前台后的短暂时间内，抑制「收到消息」的
// 应用内顶部 toast 弹条——消息仍会落聊天、涨角标、更新列表，只是不在进门
// 瞬间炸一堆横条。让主动消息像真实聊天：在后台 / 离线期间到达，开门就静静
// 躺在聊天里（「就像真实发送到了」），而不是一进门就弹「X 发来一条消息」。
let quietUntil = 0

/* 进入 / 回到前台时调用：此后 ms 毫秒内处于「安静」，new_messages 不弹应用内横条。 */
export function setEntryQuiet(ms) {
  quietUntil = Date.now() + (Number(ms) || 0)
}

/* 当前是否处于进门安静窗口（消息到达只落聊天、不弹横条）。 */
export function isEntryQuiet() {
  return Date.now() < quietUntil
}
