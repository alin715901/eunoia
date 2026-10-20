<template>
  <div class="ad-page">
    <AppHeader :title="name" back>
      <template #right>
        <button class="ad-op" @click="toggleEdit">{{ editing ? '完成' : '装饰' }}</button>
      </template>
    </AppHeader>

    <PhotoWallCanvas ref="canvasRef" :wall-id="wallId" :editable="editing" />

    <p v-if="!editing" class="ad-hint">左右滑动浏览 · 点右上角「装饰」可添加照片、贴纸与文字</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import PhotoWallCanvas from '@/components/album/PhotoWallCanvas.vue'
import { getPhotoWall } from '@/api/album'

const route = useRoute()
const wallId = Number(route.params.id)
const canvasRef = ref(null)
const name = ref('照片墙')
const editing = ref(false)

onMounted(async () => {
  const w = await getPhotoWall(wallId)
  if (w) name.value = w.name
})

async function toggleEdit() {
  if (editing.value) {
    // 退出装饰：保存最终状态
    editing.value = false
    canvasRef.value && (await canvasRef.value.save())
  } else {
    editing.value = true
  }
}
</script>

<style scoped>
.ad-page { display: flex; flex-direction: column; height: 100%; background: var(--bg-body); }
.ad-op {
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  padding: 5px 14px;
  border-radius: 999px;
}
.ad-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-soft);
  pointer-events: none;
}
</style>
