<template>
  <div class="sp-view">
    <AppHeader title="内存数据" back />
    <div class="sp-body">
      <!-- 存储用量 -->
      <div class="panel sec">
        <div class="usage-head">
          <span class="usage-title">
            <svg class="usage-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
              <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
            </svg>
            存储用量
          </span>
          <span class="usage-meta">{{ fmtSize(stats.dbSize) }} / {{ fmtSize(CAP) }} ({{ pct }}%)</span>
        </div>

        <!-- 三段式占用条：聊天 / 内容 / 设置 -->
        <div class="usage-track">
          <div class="usage-fill" :style="{ width: pct + '%' }">
            <i v-for="g in legend" :key="g.key" class="seg" :class="'seg-' + g.key" :style="{ width: g.share + '%' }"></i>
          </div>
        </div>

        <!-- 图例明细 -->
        <div class="usage-legend">
          <div v-for="g in legend" :key="g.key" class="lg-row">
            <i class="lg-dot" :class="'dot-' + g.key"></i>
            <span class="lg-name">{{ g.label }}</span>
            <span class="lg-share">{{ g.shareText }}</span>
            <span class="lg-val">{{ fmtSize(g.bytes) }}</span>
          </div>
        </div>
        <p class="usage-foot">容量上限为展示值；图片 / 语音等附件随数据库一起存储，可用「迁移本地图片到云端」减小占用。</p>
      </div>

      <!-- 数据备份 -->
      <div class="panel sec">
        <div class="sec-title">数据备份</div>
        <p class="bk-hint">
          导出为 JSON 文件保存，换设备 / 换浏览器时导入即可恢复。图片、语音等附件都存在数据库里，会一起打包进备份。
        </p>
        <div class="bk-btns">
          <button class="mini-btn" @click="exportAll">全部导出</button>
          <button class="mini-btn" @click="openExport('feature')">按板块导出</button>
          <button class="mini-btn" @click="openExport('contacts')">按联系人导出</button>
          <button class="mini-btn" :disabled="importing" @click="pickFile">{{ importing ? '导入中…' : '导入数据' }}</button>
        </div>
        <input ref="fileEl" type="file" accept=".json,application/json" class="bk-file" @change="onFilePicked" />
      </div>

      <!-- 重置数据 -->
      <div class="panel sec">
        <div class="sec-title">重置数据</div>
        <p class="bk-hint">清空本设备上的全部本地数据（联系人、聊天、音乐、字卡等），并恢复初始状态，不可恢复。</p>
        <button class="mini-btn danger" :disabled="resetting" @click="askReset">
          {{ resetting ? '重置中…' : '重置数据' }}
        </button>
      </div>
    </div>

    <!-- 按板块导出弹窗 -->
    <Modal :show="featureOpen" title="按板块导出" width="360px" @close="featureOpen = false">
      <div class="exp-pane">
        <p class="exp-desc">勾选要导出的桌面功能板块；关联到的联系人、字卡、歌曲等会自动一起带上。</p>
        <label v-for="f in overview.features" :key="f.key" class="ck-row">
          <input type="checkbox" :value="f.key" v-model="picked.features" />
          <span class="ck-name">{{ f.label }}</span>
          <span class="ck-count">{{ f.count }} 条</span>
        </label>
        <p v-if="!overview.features.length" class="exp-empty">暂无板块数据</p>
      </div>

      <template #footer>
        <button class="mini-btn" @click="featureOpen = false">取消</button>
        <button class="mini-btn primary" :disabled="picked.features.length === 0" @click="doExport('feature')">导出</button>
      </template>
    </Modal>

    <!-- 按联系人导出弹窗 -->
    <Modal :show="contactsOpen" title="按联系人导出" width="360px" @close="contactsOpen = false">
      <div class="exp-pane">
        <p class="exp-desc">勾选联系人，与该联系人相关的全部数据（聊天、红包、设置、桌面、纪念日、字卡等）都会导出。</p>
        <label class="ck-row ck-all">
          <input type="checkbox" :checked="allContactsPicked" @change="toggleAllContacts" />
          <span class="ck-name">全选</span>
          <span class="ck-count">{{ picked.contacts.length }}/{{ overview.contacts.length }}</span>
        </label>
        <label v-for="c in overview.contacts" :key="c.id" class="ck-row">
          <input type="checkbox" :value="c.id" v-model="picked.contacts" />
          <span class="ck-ava">
            <img v-if="isImg(c.avatar)" :src="c.avatar" alt="" />
            <template v-else>{{ (c.name || '·').charAt(0) }}</template>
          </span>
          <span class="ck-name">{{ c.name || '未命名' }}</span>
          <span class="ck-count">{{ c.count }} 条</span>
        </label>
        <p v-if="!overview.contacts.length" class="exp-empty">暂无联系人</p>
      </div>

      <template #footer>
        <button class="mini-btn" @click="contactsOpen = false">取消</button>
        <button class="mini-btn primary" :disabled="picked.contacts.length === 0" @click="doExport('contacts')">导出</button>
      </template>
    </Modal>

    <!-- 导入弹窗 -->
    <Modal :show="importOpen" title="导入数据" width="360px" @close="importOpen = false">
      <template v-if="parseError">
        <p class="imp-err">{{ parseError }}</p>
      </template>
      <template v-else-if="pending">
        <div class="imp-info">
          <div class="imp-row"><span>备份时间</span><span>{{ fmtTime(pending.created_at) }}</span></div>
          <div class="imp-row"><span>数据范围</span><span>{{ scopeText(pending.scope) }}</span></div>
          <div class="imp-row"><span>数据量</span><span>{{ totalRows(pending) }} 条</span></div>
        </div>
        <p class="imp-tables">{{ tablesText(pending) }}</p>
        <div class="imp-modes">
          <button class="imp-btn" :disabled="importing" @click="doImport('merge')">
            <b>合并到当前数据</b>
            <span>保留当前数据，备份内容作为新条目加入；同名联系人、同源歌曲会自动归并到已有条目</span>
          </button>
          <button class="imp-btn danger" :disabled="importing" @click="askOverwrite">
            <b>覆盖导入</b>
            <span>先删除当前相应数据，再用备份替换，不可恢复</span>
          </button>
        </div>
      </template>
      <template #footer>
        <button class="mini-btn" @click="importOpen = false">取消</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import Modal from '@/components/common/Modal.vue'
