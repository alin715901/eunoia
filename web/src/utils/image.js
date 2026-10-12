/**
 * 图片压缩工具：上传前在浏览器端等比缩放并转 JPEG，
 * 避免手机原图（3-5MB）走隧道上传超时，也节省服务端存储。
 * 失败时回退到原始文件，保证功能可用。
 */

const MAX_EDGE = 1280 // 长边上限
const QUALITY = 0.82 // JPEG 质量

/**
 * @param {File} file
 * @returns {Promise<File>} 压缩后的 File（失败则返回原文件）
 */
export async function compressImage(file) {
  // 非图片或 GIF（需要保留动画）直接返回
  if (!file || !file.type || !file.type.startsWith('image/')) return file
  if (file.type === 'image/gif') return file

  try {
    // 已是小图则不处理
    if (file.size < 300 * 1024) return file

    const bitmap = await loadBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1024 * 1024) {
      closeBitmap(bitmap)
      return file
    }

    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    closeBitmap(bitmap)

    const blob = await canvasToBlob(canvas, QUALITY)
    if (!blob || blob.size >= file.size) return file

    const ext = 'jpg'
    const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (e) {
    // 压缩失败（例如格式不支持）用原图，不阻塞用户
    return file
  }
}

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  // Safari 兜底
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

function closeBitmap(bmp) {
  if (bmp && typeof bmp.close === 'function') bmp.close()
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    } else {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const bin = atob(dataUrl.split(',')[1])
        const arr = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
        resolve(new Blob([arr], { type: 'image/jpeg' }))
      } catch (e) {
        resolve(null)
      }
    }
  })
}