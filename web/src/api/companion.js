import http from './http'

/* 陪伴邀请 API */
export function sendCompanionInvite(payload) {
  return http.post('/companion/invites', payload)
}
export function respondCompanionInvite(id, accept) {
  return http.post(`/companion/invites/${id}/respond`, { accept })
}
export function cancelCompanionInvite(id) {
  return http.post(`/companion/invites/${id}/cancel`)
}
export function getCompanionInvites(limit = 50) {
  return http.get('/companion/invites', { params: { limit } })
}