import {
  getStorageStats,
  getBackupOverview,
  buildBackup,
  importBackup,
  validateBackupFile,
  resetDb,
  BACKUP_FEATURES,
  BACKUP_TABLE_LABELS
} from '@/api/settings'
import { BACKUP_FORMAT } from '@/local/services/backup.service'
import { confirmDialog } from '@/utils/dialog'
import { useNotificationsStore } from '@/stores/notifications'

const toast = useNotificationsStore()

/* ─────────── 存储用量 ─────────── */
const CAP = 512 * 1024 * 1024 // 展示用容量上限
const stats = ref({ tables: [], dbSize: 0, groups: { chat: {}, content: {}, settings: {} } })
const groups = computed(() => stats.value.groups || { chat: {}, content: {}, settings: {} })
const pct = computed(() => {
  const v = Number(stats.value.dbSize) || 0
  return Math.min(100, Math.round((v / CAP) * 1000) / 10)
})

/* 占用条三段：按各分组占总用量的比例分配 */
const legend = computed(() => {
  const g = stats.value.groups || { chat: {}, content: {}, settings: {} }
  const total = Number(stats.value.dbSize) || 0
  return [
    { key: 'chat', label: '聊天记录', bytes: Number(g.chat?.bytes) || 0 },
    { key: 'content', label: '内容数据', bytes: Number(g.content?.bytes) || 0 },
    { key: 'settings', label: '联系人设置', bytes: Number(g.settings?.bytes) || 0 }
  ].map((x) => {
    const share = total > 0 ? Math.round((x.bytes / total) * 1000) / 10 : 0
    return { ...x, share, shareText: total > 0 ? `${share}%` : '—' }
  })
})

function fmtSize(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / 1024 / 1024).toFixed(2)} MB`
}

async function load() {
  try {
    const d = await getStorageStats()
    stats.value = d || { tables: [], dbSize: 0, groups: { chat: {}, content: {}, settings: {} } }
  } catch (e) {
    /* 忽略，保留上次数据 */
  }
}

/* ─────────── 导出 ─────────── */
const featureOpen = ref(false)
const contactsOpen = ref(false)
const overview = ref({ features: [], contacts: [] })
const picked = ref({ features: [], contacts: [] })

const allContactsPicked = computed(() =>
  overview.value.contacts.length > 0 && picked.value.contacts.length === overview.value.contacts.length)

function isImg(a) {
  return !!a && (a.startsWith('data:') || a.startsWith('http') || a.startsWith('/assets') || a.startsWith('blob:'))
}

async function openExport(scope) {
  picked.value = { features: [], contacts: [] }
  try {
    overview.value = await getBackupOverview()
  } catch (e) {
    toast.pushToast({ title: '读取数据失败', text: e.message })
    return
  }
  if (scope === 'feature') featureOpen.value = true
  else contactsOpen.value = true
}

function toggleAllContacts(e) {
  picked.value.contacts = e.target.checked ? overview.value.contacts.map((c) => c.id) : []
}

function downloadBackup(data) {
  /* 最终防线：历史上 buildBackup 曾被包成 async，Promise 被 JSON.stringify
     成 {}，导出 2 字节空文件且无任何报错。这里校验格式，非法直接抛错。 */
  if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT || !data.tables) {
    throw new Error('备份数据生成失败，请重试')
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  a.href = url
  a.download = `eunoia-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/* 全部导出：无需选择，直接下载 */
