import { ref } from 'vue'

/* 进度条按住拖动 composable（歌词页 / 播放器进度条共用）
 * - duration：ref/computed，0 或 falsy 时禁用拖动（未加载完的歌）
 * - seekFn：跳转函数，入参为 0~1 的比例
 * - dragPct = -1 表示未拖动（展示真实进度），>= 0 表示拖动中的预览比例
 * 用 pointer capture 保证指针移出进度条区域后仍能继续跟随；拖动过程中实时 seek
 */
export function useSeekDrag(duration, seekFn) {
  const dragPct = ref(-1)
  let rect = null

  function onDown(e) {
    if (!duration.value) return
    e.preventDefault() // 防止长按选中文本 / 触发原生拖拽
    rect = e.currentTarget.getBoundingClientRect()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) { /* ignore */ }
    dragPct.value = calc(e)
    seekFn(dragPct.value)
  }
  function onMove(e) {
    if (dragPct.value < 0) return
    dragPct.value = calc(e)
    seekFn(dragPct.value)
  }
  function onUp() {
    dragPct.value = -1
    rect = null
  }
  function calc(e) {
    if (!rect) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }
  return { dragPct, onDown, onMove, onUp }
}
