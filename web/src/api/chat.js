import http from './http'

// 微信式聊天列表：所有联系人/群聊 + 最后一条摘要
export function getChatList() {
  return http.get('/chats')
}

// 搜索聊天记录（全库文本匹配）
export function searchMessages(q, contactId) {
  const params = { q }
  // 传 contactId：只搜这个聊天（会话内搜索用，能搜到分页之外的旧消息）
  if (contactId != null) params.contactId = contactId
  return http.get('/chats/search', { params })
}

export function getMessages(contactId, cursor) {
  const params = {}
  if (cursor) params.cursor = cursor
  return http.get(`/contacts/${contactId}/messages`, { params })
}

export function sendMessage(contactId, text, quoteId = null) {
  return http.post(`/contacts/${contactId}/messages`, { text, quoteId })
}

// 让对方继续说：不等我发消息，对方也会先"正在输入"再回一条
export function continueTalk(contactId) {
  return http.post(`/contacts/${contactId}/continue`)
}

export function markMessageRead(messageId) {
  return http.patch(`/messages/${messageId}/read`)
}

// 撤回我的消息（清空正文，聊天里显示为「我撤回了一条消息」）
export function recallMessage(messageId) {
  return http.patch(`/messages/${messageId}/recall`)
}

// 删除单条消息
export function deleteMessage(messageId) {
  return http.delete(`/messages/${messageId}`)
}

// 收藏某条消息（落库到 favorites）
export function favoriteMessage(messageId) {
  return http.post(`/messages/${messageId}/favorite`)
}

// 领取对方发来的红包（sender='contact' 且 status='unclaimed'）：返回 { message, wallet }
export function claimRedPacket(messageId) {
  return http.post(`/messages/${messageId}/claim`)
}

// 退回对方发来的红包（sender='contact' 且 status='unclaimed'）：返回 { message }
export function returnRedPacket(messageId) {
  return http.post(`/messages/${messageId}/return`)
}

// 收藏列表（「统计」页）
export function getFavorites() {
  return http.get('/favorites')
}

// 红包钱包：我的余额 + 对方余额（仅单人联系人）
export function getWallet(contactId) {
  return http.get(`/contacts/${contactId}/wallet`)
}

// 清空某联系人的全部聊天记录
export function clearMessages(contactId) {
  return http.delete(`/contacts/${contactId}/messages`)
}

/* ── 特殊消息：相册图片 / 红包 / 通话 / 提问 ── */
// 发送图片消息（先经 /upload 上传，得到 path 再调这里）
// contentType：'image'（相册图片）| 'sticker'（表情面板点发的表情包，前端按更小尺寸渲染）
export function sendImage(contactId, assetPath, contentType = 'image') {
  return http.post(`/contacts/${contactId}/image`, { assetPath, contentType })
}

// 发送红包（amount 金额，可选 note 留言）
export function sendRedPacket(contactId, amount, note = '') {
  return http.post(`/contacts/${contactId}/redpacket`, { amount, note })
}

// 保存通话记录（{ duration 秒, result 结果 }，挂断后调用）
export function sendCallRecord(contactId, payload) {
  return http.post(`/contacts/${contactId}/call`, payload)
}

// 发送提问（type: single/multi/qa，options 选项数组）
export function sendQuestion(contactId, payload) {
  return http.post(`/contacts/${contactId}/question`, payload)
}