async function exportAll() {
  try {
    /* buildBackup 同步返回；await 防御底层若改成 async 时 Promise 被
       JSON.stringify 成 {} 的历史 bug（导出空文件不可用） */
    downloadBackup(await buildBackup({ type: 'full' }))
    toast.pushToast({ title: '已导出备份文件' })
  } catch (e) {
    toast.pushToast({ title: '导出失败', text: e.message })
  }
}

async function doExport(scope) {
  try {
    const data = await buildBackup(
      scope === 'feature'
        ? { type: 'feature', features: picked.value.features }
        : { type: 'contacts', contacts: picked.value.contacts }
    )
    downloadBackup(data)
    if (scope === 'feature') featureOpen.value = false
    else contactsOpen.value = false
    toast.pushToast({ title: '已导出备份文件' })
  } catch (e) {
    toast.pushToast({ title: '导出失败', text: e.message })
  }
}

/* ─────────── 导入 ─────────── */
const fileEl = ref(null)
const importOpen = ref(false)
const importing = ref(false)
const pending = ref(null)
const parseError = ref('')

function pickFile() {
  if (fileEl.value) fileEl.value.click()
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error || new Error('读取失败'))
    r.readAsText(file)
  })
}

async function onFilePicked(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (file.size > 80 * 1024 * 1024) {
    toast.pushToast({ title: '文件过大', text: '备份文件超过 80MB，无法导入' })
    return
  }
  parseError.value = ''
  pending.value = null
  try {
    const data = JSON.parse(await readText(file))
    const err = validateBackupFile(data)
    if (err) {
      parseError.value = err
    } else {
      pending.value = data
    }
  } catch (err) {
    parseError.value = '无法解析该文件：' + (err && err.message ? err.message : '格式不正确')
  }
  importOpen.value = true
}

