import http from './http'

export function getMusicSongs(contactId) {
  return http.get('/music/songs', { params: { contactId } })
}
export function importMusic(url, note = '') {
  return http.post('/music/import', { url, note })
}
export function addMusicManual(payload) {
  return http.post('/music/manual', payload)
}
export function updateMusicSong(id, payload) {
  return http.put(`/music/songs/${id}`, payload)
}
export function deleteMusicSong(id) {
  return http.delete(`/music/songs/${id}`)
}
export function batchDeleteMusicSongs(ids) {
  return http.post('/music/songs/batch-delete', { ids })
}
export function clearUnplayableSongs() {
  return http.post('/music/clear-unplayable')
}
export function favMusicSong(id, contactId) {
  return http.post(`/music/songs/${id}/fav`, { contactId })
}
export function getMusicSettings(contactId) {
  return http.get('/music/settings', { params: { contactId } })
}
export function saveMusicSettings(payload) {
  return http.put('/music/settings', payload)
}
export function uploadMusicFile(formData) {
  return http.post('/music/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
}
export function streamUrl(id) {
  return `/api/music/stream/${id}?t=${Date.now()}`
}
/* 某个联系人的收藏歌曲 id（每个联系人各自一份收藏） */
export function getFavIds(contactId) {
  return http.get('/music/favids', { params: { contactId } })
}
export function getMusicLyric(id) {
  return http.get(`/music/songs/${id}/lyric`)
}
