<template>
  <div class="ad-page">
    <AppHeader :title="name" back @back="onBack">
      <template #right>
        <button class="ad-op" @click="toggleEdit">{{ editing ? '完成' : '装饰' }}</button>
      </template>
    </AppHeader>

    <PhotoWallCanvas ref="canvasRef" :wall-id="wallId" :editable="editing" />
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import PhotoWallCanvas from '@/components/album/PhotoWallCanvas.vue'
import { getPhotoWall } from '@/api/album'
import { confirmDialog } from '@/utils/dialog'

const route = useRoute()
const router = useRouter()
const wallId = Number(route.params.id)
const canvasRef = ref(null)
const name = ref('照片墙')
const editing = ref(false)

async function loadName() {
  const w = await getPhotoWall(wallId)
  if (w) name.value = w.name
}

onMounted(loadName)
onActivated(loadName)

/* ── 未保存离开确认 ──
   装饰中（editing=true）离开页面即弹「当前装饰尚未保存，是否退出？」：
   取消 → 留在原页；保存并退出 → 落库后回相册列表。
   不依赖脏标记——只选中/查看而未拖动同样算未保存，与用户预期一致。
   两条入口分别接管：
   1) 应用内返回键：AppHeader 的 @back，prevent() 后自行确认；
   2) 系统/浏览器返回：onBeforeRouteLeave 驳回导航，确认后再放行。
   退出用 replace 回列表，避免历史栈里残留详情页在下次返回时露头。 */
function needsConfirm() {
  return editing.value
}

async function confirmExit() {
  const ok = await confirmDialog({
    title: '退出装饰',
    text: '当前装饰尚未保存，是否退出？',
    okText: '保存并退出',
    cancelText: '取消'
  })
  if (!ok) return
  canvasRef.value && (await canvasRef.value.save())
  editing.value = false // 退出装饰态：否则重进这面墙时会停留在编辑模式
  router.replace('/album')
}

function onBack(payload) {
  // 统一接管返回：深链进来时历史栈可能很浅，AppHeader 默认的 back 会跑偏到主页
  payload && payload.prevent && payload.prevent()
  if (!needsConfirm()) {
    router.replace('/album')
    return
  }
  confirmExit()
}

/* 系统返回键（浏览器/安卓返回）：驳回后弹确认，取消则留在原页 */
onBeforeRouteLeave((to, from, next) => {
  if (!needsConfirm()) return next()
  next(false)
  confirmExit()
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
</style>