function fmtTime(ts) {
  const d = new Date(Number(ts) || 0)
  if (!d.getTime()) return '未知'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function scopeText(s) {
  if (!s) return '未知范围'
  if (s.type === 'feature') {
    const labels = (s.features || []).map((k) => (BACKUP_FEATURES.find((f) => f.key === k) || {}).label).filter(Boolean)
    return labels.length ? `板块：${labels.join('、')}` : '板块数据'
  }
  if (s.type === 'contacts') return `联系人 × ${(s.contacts || []).length}（含关联数据）`
  return '全部数据'
}

function totalRows(data) {
  return Object.values(data.tables || {}).reduce((s, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0)
}

function tablesText(data) {
  const parts = Object.entries(data.tables || {})
    .filter(([, rows]) => Array.isArray(rows) && rows.length)
    .map(([t, rows]) => `${BACKUP_TABLE_LABELS[t] || t} ${rows.length}`)
  return parts.length ? parts.join(' · ') : '（空备份）'
}

async function doImport(mode) {
  if (!pending.value || importing.value) return
  importing.value = true
  try {
    const r = await importBackup(pending.value, mode)
    importOpen.value = false
    toast.pushToast({ title: mode === 'overwrite' ? '已覆盖导入' : '已合并导入', text: r.text })
    setTimeout(() => window.location.reload(), 900)
  } catch (err) {
    toast.pushToast({ title: '导入失败', text: err && err.message ? err.message : '未知错误' })
  } finally {
    importing.value = false
  }
}

async function askOverwrite() {
  const ok = await confirmDialog({
    title: '确认覆盖导入',
    text: '覆盖会先删除当前相应数据，再用备份替换，且不可恢复。确定继续？',
    danger: true,
    okText: '覆盖'
  })
  if (ok) doImport('overwrite')
}

/* ─────────── 重置数据 ─────────── */
const resetting = ref(false)

async function askReset() {
  if (resetting.value) return
  const ok = await confirmDialog({
    title: '确认重置数据',
    text: '这将清空本设备上的全部本地数据（联系人、聊天、音乐、字卡等），并恢复初始状态，不可恢复。确定继续？',
    danger: true,
    okText: '重置'
  })
  if (!ok) return
  resetting.value = true
  try {
    await resetDb()
    toast.pushToast({ title: '已重置数据' })
    setTimeout(() => window.location.reload(), 900)
  } catch (err) {
    resetting.value = false
    toast.pushToast({ title: '重置失败', text: err && err.message ? err.message : '未知错误' })
  }
}

onMounted(load)
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
.mini-btn {
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; color: var(--text);
}
.mini-btn:disabled { opacity: 0.6; }
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.bk-btns .mini-btn,
.mini-btn.danger { padding: 12px; font-size: 14px; border-radius: var(--radius); }
.mini-btn.danger { border-color: #c0576b; color: #c0576b; width: 100%; }
.mini-btn.danger:active { background: rgba(192, 87, 107, 0.08); }
.stat-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 2px; font-size: 14px; color: var(--text);
  border-bottom: 1px solid var(--border);
}
.stat-row:last-child { border-bottom: none; }
.stat-label { color: var(--text); }
.stat-value { color: var(--text-soft); font-size: 13px; }
.stat-row.total .stat-label { font-weight: 600; }
.stat-row.total .stat-value { color: var(--text); font-weight: 600; }

/* 数据备份 */
.bk-hint { font-size: 12px; color: var(--text-soft); line-height: 1.7; margin: 0 0 10px; }
.bk-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bk-btns .mini-btn { width: 100%; }
.bk-file { display: none; }

/* 存储用量 */
/* ── 存储用量：总览数字 + 三段式占用条 + 图例明细 ── */
.usage-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.usage-title { display: inline-flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700; align-self: center; }
.usage-ic { width: 18px; height: 18px; color: #9aa3ad; }
.usage-meta { font-size: 13px; font-weight: 600; color: #c0956a; white-space: nowrap; }
.usage-track { height: 10px; border-radius: 999px; background: var(--bg-soft); overflow: hidden; margin: 14px 0 12px; }
.usage-fill { height: 100%; border-radius: 999px; overflow: hidden; display: flex; background: linear-gradient(90deg, #c0956a, #d9b285); transition: width .3s ease; }
.usage-fill .seg { display: block; height: 100%; }
.seg-chat { background: transparent; }               /* 底色即聊天（渐变） */
.seg-content { background: rgba(155, 108, 255, 0.85); }
.seg-settings { background: rgba(53, 181, 124, 0.8); }
.usage-legend { display: flex; flex-direction: column; }
.lg-row { display: flex; align-items: center; gap: 9px; padding: 9px 2px; border-bottom: 1px solid var(--border); font-size: 13px; }
.lg-row:last-child { border-bottom: none; }
.lg-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.dot-chat { background: linear-gradient(90deg, #c0956a, #d9b285); }
.dot-content { background: rgba(155, 108, 255, 0.85); }
.dot-settings { background: rgba(53, 181, 124, 0.8); }
.lg-name { color: var(--text); }
.lg-share { flex: 1 1 auto; font-size: 12px; color: var(--text-soft); padding-left: 4px; }
.lg-val { font-size: 13px; font-weight: 600; color: var(--text); }
.usage-foot { margin: 10px 0 0; font-size: 11px; line-height: 1.6; color: var(--text-soft); }

/* 导出弹窗 */
.exp-desc { font-size: 12px; color: var(--text-soft); line-height: 1.6; margin: 0 0 8px; }
.exp-empty { font-size: 12px; color: var(--text-soft); text-align: center; padding: 18px 0; margin: 0; }
.ck-row {
  display: flex; align-items: center; gap: 9px; padding: 9px 2px;
  font-size: 14px; color: var(--text); border-bottom: 1px solid var(--border);
}
.ck-row:last-child { border-bottom: none; }
.ck-all { font-weight: 600; }
.ck-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ck-count { font-size: 12px; color: var(--text-soft); flex: 0 0 auto; }
.ck-ava {
  width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto;
  background: var(--avatar-bg); color: var(--avatar-fg);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px; overflow: hidden;
}
.ck-ava img { width: 100%; height: 100%; object-fit: cover; }

/* 导入弹窗 */
.imp-err { color: #c0576b; font-size: 13px; line-height: 1.7; margin: 0; }
.imp-info { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; margin-bottom: 10px; }
.imp-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
.imp-row span:first-child { color: var(--text-soft); flex: 0 0 auto; }
.imp-row span:last-child { text-align: right; word-break: break-all; }
.imp-tables { font-size: 12px; color: var(--text-soft); line-height: 1.7; margin: 0 0 12px; word-break: break-all; }
.imp-modes { display: flex; flex-direction: column; gap: 10px; }
.imp-btn {
  display: flex; flex-direction: column; gap: 3px; text-align: left;
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: var(--radius); padding: 12px; color: var(--text);
}
.imp-btn b { font-size: 14px; }
.imp-btn span { font-size: 12px; color: var(--text-soft); line-height: 1.5; }
.imp-btn.danger { border-color: #c0576b; }
.imp-btn.danger b { color: #c0576b; }
.imp-btn:disabled { opacity: 0.6; }
</style>
