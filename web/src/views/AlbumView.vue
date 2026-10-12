<template>
  <div class="md-page">
    <AppHeader title="相册" back>
      <template #right>
        <button class="md-op" @click="pick" aria-label="添加照片"><AppIcon name="plus" :size="22" /></button>
      </template>
    </AppHeader>

    <div class="md-body">
      <p v-if="loading" class="md-tip">加载中…</p>
      <template v-else>
        <div class="al-grid">
          <div v-for="p in items" :key="p.id" class="al-cell" @click="preview = p">
            <img :src="p.body" class="al-img" alt="" />
            <button class="al-del" @click.stop="remove(p)" aria-label="删除"><AppIcon name="close" :size="12" color="#fff" /></button>
          </div>
        </div>
        <p v-if="!items.length" class="md-empty">相册还是空的<br /><span class="md-empty-sub">点右上角「＋」上传照片</span></p>
      </template>
    </div>

    <button class="md-fab" @click="pick" aria-label="添加照片"><AppIcon name="plus" :size="24" color="#fff" /></button>
    <input ref="fileEl" type="file" accept="image/*" multiple hidden @change="onPick" />

    <!-- 大图预览 -->
    <div v-if="preview" class="al-mask" @click="preview = null">
      <img :src="preview.body" class="al-big" alt="" />
      <p class="al-cap">{{ preview.title }}</p>
    </div>
    <p v-if="uploading" class="al-up">上传中…</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'
import { confirmDialog } from '@/utils/dialog'
import { uploadFile } from '@/api/settings'
import { compressImage } from '@/utils/image'

const { items, loading, load, add, remove: removeItem } = useItems('album')
const toast = useNotificationsStore()
const fileEl = ref(null)
const preview = ref(null)
const uploading = ref(false)

function pick() {
  fileEl.value?.click()
}
async function onPick(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (!files.length) return
  uploading.value = true
  Promise.all(
    files.map(async (f) => {
      const small = await compressImage(f)
      const res = await uploadFile(small)
      const path = res?.path || ''
      if (!path) throw new Error('上传失败')
      await add({ title: '', body: path, extra: { name: f.name } })
    })
  )
    .then(() => toast.pushToast({ title: '已添加', text: `${files.length} 张照片` }))
    .catch((err) => toast.pushToast({ title: '失败', text: err.message }))
    .finally(() => {
      uploading.value = false
    })
}
async function remove(p) {
  if (!(await confirmDialog({ title: '删除这张照片？', danger: true }))) return
  await removeItem(p.id)
  toast.pushToast({ title: '已删除' })
}

onMounted(load)
</script>

<style scoped>
.al-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.al-cell { position: relative; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden; background: var(--bg-soft); }
.al-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.al-del {
  position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%;
  border: none; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 0;
}
.al-mask {
  position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.9);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.al-big { max-width: 100%; max-height: 82vh; object-fit: contain; }
.al-cap { color: #fff; font-size: 13px; margin-top: 12px; opacity: 0.85; }
.al-up { position: fixed; left: 0; right: 0; bottom: 24px; text-align: center; color: var(--text-soft); font-size: 13px; }
</style>
