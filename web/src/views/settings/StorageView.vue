<template>
  <div class="sp-view">
    <AppHeader title="数据管理" back />
    <div class="sp-body">
      <!-- 存储用量 -->
      <section class="card usage">
        <div class="usage-top">
          <span class="usage-title">🗄 存储用量</span>
          <span class="usage-meta">已用 {{ fmtSize(stats.dbSize) }} / {{ fmtSize(CAP) }} · {{ pct }}%</span>
        </div>
        <div class="usage-bar"><i :style="{ width: pct + '%' }"></i></div>
        <div class="usage-tiles">
          <div class="tile">
            <span class="tile-val">{{ chatCount }}</span>
            <span class="tile-lab">聊天记录</span>
          </div>
          <div class="tile">
            <span class="tile-val">{{ contentCount }}</span>
            <span class="tile-lab">内容收藏</span>
          </div>
          <div class="tile">
            <span class="tile-val">{{ contactCount }}</span>
            <span class="tile-lab">联系人</span>
          </div>
        </div>
      </section>

      <!-- 备份与恢复 -->
      <div class="sec-title">备份与恢复</div>
      <section class="grid">
        <button class="card action" @click="openExport('full')">
          <span class="act-ic ic-blue">💾</span>
          <span class="act-txt"><b>全量备份</b><small>导出全部数据</small></span>
          <span class="act-arrow">›</span>
        </button>
        <button class="card action" @click="openExport('feature')">
          <span class="act-ic ic-purple">🗂️</span>
          <span class="act-txt"><b>按板块备份</b><small>勾选要导出的板块</small></span>
          <span class="act-arrow">›</span>
        </button>
        <button class="card action" @click="openExport('contacts')">
          <span class="act-ic ic-green">👤</span>
          <span class="act-txt"><b>按联系人备份</b><small>连同关联数据导出</small></span>
          <span class="act-arrow">›</span>
        </button>
        <button class="card action" @click="pickFile">
          <span class="act-ic ic-orange">📥</span>
          <span class="act-txt"><b>导入备份</b><small>从 JSON 文件恢复</small></span>
          <span class="act-arrow">›</span>
        </button>
      </section>

      <!-- 重置 -->
      <button class="reset-btn" :disabled="resetting" @click="askReset">
        🗑 {{ resetting ? '重置中…' : '重置数据' }}
      </button>
      <p class="reset-hint">清空本设备上的全部本地数据并恢复初始状态，不可恢复。</p>

      <input ref="fileEl" type="file" accept=".json,application/json" class="bk-file" @change="onFilePicked" />
    </div>

    <!-- 导出弹窗 -->
    <Modal :show="exportOpen" title="导出数据" width="360px" @close="exportOpen = false">
      <div class="seg">
        <button
          v-for="s in SCOPES"
          :key="s.k"
          class="seg-btn"
          :class="{ on: expScope === s.k }"
          @click="expScope = s.k"
        >{{ s.n }}</button>
      </div>

      <div v-if="expScope === 'full'" class="exp-pane">
        <p class="exp-desc">导出当前全部数据（共 {{ overview.total }} 条），包含联系人、聊天、音乐、字卡、信件等所有内容。</p>
      </div>

      <div v-else-if="expScope === 'feature'" class="exp-pane">
        <p class="exp-desc">勾选要导出的板块；关联到的联系人、字卡、歌曲等会自动一起带上。</p>
        <label v-for="f in overview.features" :key="f.key" class="ck-row">
          <input type="checkbox" :value="f.key" v-model="picked.features" />
          <span class="ck-name">{{ f.label }}</span>
          <span class="ck-count">{{ f.count }} 条</span>
        </label>
        <p v-if="!overview.features.length" class="exp-empty">暂无板块数据</p>
      </div>

      <div v-else class="exp-pane">
        <p class="exp-desc">勾选联系人，与该联系人相关的全部数据（聊天、设置、桌面、钱包、纪念日、字卡等）都会导出。</p>
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
        <button class="mini-btn" @click="exportOpen = false">取消</button>
        <button class="mini-btn primary" :disabled="!canExport" @click="doExport">导出</button>
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
import { confirmDialog } from '@/utils/dialog'
import { useNotificationsStore } from '@/stores/notifications'

const toast = useNotificationsStore()

/* ─────────── 存储用量 ─────────── */
const CAP = 512 * 1024 * 1024 // 展示用容量上限
const stats = ref({ tables: [], dbSize: 0 })

const byKey = (k) => {
  const t = stats.value.tables.find((x) => x.key === k)
  return t ? Number(t.count) || 0 : 0
}
const chatCount = computed(() => byKey('chat_messages'))
const contactCount = computed(() => byKey('contacts'))
const contentCount = computed(() =>
  ['letters', 'moments', 'cards', 'favorites', 'wallets', 'anniversaries', 'app_items', 'divinations']
    .reduce((s, k) => s + byKey(k), 0))
