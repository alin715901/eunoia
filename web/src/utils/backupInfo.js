/* 备份文件信息展示 helpers：本地导入弹窗（StorageView）与
   云端恢复弹窗（OssView）共用，保证两处展示口径一致 */
import { BACKUP_FEATURES, BACKUP_TABLE_LABELS } from '@/api/settings'

export function fmtBackupTime(ts) {
  const d = new Date(Number(ts) || 0)
  if (!d.getTime()) return '未知'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function backupScopeText(s) {
  if (!s) return '未知范围'
  if (s.type === 'feature') {
    const labels = (s.features || []).map((k) => (BACKUP_FEATURES.find((f) => f.key === k) || {}).label).filter(Boolean)
    return labels.length ? `板块：${labels.join('、')}` : '板块数据'
  }
  if (s.type === 'contacts') return `联系人 × ${(s.contacts || []).length}（含关联数据）`
  return '全部数据'
}

export function backupTotalRows(data) {
  return Object.values(data.tables || {}).reduce((s, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0)
}

export function backupTablesText(data) {
  const parts = Object.entries(data.tables || {})
    .filter(([, rows]) => Array.isArray(rows) && rows.length)
    .map(([t, rows]) => `${BACKUP_TABLE_LABELS[t] || t} ${rows.length}`)
  return parts.length ? parts.join(' · ') : '（空备份）'
}
