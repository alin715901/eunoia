/* 引用摘要正文（前后端共用逻辑的前端 ESM 版）：
   结构化消息（提问/红包/通话/各类邀请）的 text 存的是 JSON 元数据，
   引用摘要若直接取 text 会露出一串 JSON——映射为可读文案：
   - 提问 → 「提问 · 单选/多选/问答」
   - 红包 → 「[红包] 备注」
   - 通话/邀请 → 「[通话] / [游戏邀请] / [一起听歌] / [一起观影] / [陪伴邀请]」
   提问判定收紧到 type ∈ {single,multi,qa} 且带 question 字段，避免误伤恰好是 JSON 的普通文本。 */
const CARD_LABELS = {
  game_invite: '[游戏邀请]',
  listen_invite: '[一起听歌]',
  cinema_invite: '[一起观影]',
  companion_invite: '[陪伴邀请]',
  call: '[通话]'
}

export function quoteBodyOf(text, assetPath = '', contentType = '') {
  if (CARD_LABELS[contentType]) return CARD_LABELS[contentType]
  if (contentType === 'redpacket') {
    try {
      const t = JSON.parse(text || '{}')
      return t.note ? `[红包] ${t.note}` : '[红包]'
    } catch (e) {
      return '[红包]'
    }
  }
  if (text) {
    try {
      const t = JSON.parse(text)
      if (
        t && typeof t === 'object' && t.question !== undefined &&
        (t.type === 'single' || t.type === 'multi' || t.type === 'qa')
      ) {
        return t.type === 'single' ? '提问 · 单选' : t.type === 'multi' ? '提问 · 多选' : '提问 · 问答'
      }
    } catch (e) {
      /* 非 JSON，按普通文本处理 */
    }
  }
  return text || (assetPath ? '[图片]' : '')
}
