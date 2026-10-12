<template>
  <div class="md-page">
    <AppHeader title="经期" back>
      <template #right>
        <button class="md-op" @click="openAdd" aria-label="添加记录"><AppIcon name="plus" :size="22" /></button>
      </template>
    </AppHeader>

    <div class="md-body">
      <div class="md-summary">
        <span class="md-sum-ic"><AppIcon name="drop" :size="26" color="#e5989b" /></span>
        <span class="md-sum-main">
          <span class="md-sum-title">{{ predictText }}</span>
          <span class="md-sum-sub">平均周期 {{ avgCycle || '--' }} 天 · 平均持续 {{ avgLen || '--' }} 天</span>
        </span>
      </div>

      <p v-if="loading" class="md-tip">加载中…</p>
      <template v-else>
        <div v-for="p in items" :key="p.id" class="md-card">
          <div class="md-card-main">
            <div class="md-title">{{ p.extra?.start }} <span v-if="p.extra?.end">→ {{ p.extra.end }}</span></div>
            <div class="md-sub">
              持续 {{ lenOf(p) }} 天<template v-if="p.body"> · {{ p.body }}</template>
            </div>
          </div>
          <div class="md-ops">
            <button class="md-op" @click="openEdit(p)" aria-label="编辑"><AppIcon name="edit" :size="16" color="var(--text-soft)" /></button>
            <button class="md-op" @click="remove(p)" aria-label="删除"><AppIcon name="trash" :size="16" color="#c0576b" /></button>
          </div>
        </div>
        <p v-if="!items.length" class="md-empty">还没有记录<br /><span class="md-empty-sub">点右上角「＋」记录一次</span></p>
      </template>
    </div>

    <div v-if="show" class="md-mask" @click.self="close">
      <div class="md-sheet">
        <h3 class="md-sheet-title">{{ editing ? '编辑记录' : '新增记录' }}</h3>
        <div class="md-fld">
          <span class="md-fld-label">开始日期</span>
          <input v-model="form.start" class="md-input" type="date" />
        </div>
        <div class="md-fld">
          <span class="md-fld-label">结束日期（可选）</span>
          <input v-model="form.end" class="md-input" type="date" />
        </div>
        <div class="md-fld">
          <span class="md-fld-label">备注（可选）</span>
          <textarea v-model="form.note" class="md-textarea" placeholder="身体状态、心情…" />
        </div>
        <div class="md-actions">
          <button class="md-btn ghost" @click="close">取消</button>
          <button class="md-btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'
import { confirmDialog } from '@/utils/dialog'

const { items, loading, load, add, update, remove: removeItem } = useItems('period')
const toast = useNotificationsStore()
const show = ref(false)
const editing = ref(null)
const form = reactive({ start: today(), end: '', note: '' })

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toDate(s) {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
function lenOf(p) {
  const a = toDate(p.extra?.start)
  const b = toDate(p.extra?.end)
  if (!a) return 0
  if (!b) return 1
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}
/* 按开始日期升序：周期 = 相邻两次开始日期间隔 */
const sorted = computed(() =>
  items.value.slice().sort((x, y) => String(x.extra?.start || '').localeCompare(String(y.extra?.start || '')))
)
const avgCycle = computed(() => {
  const list = sorted.value
  if (list.length < 2) return 0
  let sum = 0
  let n = 0
  for (let i = 1; i < list.length; i++) {
    const a = toDate(list[i - 1].extra?.start)
    const b = toDate(list[i].extra?.start)
    if (a && b) {
      sum += Math.round((b - a) / 86400000)
      n++
    }
  }
  return n ? Math.round(sum / n) : 0
})
const avgLen = computed(() => {
  const list = items.value.filter((p) => p.extra?.end)
  if (!list.length) return 0
  return Math.round(list.reduce((s, p) => s + lenOf(p), 0) / list.length)
})
const predictText = computed(() => {
  const last = sorted.value[sorted.value.length - 1]
  if (!last) return '记录后为你预测'
  const start = toDate(last.extra?.start)
  if (!start) return '记录后为你预测'
  const cycle = avgCycle.value || 28
  const next = new Date(start.getTime() + cycle * 86400000)
  const diff = Math.round((next - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000)
  if (diff === 0) return '预测今天是预计开始日'
  if (diff > 0) return `预计 ${diff} 天后（${fmt(next)}）`
  return `已过预计日 ${Math.abs(diff)} 天（${fmt(next)}）`
})
function fmt(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function openAdd() {
  editing.value = null
  Object.assign(form, { start: today(), end: '', note: '' })
  show.value = true
}
function openEdit(p) {
  editing.value = p
  Object.assign(form, { start: p.extra?.start || today(), end: p.extra?.end || '', note: p.body || '' })
  show.value = true
}
function close() {
  show.value = false
}
async function save() {
  if (!form.start) {
    toast.pushToast({ title: '请选择开始日期' })
    return
  }
  const payload = { title: form.start, body: form.note.trim(), extra: { start: form.start, end: form.end } }
  const id = editing.value?.id
  close()
  try {
    if (id) await update(id, payload)
    else await add(payload)
    toast.pushToast({ title: '已保存' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function remove(p) {
  if (!(await confirmDialog({ title: '删除这条记录？', danger: true }))) return
  await removeItem(p.id)
  toast.pushToast({ title: '已删除' })
}

onMounted(load)
</script>
