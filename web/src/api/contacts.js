import http from './http'

export function getContacts() {
  return http.get('/contacts')
}

// 最近互动的联系人（主页默认选中用）
export function getRecentContacts(limit = 10) {
  return http.get('/contacts/recents', { params: { limit } })
}

export function createContact(payload) {
  return http.post('/contacts', payload)
}

export function getContact(id) {
  return http.get(`/contacts/${id}`)
}

export function updateContact(id, payload) {
  return http.patch(`/contacts/${id}`, payload)
}

export function deleteContact(id) {
  return http.delete(`/contacts/${id}`)
}

export function getContactSettings(id) {
  return http.get(`/contacts/${id}/settings`)
}

export function updateContactSettings(id, payload) {
  return http.patch(`/contacts/${id}/settings`, payload)
}

export function markContactRead(id) {
  return http.post(`/contacts/${id}/read`)
}

// 桌面配置（按联系人的首页人物卡/一起听/备忘录等）
export function getDesktop(id) {
  return http.get(`/contacts/${id}/desktop`)
}

export function updateDesktop(id, payload) {
  return http.patch(`/contacts/${id}/desktop`, payload)
}

// 群成员列表
export function getContactMembers(id) {
  return http.get(`/contacts/${id}/members`)
}

// 群成员增删
export function addGroupMember(id, contactId) {
  return http.post(`/contacts/${id}/members`, { contactId })
}

// 群成员批量添加（多选联系人，一键加入）
export function addGroupMembers(id, contactIds) {
  return http.post(`/contacts/${id}/members`, { contactIds })
}

export function removeGroupMember(id, memberId) {
  return http.delete(`/contacts/${id}/members/${memberId}`)
}

// 群成员的独立规则（未设置时返回 inherited 兜底）
export function getGroupMemberSettings(id) {
  return http.get(`/contacts/${id}/members/settings`)
}

export function saveGroupMemberSettings(id, memberId, payload) {
  return http.patch(`/contacts/${id}/members/${memberId}/settings`, payload)
}

export function resetGroupMemberSettings(id, memberId) {
  return http.delete(`/contacts/${id}/members/${memberId}/settings`)
}

// 头像上传，返回 { path }
export function uploadAvatar(id, file) {
  const form = new FormData()
  form.append('avatar', file)
  return http.post(`/contacts/${id}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 通用文件上传（如“我的头像”），返回 { path }
export function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  return http.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
