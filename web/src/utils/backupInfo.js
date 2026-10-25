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

/* 把备份内容按「板块」汇总（口径与「按板块导出」弹窗完全一致）：
   - 每个板块 = 其 tables 行数 + app_items 里归属该板块的 module 行数；
   - 未归入任何板块的表（联系人 / 群成员 / 联系人设置 / 群设置 / 主动任务）
     合并展示为「联系人及设置」；
   - app_items 里无法归属任何板块的残留 module 归入「其他记录」。
   返回 { features: [{key,label,count}], others: [{label,count}] }，均只含有数据的行 */
const CONTACT_SIDE_TABLES = ['contacts', 'contact_members', 'contact_settings', 'group_member_settings', 'proactive_jobs']

export function backupFeatureSummary(data) {
  const tables = (data && data.tables) || {}
  const rowsOf = (t) => (Array.isArray(tables[t]) ? tables[t] : [])
  const covered = new Set()
  const allMods = new Set()
  const features = []
  for (const f of BACKUP_FEATURES) {
    let c = f.tables.reduce((s, t) => s + rowsOf(t).length, 0)
    f.tables.forEach((t) => covered.add(t))
    for (const [t, mods] of Object.entries(f.mods || {})) {
      covered.add(t)
      for (const m of mods) allMods.add(m)
      c += rowsOf(t).filter((r) => mods.includes(String((r && r.module) || ''))).length
    }
    if (c > 0) features.push({ key: f.key, label: f.label, count: c })
  }
  const others = []
  let contactN = 0
  for (const t of CONTACT_SIDE_TABLES) {
    contactN += rowsOf(t).length
    covered.add(t)
  }
  if (contactN > 0) others.push({ label: '联系人及设置', count: contactN })
  for (const [t, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows) || !rows.length || covered.has(t)) continue
    others.push({ label: BACKUP_TABLE_LABELS[t] || t, count: rows.length })
  }
  const leftover = rowsOf('app_items').filter((r) => !allMods.has(String((r && r.module) || ''))).length
  if (leftover > 0) others.push({ label: '其他记录', count: leftover })
  return { features, others }
}
