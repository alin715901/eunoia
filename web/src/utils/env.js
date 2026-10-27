/* 是否运行在「套壳 WebView」（如「网页转 APK」类 App 内的 Android WebView）。
   这类环境 Service Worker 行为异常、存储常被清空，且 location.reload 循环
   极易导致白屏卡死 + 反复重刷——需要自适应（关闭自动重刷、跳过 SW 注册）。 */
export function isWebView() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // Android WebView 的 UA 固定带 ; wv; 令牌；部分套壳工具直接写入 WebView 字样
  if (/;\s*wv[;)]/i.test(ua)) return true
  if (/WebView/i.test(ua)) return true
  return false
}
