<template>
  <div class="md-page">
    <AppHeader title="相册" back back-to="/">
      <template #right>
        <button v-if="!editing" class="md-op-text" @click="editing = true">编辑</button>
        <button v-else class="md-op-text" @click="editing = false">完成</button>
      </template>
    </AppHeader>

    <div class="md-body">
      <p v-if="loading" class="md-tip">加载中…</p>
      <template v-else>
        <div class="al-grid">
          <div
            v-for="w in walls"
            :key="w.id"
            class="al-cell"
            @click="onCell(w)"
          >
            <div class="al-cover" :style="coverStyle(w)">
              <img v-if="w.cover" :src="w.cover" class="al-img" alt="" />
              <AppIcon v-else name="image" :size="34" color="rgba(255,255,255,0.85)" />
            </div>
            <div class="al-name">{{ w.name }}</div>
            <button
              v-if="editing"
              class="al-del"
              @click.stop="removeWall(w)"
              aria-label="删除"
            ><AppIcon name="close" :size="13" color="#fff" /></button>
            <button
              v-if="editing"
              class="al-edit"
              @click.stop="renameWall(w)"
              aria-label="编辑"
            ><AppIcon name="edit" :size="13" color="#fff" /></button>
          </div>

          <!-- 新建入口（非编辑态在网格末尾显示一个 + 卡片） -->
          <button v-if="!editing" class="al-cell al-add" @click="startCreate">
            <AppIcon name="plus" :size="30" color="var(--text-soft)" />
            <div class="al-name">新建照片墙</div>
          </button>
        </div>

        <p v-if="!walls.length && !editing" class="md-empty">
          还没有照片墙<br /><span class="md-empty-sub">点右上角「＋」开始记录</span>
        </p>
      </template>
    </div>

    <!-- 编辑照片墙：名称 + 封面（手动换过的封面会被钉住，不被自动封面覆盖） -->
    <div v-if="editWall" class="ew-mask" @click.self="editWall = null">
      <div class="ew-dlg">
        <h3 class="ew-title">编辑照片墙</h3>
        <div class="ew-cover" :style="coverStyle(editWall)">
          <img v-if="editWall.cover" :src="editWall.cover" class="ew-cover-img" alt="" />
          <AppIcon v-else name="image" :size="30" color="rgba(255,255,255,0.85)" />
        </div>
        <div class="ew-ops">
          <button class="ew-btn" @click="coverFileEl && coverFileEl.click()">更换封面</button>
          <button v-if="editWall.cover_manual" class="ew-btn ghost" @click="clearCover">移除封面</button>
        </div>
        <input v-model="editName" class="ew-input" placeholder="名称" maxlength="30" @keyup.enter="saveEditWall" />
        <div class="ew-actions">
          <button class="ew-act" @click="editWall = null">取消</button>
          <button class="ew-act primary" @click="saveEditWall">保存</button>
        </div>
      </div>
    </div>
    <input ref="coverFileEl" type="file" accept="image/*" hidden @change="onCoverPick" />
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { listPhotoWalls, createPhotoWall, updatePhotoWall, deletePhotoWall } from '@/api/album'
import { uploadFile } from '@/api/settings'
import { compressImage } from '@/utils/image'
import { promptDialog, confirmDialog } from '@/utils/dialog'

const router = useRouter()
const walls = ref([])
const loading = ref(true)
const editing = ref(false)
/* 编辑弹窗：名称 + 封面 */
const editWall = ref(null)
const editName = ref('')
const coverFileEl = ref(null)

const GRADS = [
  'linear-gradient(135deg,#f6d5a7,#f3a683)',
  'linear-gradient(135deg,#a8c0ff,#c2a8ff)',
  'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
  'linear-gradient(135deg,#c1f0d8,#a8e6cf)',
  'linear-gradient(135deg,#ffe1a8,#ffb6a8)'
]

function coverStyle(w) {
  if (w.cover) return {}
  const i = (Number(w.id) || 0) % GRADS.length
  return { background: GRADS[i] }
}

