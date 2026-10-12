import http from './http'

// ---------- 纪念日 ----------
export function getAnniversaries(params = {}) {
  const q = params.contactId != null ? `?contactId=${params.contactId}` : ''
  return http.get(`/anniversaries${q}`)
}

export function createAnniversary(payload) {
  return http.post('/anniversaries', payload)
}

export function updateAnniversary(id, payload) {
  return http.patch(`/anniversaries/${id}`, payload)
}

export function deleteAnniversary(id) {
  return http.delete(`/anniversaries/${id}`)
}