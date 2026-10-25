<template>
  <!-- 备忘录待办提醒：屏幕中间的系统弹窗（提醒人无论选「无」还是联系人都走这里）。
       事件源：memoReminder.service 广播的 eunoia:memo_reminder；
       选了联系人时文案前缀加上对方名字（「XX 提醒你{标题}」）。
       页面在后台时先发浏览器通知，弹窗挂起，回到前台再逐个补弹。 -->
  <Modal :show="!!current" title="待办提醒" width="320px" @close="dismiss">
    <div class="mrd-body">
      <div class="mrd-bell" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 4.2-1.6 5.6-2.3 6.1-.4.3-.2 1 .3 1h15c.5 0 .7-.7.3-1-.7-.5-2.3-1.9-2.3-6.1A5.5 5.5 0 0 0 12 3zM10 17.5a2 2 0 0 0 4 0h-4z"
            fill="currentColor" />
        </svg>
      </div>
      <p class="mrd-text">{{ displayText }}</p>
      <p class="mrd-sub">到点啦，去备忘录看看吧</p>
    </div>
    <template #footer>
      <button class="mrd-btn ghost" @click="dismiss">知道了</button>
      <button class="mrd-btn primary" @click="goMemo">去看看</button>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Modal from './Modal.vue'
import { notify, notificationPermission } from '@/composables/useNotification'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()

/* 待弹出的提醒队列（可见时到达的立即排队；后台到达的先挂起，回前台再并入） */
const queue = ref([])
const current = ref(null)
const pendingHidden = ref([])

/* 展示文案：选了联系人时前缀加上对方名字（「XX 提醒你{标题}」） */
const displayText = computed(() => {
  const c = current.value
  if (!c) return ''
  return c.contactName ? `${c.contactName} ${c.text}` : c.text
})

function pushEvent(detail) {
  if (!detail || !detail.text) return
  if (typeof document !== 'undefined' && document.hidden) {
    /* 页面在后台：不弹中间弹窗（用户看不到），改发浏览器通知；
       同时挂起，等 visibilitychange 回前台时补弹，不漏提醒 */
    pendingHidden.value.push(detail)
    const settings = useSettingsStore()
    const notifyOn = settings.global?.notifications?.browser !== false
    if (notifyOn && notificationPermission() === 'granted') {
      notify('待办提醒', { body: detail.contactName ? `${detail.contactName} ${detail.text}` : detail.text, tag: `memo-reminder-${detail.id || Date.now()}` })
    }
    return
  }
  queue.value.push(detail)
  pump()
}

/* 一次只弹一个，关掉后 250ms 再弹下一个（避免连续提醒叠在一起） */
let pumpTimer = null
function pump() {
  if (current.value || !queue.value.length) return
  clearTimeout(pumpTimer)
  pumpTimer = setTimeout(() => {
    current.value = queue.value.shift() || null
  }, 250)
}

function dismiss() {
  current.value = null
  pump()
}

function goMemo() {
  dismiss()
  router.push('/memo').catch(() => {})
}

function onReminder(e) {
  pushEvent((e && e.detail) || {})
}
function onVisibility() {
  if (document.hidden) return
  if (!pendingHidden.value.length) return
  /* 后台期间攒下的提醒：只补一条浏览器通知已发过，这里把挂起的弹窗合并进队列 */
  queue.value.push(...pendingHidden.value.splice(0))
  pump()
}

onMounted(() => {
  window.addEventListener('eunoia:memo_reminder', onReminder)
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  clearTimeout(pumpTimer)
  window.removeEventListener('eunoia:memo_reminder', onReminder)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
.mrd-body { text-align: center; padding: 6px 4px 2px; }
.mrd-bell { color: var(--accent); display: flex; justify-content: center; margin-bottom: 10px; }
.mrd-text { font-size: 15px; font-weight: 600; color: var(--text); margin: 0 0 6px; line-height: 1.6; word-break: break-word; }
.mrd-sub { font-size: 12px; color: var(--text-soft); margin: 0; }
.mrd-btn { flex: 1; border: none; border-radius: 10px; padding: 12px 8px; font-size: 14px; }
.mrd-btn.ghost { background: var(--bg-soft); color: var(--text); }
.mrd-btn.primary { background: var(--accent); color: #fff; }
</style>
