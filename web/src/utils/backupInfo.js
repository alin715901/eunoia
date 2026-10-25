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

/* app_items 是通用表：游戏 / 影院 / 心情 / 备忘录 / 经期 / 相册等模块记录都按
   module 存在这一张表里。备份清单里不能只显示「模块记录 N」，用户看不到自己
   的游戏纪录、心情日记到底有没有进备份——按 module 拆开列出 */
const APP_ITEM_MODULE_LABELS = {
  memo: '备忘录',
  mood: '心情',
  period: '经期',
  game: '游戏',
  cinema: '影院',
  cinema_sites: '影院站点',
  cinema_links: '影院链接',
  album: '相册记录',
  music: '音乐'
}

export function backupTablesText(data) {
  const parts = []
  for (const [t, rows] of Object.entries(data.tables || {})) {
    if (!Array.isArray(rows) || !rows.length) continue
    if (t === 'app_items') {
      const byMod = new Map()
      for (const r of rows) {
        const m = String((r && r.module) || '其他')
        byMod.set(m, (byMod.get(m) || 0) + 1)
      }
      const sorted = [...byMod.entries()].sort((a, b) => b[1] - a[1])
      for (const [m, n] of sorted) parts.push(`${APP_ITEM_MODULE_LABELS[m] || m} ${n}`)
      continue
    }
    parts.push(`${BACKUP_TABLE_LABELS[t] || t} ${rows.length}`)
  }
  return parts.length ? parts.join(' · ') : '（空备份）'
}
