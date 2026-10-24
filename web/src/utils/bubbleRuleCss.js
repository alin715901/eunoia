// 规则式气泡自定义 CSS 的 <style> 注入：聊天页与设置页预览各一个样式标签，
// 运行时追加到文档末尾，层叠上后于打包样式，配合用户 !important 声明开箱即用。
import { ruleCssForChat, ruleCssForPreview } from '@/utils/bubbleStyle'

let chatStyle = null
let previewStyle = null

function ensure(id) {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  return el
}

/* 聊天页注入：css 为空 / 非规则式时移除标签 */
export function applyChatBubbleRuleCss(css) {
  const text = ruleCssForChat(css)
  if (!text) {
    chatStyle?.remove()
    chatStyle = null
    return
  }
  chatStyle = ensure('bubble-custom-css')
  chatStyle.textContent = text
}

/* 气泡样式设置页预览注入（只影响预览区 mock 气泡） */
export function applyPreviewBubbleRuleCss(css) {
  const text = ruleCssForPreview(css)
  if (!text) {
    previewStyle?.remove()
    previewStyle = null
    return
  }
  previewStyle = ensure('bubble-preview-css')
  previewStyle.textContent = text
}
