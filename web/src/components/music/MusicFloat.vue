<template>
    <div
    v-if="store.floating && store.current"
    class="mf"
    :style="posStyle"
    @pointerdown="onDown"
  >
    <span class="mf-cover">
      <img v-if="store.current.cover" :src="store.current.cover" alt="" />
      <AppIcon v-else name="music" :size="16" color="var(--accent)" />
    </span>
    <span class="mf-info">
      <span class="mf-title">{{ store.current.title }}</span>
      <span class="mf-artist">{{ store.current.artist || '未知歌手' }}</span>
    </span>
    <button class="mf-btn" @pointerdown.stop @click.stop="store.toggle()" :aria-label="store.playing ? '暂停' : '播放'">
      <AppIcon :name="store.playing ? 'pause' : 'play'" :size="18" />
    </button>
    <button class="mf-close" @pointerdown.stop @click.stop="close" aria-label="关闭悬浮窗">
      <AppIcon name="close" :size="14" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useMusicStore } from '@/stores/music'

const store = useMusicStore()

const pos = ref({ x: 0, y: 0 }) // 0 = 未初始化，使用默认右下
const dragging = ref(false)
const moved = ref(0)
let start = null

const posStyle = computed(() => {
  if (!pos.value.x && !pos.value.y) {
    return { right: '14px', bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))' }
  }
  return { left: pos.value.x + 'px', top: pos.value.y + 'px' }
})

function onDown(e) {
  dragging.value = true
  moved.value = 0
  start = { x: e.clientX, y: e.clientY, px: pos.value.x, py: pos.value.y }
  const r = e.currentTarget.getBoundingClientRect()
  // 用真实屏幕位置作为基准，避免首次用默认 right/bottom 时换算错乱
  start.px = r.left
  start.py = r.top
  window.addEventListener('pointermove', onMoveWin)
  window.addEventListener('pointerup', onUpWin)
  window.addEventListener('mousemove', onMoveWin)
  window.addEventListener('mouseup', onUpWin)
}
function applyMove(cx, cy) {
  if (!dragging.value || !start) return
  const dx = cx - start.x
  const dy = cy - start.y
  const w = window.innerWidth
  const h = window.innerHeight
  let nx = start.px + dx
  let ny = start.py + dy
  nx = Math.max(4, Math.min(nx, w - 60))
  ny = Math.max(50, Math.min(ny, h - 60))
  pos.value = { x: nx, y: ny }
}
function onMoveWin(e) { applyMove(e.clientX, e.clientY) }
function onUpWin() {
  if (!dragging.value) return
  dragging.value = false
  start = null
  window.removeEventListener('pointermove', onMoveWin)
  window.removeEventListener('pointerup', onUpWin)
  window.removeEventListener('mousemove', onMoveWin)
  window.removeEventListener('mouseup', onUpWin)
}
function close() {
  store.saveSettings({ floating: false })
}
</script>

<style scoped>
.mf {
  position: fixed; z-index: 90;
  display: flex; align-items: center; gap: 8px;
  max-width: 240px; padding: 6px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-screen) 96%, transparent);
  backdrop-filter: blur(14px);
  box-shadow: 0 6px 22px rgba(0,0,0,0.18);
  border: 1px solid var(--border);
  cursor: grab; touch-action: none; user-select: none;
}
.mf:active { cursor: grabbing; }
.mf-cover {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; overflow: hidden;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
}
.mf-cover img { width: 100%; height: 100%; object-fit: cover; }
.mf-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mf-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-artist { font-size: 10px; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-btn, .mf-close {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--text); padding: 4px;
}
.mf-btn { color: var(--accent); }
.mf-close { color: var(--text-soft); }
</style>