async function load() {
  loading.value = true
  try {
    walls.value = await listPhotoWalls()
  } finally {
    loading.value = false
  }
}

onMounted(load)
// keep-alive 包裹：从详情页返回时也要刷新列表
onActivated(load)

async function startCreate() {
  const name = await promptDialog({ title: '新建照片墙', text: '给照片墙起个名字', placeholder: '如：日常碎片', okText: '创建' })
  if (name === null) return
  const w = await createPhotoWall({ name: name.trim() || '未命名照片墙' })
  router.push(`/album/${w.id}`)
}

async function renameWall(w) {
  // 编辑弹窗：可同时改名称与封面（打开时以当前墙数据初始化）
  editWall.value = { ...w }
  editName.value = w.name || ''
}

function clearCover() {
  // 移除手动封面：回到自动封面（装饰保存时取最靠左的图片，无图则渐变）
  if (!editWall.value) return
  editWall.value = { ...editWall.value, cover: '', cover_manual: 0 }
}

async function onCoverPick(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file || !editWall.value) return
  try {
    const small = await compressImage(file)
    const res = await uploadFile(small)
    editWall.value = { ...editWall.value, cover: res.path, cover_manual: 1 }
  } catch (err) {
    console.error('[album] 封面上传失败', err)
  }
}

async function saveEditWall() {
  const w = editWall.value
  if (!w) return
  editWall.value = null
  const name = (editName.value || '').trim()
  await updatePhotoWall(w.id, {
    name: name || w.name,
    cover: w.cover || '',
    cover_manual: w.cover_manual ? 1 : 0
  })
  await load()
}

async function removeWall(w) {
  const ok = await confirmDialog({ title: '删除照片墙', text: `确定删除「${w.name}」？墙内所有照片与装饰会一并清除。`, okText: '删除', danger: true })
  if (!ok) return
  await deletePhotoWall(w.id)
  await load()
}

function onCell(w) {
  if (editing.value) return
  router.push(`/album/${w.id}`)
}
</script>

<style scoped>
.md-page { display: flex; flex-direction: column; height: 100%; background: var(--bg-body); }
.md-body { flex: 1; overflow-y: auto; padding: 12px; -webkit-overflow-scrolling: touch; }
.md-tip, .md-empty { text-align: center; color: var(--text-soft); margin-top: 40%; font-size: 14px; line-height: 1.8; }
.md-empty-sub { font-size: 12px; color: var(--text-soft); }

.md-op-text { border: none; background: transparent; color: var(--accent); font-size: 14px; padding: 0 6px; }

.al-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.al-cell {
  position: relative;
  border: none;
  padding: 0;
  background: var(--bg-screen);
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: var(--shadow);
  cursor: pointer;
  text-align: left;
}
.al-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--bg-soft);
}
.al-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.al-name {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.al-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  box-shadow: none;
  border: 1.5px dashed var(--border);
  background: transparent;
}
.al-add .al-name { padding: 0; color: var(--text-soft); }
.al-del, .al-edit {
  position: absolute;
  top: 6px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.al-del { right: 6px; background: rgba(0,0,0,0.55); }
.al-edit { right: 38px; background: var(--accent); }

/* ── 编辑照片墙弹窗（名称 + 封面）── */
.ew-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.38);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.ew-dlg {
  width: 100%;
  max-width: 300px;
  background: var(--bg-screen);
  border-radius: var(--radius-lg);
  padding: 20px 18px 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
  text-align: center;
}
.ew-title {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-serif);
  color: var(--text);
}
.ew-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-soft);
}
.ew-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ew-ops { display: flex; gap: 8px; margin: 10px 0 14px; }
.ew-btn {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.ew-btn.ghost { background: transparent; color: var(--text-soft); }
.ew-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  padding: 6px 2px 10px;
  font-size: 15px;
  color: var(--text);
  text-align: center;
  margin: 0 0 16px;
  outline: none;
}
.ew-input:focus { border-bottom-color: var(--accent); }
.ew-actions { display: flex; gap: 10px; }
.ew-act {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 10px 0;
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
}
.ew-act.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
</style>
