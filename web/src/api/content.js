import http from './http'

// scope: 'all' 看全部 | 'contact' 只看某人的动态
// viewer: 当前以谁的身份在看（0=我，>0=联系人 id），决定点赞/评论状态
export function getMoments(contactId, viewer = 0, scope = 'contact', authorId = null) {
  return http.get('/moments', { params: { contactId, viewer, scope, authorId } })
}
export function deleteMoment(id) {
  return http.delete(`/moments/${id}`)
}
export function createMoment(payload) {
  return http.post('/moments', payload)
}
export function likeMoment(id, viewer = 0) {
  return http.post(`/moments/${id}/like`, { viewer })
}
export function commentMoment(id, payload) {
  return http.post(`/moments/${id}/comments`, payload)
}
export function deleteMomentComment(cid) {
  return http.delete(`/moments/comments/${cid}`)
}

// 信件：信箱枢纽（每位联系人一格）
export function getLettersHub() {
  return http.get('/letters/hub')
}
export function getLetters(contactId) {
  return http.get('/letters', { params: { contactId } })
}
export function createLetter(payload) {
  return http.post('/letters', payload)
}
export function markLetterRead(id) {
  return http.patch(`/letters/${id}/read`)
}
export function deleteLetter(id) {
  return http.delete(`/letters/${id}`)
}
export function favoriteLetter(id) {
  return http.post(`/letters/${id}/favorite`)
}

export function uploadImage(formData) {
  return http.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// 占卜记录
export function getDivinations() {
  return http.get('/divinations')
}
export function saveDivination(payload) {
  return http.post('/divinations', payload)
}
export function clearDivinations() {
  return http.delete('/divinations')
}
export function deleteDivination(id) {
  return http.delete(`/divinations/${id}`)
}
