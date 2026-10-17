/* 对方思考时间：默认随机 1~10 秒，可指定区间（min~max 毫秒），
   模拟真人对手的决策节奏 */
export function aiDelay(min = 1000, max = 10000) {
  return min + Math.random() * (max - min)
}