const pct = computed(() => {
  const v = Number(stats.value.dbSize) || 0
  return Math.min(100, Math.round((v / CAP) * 100))
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
    stats.value = d || { tables: [], dbSize: 0 }
  } catch (e) {
    /* 忽略，保留上次数据 */
  }
}

/* ─────────── 导出 ─────────── */
const SCOPES = [
  { k: 'full', n: '全部' },
  { k: 'feature', n: '按板块' },
  { k: 'contacts', n: '按联系人' }
]
const exportOpen = ref(false)
const expScope = ref('full')
const overview = ref({ features: [], contacts: [], total: 0 })
const picked = ref({ features: [], contacts: [] })

const canExport = computed(() => {
  if (expScope.value === 'full') return overview.value.total > 0
  if (expScope.value === 'feature') return picked.value.features.length > 0
  return picked.value.contacts.length > 0
})
const allContactsPicked = computed(() =>
  overview.value.contacts.length > 0 && picked.value.contacts.length === overview.value.contacts.length)

function isImg(a) {
  return !!a && (a.startsWith('data:') || a.startsWith('http') || a.startsWith('/assets') || a.startsWith('blob:'))
}

async function openExport(scope) {
  expScope.value = scope || 'full'
  picked.value = { features: [], contacts: [] }
  exportOpen.value = true
  try {
    overview.value = await getBackupOverview()
  } catch (e) {
    toast.pushToast({ title: '读取数据失败', text: e.message })
  }
}

function toggleAllContacts(e) {
  picked.value.contacts = e.target.checked ? overview.value.contacts.map((c) => c.id) : []
}

function doExport() {
  try {
    const data = buildBackup({
      type: expScope.value,
      features: picked.value.features,
      contacts: picked.value.contacts
    })
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
    exportOpen.value = false
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
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 14px; }

/* 通用卡片 */
.card { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }

/* 存储用量 */
.usage { padding: 16px; }
.usage-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.usage-title { font-size: 15px; font-weight: 700; }
.usage-meta { font-size: 12px; color: var(--text-soft); }
.usage-bar { height: 8px; border-radius: 999px; background: var(--bg-soft); overflow: hidden; margin: 12px 0; }
.usage-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6c8cff, #8a6cff); transition: width .3s ease; }
.usage-tiles { display: flex; gap: 8px; }
.tile {
  flex: 1; background: var(--bg-soft); border-radius: var(--radius);
  padding: 10px 6px; text-align: center; display: flex; flex-direction: column; gap: 3px;
}
.tile-val { font-size: 18px; font-weight: 700; }
.tile-lab { font-size: 11px; color: var(--text-soft); }

/* 分组标题 */
.sec-title { font-size: 13px; font-weight: 700; color: var(--text-soft); padding: 2px 2px 0; }

/* 备份与恢复 2×2 网格 */
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.action {
  display: flex; align-items: center; gap: 11px; padding: 14px 12px;
  text-align: left; cursor: pointer;
}
.action:active { transform: scale(0.985); }
.act-ic {
  width: 40px; height: 40px; border-radius: 12px; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center; font-size: 19px; color: #fff;
}
.ic-blue { background: linear-gradient(135deg, #5b8cff, #6c6cff); }
.ic-purple { background: linear-gradient(135deg, #9b6cff, #c06cff); }
.ic-green { background: linear-gradient(135deg, #2fbf71, #25a55a); }
.ic-orange { background: linear-gradient(135deg, #ff9a3c, #ff6b6b); }
.act-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.act-txt b { font-size: 14px; font-weight: 600; }
.act-txt small { font-size: 11px; color: var(--text-soft); }
.act-arrow { font-size: 22px; color: var(--text-soft); flex: 0 0 auto; line-height: 1; }

/* 重置 */
.reset-btn {
  margin-top: 4px; width: 100%; border: 1px solid #c0576b; background: transparent; color: #c0576b;
  border-radius: var(--radius); padding: 13px; font-size: 14px; font-weight: 600;
}
.reset-btn:active { background: rgba(192, 87, 107, 0.08); }
.reset-btn:disabled { opacity: 0.6; }
.reset-hint { text-align: center; font-size: 11px; color: var(--text-soft); margin: 0; }
.bk-file { display: none; }

/* 导出弹窗 */
.seg { display: flex; background: var(--bg-soft); border-radius: 999px; padding: 3px; margin-bottom: 12px; }
.seg-btn {
  flex: 1; border: none; background: transparent; border-radius: 999px;
  padding: 7px 0; font-size: 13px; color: var(--text-soft);
}
.seg-btn.on { background: var(--bg-screen); color: var(--text); font-weight: 600; box-shadow: var(--shadow); }
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
.mini-btn {
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; color: var(--text);
}
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
</style>
