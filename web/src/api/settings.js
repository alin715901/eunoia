/* 本地版：直接调用浏览器内服务，无网络请求 */
export {
  getSettings,
  saveSettings,
  getBadges,
  getStorageStats,
  resetDb,
  uploadFile,
  getWallBgPresets,
  saveWallBgPresets,
  getBackupOverview,
  buildBackup,
  importBackup,
  validateBackupFile,
} from '../local/api'
export { BACKUP_FEATURES, BACKUP_TABLE_LABELS } from '../local/services/backup.service'
