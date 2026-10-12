import http from './http'

export function getSettings() {
  return http.get('/settings')
}

export function saveSettings(payload) {
  return http.patch('/settings', payload)
}

export function getBadges() {
  return http.get('/badges')
}

// 内存数据：各数据表条数 + 数据库/上传文件占用
export function getStorageStats() {
  return http.get('/storage-stats')
}

// 通用文件上传，返回 { path }
// 手机照片可能 3-5MB，走反向隧道时上传很慢，因此单独放宽超时
export function uploadFile(file, onProgress) {
  const form = new FormData()
  form.append('file', file)
  return http.post('/upload', form, {
    timeout: 120000,
    onUploadProgress: onProgress
  })
}
