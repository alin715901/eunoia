/* 对方思考时间：1~10 秒随机，模拟真人对手的决策节奏 */
export function aiDelay() {
  return 1000 + Math.random() * 9000
}
