<template>
  <div class="toast-layer">
    <div
      v-for="t in toasts"
      :key="t.id"
      class="toast anim-toast"
      :class="['toast-' + t.type, { 'toast-clickable': t.route }]"
      :style="toastStyle(t)"
      @pointerdown="onDown($event, t)"
      @pointermove="onMove($event, t)"
      @pointerup="onUp($event, t)"
      @pointercancel="onUp($event, t)"
      @click="onTap(t)"
    >
      <!-- 头像仅消息类弹窗显示；系统轻提示（已保存/已清空等）不带图标 -->
      <AppAvatar
        v-if="t.type === 'message'"
        :name="t.title"
        :avatar="t.avatar || ''"
        :size="40"
        class="toast-ava"
      />
      <div class="toast-body">
        <div class="toast-title">{{ t.title }}</div>
        <div v-if="t.text" class="toast-text">{{ t.text }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useNotificationsStore } from '@/stores/notifications'

const store = useNotificationsStore()
const { toasts } = storeToRefs(store)
const router = useRouter()

/* 上滑取消：记录每个弹窗的拖拽状态（位移、是否拖拽中、起点、最大位移） */
const drag = reactive({})

function onDown(e, t) {
  drag[t.id] = { y: 0, active: true, sx: e.clientY, sy: e.clientX, max: 0 }
}
function onMove(e, t) {
  const d = drag[t.id]
  if (!d || !d.active) return
  const dy = e.clientY - d.sx
  const dx = e.clientX - d.sy
  d.max = Math.max(d.max, Math.abs(dx) + Math.abs(dy))
  // 只允许上滑（dy<0），下滑保持原位
  d.y = Math.min(0, dy)
}
function onUp(e, t) {
  const d = drag[t.id]
  if (!d || !d.active) return
  d.active = false
  // 上滑超过 50px → 取消该弹窗（不跳转）；否则回弹归位
  if (d.y <= -50) {
    store.removeToast(t.id)
    delete drag[t.id]
  } else {
    d.y = 0
    setTimeout(() => {
      const cur = drag[t.id]
      if (cur && !cur.active) delete drag[t.id]
    }, 260)
  }
}
function onTap(t) {
  // 发生过明显滑动（无论方向）→ 视为手势，不触发点击跳转
  const d = drag[t.id]
  if (d && d.max > 12) return
  if (!t.route) return
  // 先移除再跳转：避免弹窗（z-index 999）盖住随后弹出的通话界面
  store.removeToast(t.id)
  router.push(t.route)
}

function toastStyle(t) {
  const d = drag[t.id]
  const y = d ? d.y : 0
  // 上滑时渐隐，最小 0.3 避免突然消失
  const op = d ? Math.max(0.3, 1 + y / 160) : 1
  const trans = d && d.active ? 'none' : ''
  return { transform: `translateY(${y}px)`, opacity: op, transition: trans }
}
</script>

<style scoped>
.toast-layer {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 999;
}
.toast {
  pointer-events: auto;
  /* 关闭浏览器默认手势，保证上滑取消可靠触发、页面不被连带滚动 */
  touch-action: none;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 250px;
  /* 消息弹窗拉宽：尽量占满手机壳宽度，长内容更好读 */
  width: 100%;
  max-width: 402px;
  /* 跟随主题：深色模式下用深色卡背景，浅色模式下用浅色卡背景 */
  background: color-mix(in srgb, var(--bg-screen) 97%, transparent);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 11px 15px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  animation: toast-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-clickable { cursor: pointer; }
.toast-ava { flex: 0 0 auto; }
.toast-body { min-width: 0; flex: 1 1 auto; }
.toast-title { font-size: 14px; font-weight: 700; }
.toast-text {
  font-size: 13px;
  color: var(--text-soft);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 系统轻提示（无头像）：文字居左，宽度收敛 */
.toast:not(.toast-message) { min-width: 0; width: auto; max-width: 320px; }
@keyframes toast-slide-in {
  from { opacity: 0; transform: translateY(-16px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
