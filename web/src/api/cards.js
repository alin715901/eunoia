import http from './http'

export function getCardGroups({ scope, contactId, category } = {}) {
  const params = {}
  if (scope) params.scope = scope
  if (contactId) params.contactId = contactId
  if (category) params.category = category
  return http.get('/card-groups', { params })
}

export function getCardGroupStats() {
  return http.get('/card-groups/stats')
}

export function createCardGroup(payload) {
  return http.post('/card-groups', payload)
}

export function updateCardGroup(id, payload) {
  return http.patch(`/card-groups/${id}`, payload)
}

export function deleteCardGroup(id) {
  return http.delete(`/card-groups/${id}`)
}

export function getCards({ scope, contactId, category, groupId, includeBlocked } = {}) {
  const params = {}
  if (scope) params.scope = scope
  if (contactId) params.contactId = contactId
  if (category) params.category = category
  if (groupId) params.groupId = groupId
  /* 管理界面需要看到被屏蔽的卡与屏蔽分组里的卡 */
  if (includeBlocked) params.includeBlocked = 1
  return http.get('/cards', { params })
}

export function createCard(payload) {
  return http.post('/cards', payload)
}

export function updateCard(id, payload) {
  return http.patch(`/cards/${id}`, payload)
}

/* 批量建卡：导入时一次请求插入全部字卡 */
export function createCardsBatch(cards) {
  return http.post('/cards/batch', { cards })
}

// 导入 mochi 字卡全量备份（json 为已解析对象，ownerContactId 绑定专属/题库等）
export function importMochi(json, ownerContactId = null) {
  return http.post('/import/mochi', { json, ownerContactId })
}

export function deleteCard(id) {
  return http.delete(`/cards/${id}`)
}

export function drawPreview({ contactId, count }) {
  return http.post('/draw/preview', { contactId, count })
}
