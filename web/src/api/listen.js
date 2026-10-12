import http from './http'

export function sendListenInvite(contactId, song) {
  return http.post('/listen/invites', { contactId, song })
}
export function respondListenInvite(id, accept) {
  return http.post(`/listen/invites/${id}/respond`, { accept })
}
export function cancelListenInvite(id) {
  return http.post(`/listen/invites/${id}/cancel`)
}
export function endListen(id) {
  return http.post(`/listen/invites/${id}/end`)
}
export function getListenInvites(limit = 50) {
  return http.get('/listen/invites', { params: { limit } })
}
/* 一起听累计分钟数（全局） */
export function getListenMinutes() {
  return http.get('/listen/minutes').then((r) => (typeof r === 'object' && r?.minutes !== undefined ? r : { minutes: r }))
}
export function addListenMinutes(add) {
  return http.post('/listen/minutes', { add })
}
export function setListenMinutes(value) {
  return http.post('/listen/minutes', { value })
}
