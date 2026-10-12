import http from './http'

/* 通用模块数据（日记 / 备忘录 / 心情 / 经期 / 相册 / 音乐 / 影视 / 游戏 / 档案） */

export function listItems(module, contactId = null) {
  const params = { module }
  if (contactId != null && contactId !== '') params.contactId = contactId
  return http.get('/items', { params })
}

export function createItem(payload) {
  return http.post('/items', payload)
}

export function updateItem(id, payload) {
  return http.patch(`/items/${id}`, payload)
}

export function removeItem(id) {
  return http.delete(`/items/${id}`)
}
