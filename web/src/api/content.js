/* 本地版：直接调用浏览器内服务，无网络请求 */
import { uploadFile } from '../local/api'

export {
  getMoments,
  deleteMoment,
  createMoment,
  likeMoment,
  commentMoment,
  deleteMomentComment,
  getLettersHub,
  getLetters,
  createLetter,
  markLetterRead,
  deleteLetter,
  favoriteLetter,
  getDivinations,
  saveDivination,
  clearDivinations,
  deleteDivination,
} from '../local/api'

/* 图片上传（表单或 File 均可），返回 { path }（dataURL） */
export async function uploadImage(input) {
  const file = input && typeof input.get === 'function' ? input.get('file') : input
  return uploadFile(file)
}
