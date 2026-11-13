/* 导入链路的「纯函数」部分：备份格式常量与校验。
 * 之所以独立成模块，是因为解码 Web Worker 不能依赖主线程的 db 实例，
 * 但仍需与 importBackup 共用同一套格式判定，避免逻辑漂移导致两边校验结果不一致。
 * 本模块严禁引入 db / DOM / 任何运行环境依赖。 */

export const FORMAT = 'eunoia-backup'
export const VERSION = 1

/* 备份文件合法性校验（纯函数，不碰数据库）：
 * 返回 null 表示合法；返回字符串表示错误原因（由调用方提示用户）。 */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return '文件不是有效的备份'
  if (obj.format !== FORMAT) return '不是本应用生成的备份文件'
  if (!obj.tables || typeof obj.tables !== 'object' || Array.isArray(obj.tables)) return '备份文件缺少数据表'
  for (const [t, rows] of Object.entries(obj.tables)) {
    if (!Array.isArray(rows)) return `备份文件损坏：表 ${t} 数据异常`
    if (rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return `备份文件损坏：表 ${t} 存在无效记录`
  }
  if (obj.version > VERSION) return '备份文件版本过新，请升级应用后再导入'
  return null
}
