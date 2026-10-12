<template>
  <div class="md-page">
    <AppHeader title="影院" back>
      <template #right>
        <button class="md-op" @click="openAdd" aria-label="添加"><AppIcon name="plus" :size="22" /></button>
      </template>
    </AppHeader>

    <div class="md-body">
      <div class="md-summary">
        <span class="md-sum-ic"><AppIcon name="film" :size="26" color="var(--accent)" /></span>
        <span class="md-sum-main">
          <span class="md-sum-title">想看 {{ want.length }} 部 · 已看 {{ watched.length }} 部</span>
          <span class="md-sum-sub">一起看过的，和想一起看的</span>
        </span>
      </div>

      <div class="md-seg">
        <button class="md-seg-btn" :class="{ on: tab === 'want' }" @click="tab = 'want'">想看</button>
        <button class="md-seg-btn" :class="{ on: tab === 'watched' }" @click="tab = 'watched'">已看</button>
      </div>

      <p v-if="loading" class="md-tip">加载中…</p>
      <template v-else>
        <div v-for="m in list" :key="m.id" class="md-card">
          <span class="ci-cover">
            <img v-if="m.body" :src="m.body" alt="" />
            <AppIcon v-else name="film" :size="18" color="var(--accent)" />
          </span>
          <div class="md-card-main" @click="openEdit(m)">
            <div class="md-title">{{ m.title }}</div>
            <div class="md-sub">
              <span v-if="m.extra?.status === 'watched'" class="ci-stars">
                <i v-for="n in 5" :key="n" :class="{ on: n <= (m.extra?.rating || 0) }">★</i>
              </span>
              <span v-else>想看</span>
              <span v-if="m.extra?.date"> · {{ m.extra.date }}</span>
            </div>
            <div class="md-text" v-if="m.extra?.note">{{ m.extra.note }}</div>
          </div>
          <div class="md-ops">
            <button class="md-op" @click="toggle(m)" :aria-label="m.extra?.status === 'watched' ? '标记想看' : '标记已看'">
              <AppIcon :name="m.extra?.status === 'watched' ? 'heart' : 'check'" :size="16" color="var(--accent)" />
            </button>
            <button class="md-op" @click="remove(m)" aria-label="删除"><AppIcon name="trash" :size="16" color="#c0576b" /></button>
          </div>
        </div>
        <p v-if="!list.length" class="md-empty">
          {{ tab === 'want' ? '还没有想看的电影' : '还没有看过的电影' }}<br />
          <span class="md-empty-sub">点右上角「＋」添加一部</span>
        </p>
      </template>
    </div>

    <button class="md-fab" @click="openAdd" aria-label="添加"><AppIcon name="plus" :size="24" color="#fff" /></button>
    <input ref="fileEl" type="file" accept="image/*" hidden @change="onPick" />

    <div v-if="show" class="md-mask" @click.self="close">
      <div class="md-sheet">
        <h3 class="md-sheet-title">{{ editing ? '编辑' : '添加影片' }}</h3>
        <div class="md-fld">
          <span class="md-fld-label">片名</span>
          <input v-model="form.title" class="md-input" placeholder="例如：你的名字" maxlength="40" />
        </div>
        <div class="md-fld">
          <span class="md-fld-label">状态</span>
          <div class="md-chips">
            <button class="md-chip" :class="{ on: form.status === 'want' }" @click="form.status = 'want'">想看</button>
            <button class="md-chip" :class="{ on: form.status === 'watched' }" @click="form.status = 'watched'">已看</button>
          </div>
        </div>
        <div class="md-fld" v-if="form.status === 'watched'">
          <span class="md-fld-label">评分</span>
          <div class="ci-pick">
            <i v-for="n in 5" :key="n" :class="{ on: n <= form.rating }" @click="form.rating = n">★</i>
          </div>
        </div>
        <div class="md-fld" v-if="form.status === 'watched'">
          <span class="md-fld-label">观看日期（可选）</span>
          <input v-model="form.date" class="md-input" type="date" />
        </div>
        <div class="md-fld">
          <span class="md-fld-label">短评（可选）</span>
          <textarea v-model="form.note" class="md-textarea" placeholder="看完想说的话…" />
        </div>
        <div class="md-fld">
          <span class="md-fld-label">海报（可选）</span>
          <button class="ci-pick-btn" @click="fileEl?.click()">{{ form.poster ? '已选择海报' : '选择海报图片' }}</button>
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
import { uploadFile } from '@/api/settings'
import { compressImage } from '@/utils/image'

const { items, loading, load, add, update, remove: removeItem } = useItems('cinema')
const toast = useNotificationsStore()
const tab = ref('want')
const show = ref(false)
const editing = ref(null)
const fileEl = ref(null)
const form = reactive({ title: '', status: 'want', rating: 0, date: '', note: '', poster: '' })

const want = computed(() => items.value.filter((m) => m.extra?.status !== 'watched'))
const watched = computed(() => items.value.filter((m) => m.extra?.status === 'watched'))
const list = computed(() => (tab.value === 'want' ? want.value : watched.value))

async function onPick(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const res = await uploadFile(await compressImage(f))
    form.poster = res?.path || ''
  } catch (err) {
    toast.pushToast({ title: '上传失败', text: err.message })
  }
}
function openAdd() {
  editing.value = null
  Object.assign(form, { title: '', status: tab.value === 'watched' ? 'watched' : 'want', rating: 0, date: '', note: '', poster: '' })
  show.value = true
}
function openEdit(m) {
  editing.value = m
  Object.assign(form, {
    title: m.title || '',
    status: m.extra?.status || 'want',
    rating: Number(m.extra?.rating || 0),
    date: m.extra?.date || '',
    note: m.extra?.note || '',
    poster: m.body || ''
  })
  show.value = true
}
function close() {
  show.value = false
}
async function save() {
  if (!form.title.trim()) {
    toast.pushToast({ title: '填一下片名' })
    return
  }
  const payload = {
    title: form.title.trim(),
    body: form.poster,
    extra: { status: form.status, rating: form.rating, date: form.date, note: form.note.trim() }
  }
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
async function toggle(m) {
  const to = m.extra?.status === 'watched' ? 'want' : 'watched'
  await update(m.id, { extra: { ...m.extra, status: to } })
  toast.pushToast({ title: to === 'watched' ? '已标记为看过' : '已移回想看' })
}
async function remove(m) {
  if (!(await confirmDialog({ title: '删除这部影片？', danger: true }))) return
  await removeItem(m.id)
  toast.pushToast({ title: '已删除' })
}

onMounted(load)
</script>

<style scoped>
.ci-cover {
  flex: 0 0 auto; width: 42px; height: 56px; border-radius: 8px; overflow: hidden;
  background: var(--bg); display: flex; align-items: center; justify-content: center;
}
.ci-cover img { width: 100%; height: 100%; object-fit: cover; }
.ci-stars i, .ci-pick i { font-style: normal; color: var(--border); font-size: 14px; }
.ci-stars i.on { color: #e8b04b; }
.ci-pick { display: flex; gap: 6px; font-size: 22px; }
.ci-pick i { cursor: pointer; }
.ci-pick i.on { color: #e8b04b; }
.ci-pick-btn { width: 100%; padding: 10px 0; font-size: 14px; border-radius: 12px; border: 1px dashed var(--border); background: transparent; color: var(--text-soft); }
</style>
