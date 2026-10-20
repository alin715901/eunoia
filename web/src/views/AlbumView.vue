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
              aria-label="重命名"
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
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { listPhotoWalls, createPhotoWall, updatePhotoWall, deletePhotoWall } from '@/api/album'
import { promptDialog, confirmDialog } from '@/utils/dialog'

const router = useRouter()
const walls = ref([])
const loading = ref(true)
const editing = ref(false)

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
  const name = await promptDialog({ title: '重命名', text: '修改照片墙名称', value: w.name, placeholder: '名称', okText: '保存' })
  if (name === null) return
  await updatePhotoWall(w.id, { name: name.trim() || w.name })
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
</style>
