import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  sendCompanionInvite, respondCompanionInvite, cancelCompanionInvite, getCompanionInvites
} from '@/api/companion'
import { useNotificationsStore } from '@/stores/notifications'

const ACTIVITIES = [
  { key: 'eat', name: '吃饭', icon: 'meal' },
  { key: 'sleep', name: '睡觉', icon: 'sleep' },
  { key: 'work', name: '工作', icon: 'work' },
  { key: 'study', name: '学习', icon: 'study' },
  { key: 'train', name: '锻炼', icon: 'train' },
  { key: 'fish', name: '摸鱼', icon: 'fish' }
]
const DURATIONS = [15, 30, 45, 60]

const ACTIVE_KEY = 'companion_active_v1'
const HIST_KEY = 'companion_history_v1'

/* 陪伴：进行中的会话 + 等待响应的邀请 + 收到的邀请 + 历史记录。
   会话与计时放在全局 store（任意页面接受邀请都能开始计时），localStorage 持久化。 */
export const useCompanionStore = defineStore('companion', () => {
  /* ═══ 会话 ═══ */
  const active = ref(null)
  const history = ref([])
  const justDone = ref(false)
  const nowTs = ref(Date.now())
  let timer = null

  /* ═══ 邀请 ═══ */
  const pendingInvite = ref(null)   // 我发出的、等待 TA 响应的邀请
  const incoming = ref([])          // TA 发来的、待我处理的邀请

  const actMeta = computed(() => ACTIVITIES.find((a) => a.key === active.value?.key) || null)

  function persistActive() {
    try {
      if (active.value) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active.value))
      else localStorage.removeItem(ACTIVE_KEY)
    } catch (e) { /* ignore */ }
  }
  function persistHistory() {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(history.value)) } catch (e) { /* ignore */ }
  }
  function persistPending() {
    try {
      if (pendingInvite.value) localStorage.setItem('companion_pending_v1', JSON.stringify(pendingInvite.value))
      else localStorage.removeItem('companion_pending_v1')
    } catch (e) { /* ignore */ }
  }

  /* ═══ 计时 ═══ */
  function startTick() {
    stopTick()
    timer = setInterval(() => {
      nowTs.value = Date.now()
      if (active.value && active.value.mode === 'down' && !active.value.paused && remainingSec() <= 0) {
        complete(active.value.durationSec)
      }
    }, 500)
  }
  function stopTick() { if (timer) { clearInterval(timer); timer = null } }

  function elapsedSec() {
    const a = active.value
    if (!a) return 0
    const end = a.paused ? a.pausedAt : nowTs.value
    return Math.max(0, Math.floor((end - a.startedAt - (a.pausedAccum || 0)) / 1000))
  }
  function remainingSec() {
    const a = active.value
    if (!a) return 0
    return Math.max(0, a.durationSec - elapsedSec())
  }
  const timerText = computed(() => {
    const s = active.value?.mode === 'down' ? remainingSec() : elapsedSec()
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const p = (n) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
  })
  function fmtDur(s) {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    if (h > 0) return m ? `${h}小时${m}分钟` : `${h}小时`
    return `${Math.max(1, m)}分钟`
  }

  /* ═══ 会话控制 ═══ */
  function startSession(sess) {
    active.value = {
      key: sess.key,
      name: sess.name,
      icon: sess.icon || 'archive',
      mateId: sess.mateId || null,
      mode: sess.mode === 'down' ? 'down' : 'up',
      durationSec: Math.max(0, Number(sess.durationSec) || 0),
      startedAt: Date.now(),
      paused: false,
      pausedAt: 0,
      pausedAccum: 0
    }
    persistActive()
    nowTs.value = Date.now()
    startTick()
  }
  function togglePause() {
    const a = active.value
    if (!a) return
    if (a.paused) {
      a.pausedAccum = (a.pausedAccum || 0) + (Date.now() - a.pausedAt)
      a.paused = false
    } else {
      a.pausedAt = Date.now()
      a.paused = true
    }
    persistActive()
  }
  function complete(sec) {
    const a = active.value
    if (!a) return
    const d = new Date()
    history.value.unshift({
      id: Date.now(),
      key: a.key,
      name: a.name,
      icon: a.icon,
      mateId: a.mateId,
      mateName: a.mateName || '',
      durationSec: Math.max(1, sec),
      dateText: `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    })
    history.value = history.value.slice(0, 50)
    persistHistory()
    active.value = null
    persistActive()
    justDone.value = true
    setTimeout(() => { justDone.value = false }, 1500)
    const toast = useNotificationsStore()
    toast.pushToast({ title: '陪伴完成', text: `一起${a.name} ${fmtDur(Math.max(1, sec))}` })
  }

  /* ═══ 邀请流程 ═══ */
  async function invite(contactId, payload) {
    const r = await sendCompanionInvite({ contactId, ...payload })
    const act = ACTIVITIES.find((a) => a.key === payload.activity)
    pendingInvite.value = {
      id: r.id,
      contactId,
      activity: payload.activity,
      name: act?.name || '陪伴',
      icon: act?.icon || 'archive',
      mode: payload.mode,
      durationSec: payload.durationSec || 0
    }
    persistPending()
    return r
  }
  async function cancelInvite() {
    const p = pendingInvite.value
    if (!p) return
    try { await cancelCompanionInvite(p.id) } catch (e) { /* 状态由后端兜底过期 */ }
    pendingInvite.value = null
    persistPending()
  }
  /* 我接受/拒绝 TA 的邀请（聊天卡片、陪伴页共用） */
  async function respond(inviteId, accept) {
    const inv = incoming.value.find((i) => Number(i.id) === Number(inviteId))
    const r = await respondCompanionInvite(inviteId, accept)
    removeIncoming(inviteId)
    if (accept) {
      startSessionFromInvite({ ...(inv || {}), id: inviteId })
    }
    return r
  }
  function startSessionFromInvite(inv) {
    const act = ACTIVITIES.find((a) => a.key === inv.activity)
    startSession({
      key: inv.activity,
      name: act?.name || inv.name || '陪伴',
      icon: act?.icon || 'archive',
      mateId: inv.contact_id ?? inv.contactId,
      mateName: inv.contact_name || '',
      mode: inv.mode,
      durationSec: inv.duration_sec ?? inv.durationSec ?? 0
    })
  }
  function removeIncoming(id) {
    incoming.value = incoming.value.filter((i) => Number(i.id) !== Number(id))
  }

  /* ═══ SSE 事件（useSSE 里分发过来） ═══ */
  function onSSE(data) {
    const toast = useNotificationsStore()
    if (data.type === 'incoming') {
      const inv = data.invite || {}
      incoming.value = [...incoming.value.filter((i) => Number(i.id) !== Number(inv.id)), inv]
      const act = ACTIVITIES.find((a) => a.key === inv.activity)
      toast.pushToast({
        title: `${inv.contact_name || '对方'}邀请你陪伴`,
        text: `一起${act?.name || '陪伴'}${inv.mode === 'down' ? `（倒计时 ${Math.round((inv.duration_sec || 0) / 60)} 分钟）` : ''}`,
        type: 'message',
        duration: 5000,
        route: '/archive'
      })
    } else if (data.type === 'responded' || data.type === 'accepted' || data.type === 'rejected') {
      const inv = data.invite || {}
      if (pendingInvite.value && Number(pendingInvite.value.id) === Number(inv.id)) {
        const mine = pendingInvite.value
        pendingInvite.value = null
        persistPending()
        if (inv.status === 'accepted') {
          startSessionFromInvite({ ...inv, contactId: inv.contact_id ?? mine.contactId })
          toast.pushToast({ title: '邀请已接受', text: `和 ${inv.contact_name || 'TA'} 开始一起${inv.name || '陪伴'}吧` })
        } else {
          toast.pushToast({ title: '邀请被拒绝', text: `${inv.contact_name || 'TA'} 这次婉拒了你的邀请` })
        }
      }
    } else if (data.type === 'cancelled' || data.type === 'expired') {
      removeIncoming(data.invite?.id)
      if (data.type === 'expired' && data.invite?.from_side === 'contact') {
        toast.pushToast({ title: '邀请已过期', text: `${data.invite.contact_name || 'TA'} 的陪伴邀请没有回应` })
      }
    }
  }

  /* ═══ 陪伴记录管理（本地持久化） ═══ */
  function clearHistory() {
    history.value = []
    persistHistory()
  }
  function removeHistory(id) {
    history.value = history.value.filter((h) => h.id !== id)
    persistHistory()
  }

  /* ═══ 初始化：本地持久化恢复 + 服务端待处理邀请对齐 ═══ */
  async function init() {
    try {
      history.value = JSON.parse(localStorage.getItem(HIST_KEY) || '[]')
    } catch (e) { history.value = [] }
    try {
      active.value = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null')
    } catch (e) { active.value = null }
    try {
      pendingInvite.value = JSON.parse(localStorage.getItem('companion_pending_v1') || 'null')
    } catch (e) { pendingInvite.value = null }
    /* 离开页面期间倒计时已到点：自动完成 */
    if (active.value && active.value.mode === 'down' && !active.value.paused && remainingSec() <= 0) {
      complete(active.value.durationSec)
    }
    nowTs.value = Date.now()
    if (active.value) startTick()
    /* 与服务端对齐：本地等待中的邀请可能已被响应/过期 */
    try {
      const list = await getCompanionInvites(50)
      const arr = Array.isArray(list) ? list : list?.data || []
      incoming.value = arr.filter((i) => i.status === 'pending' && i.from_side === 'contact')
      if (pendingInvite.value) {
        const mine = arr.find((i) => Number(i.id) === Number(pendingInvite.value.id))
        if (!mine || mine.status !== 'pending') {
          if (mine && mine.status === 'accepted') {
            startSessionFromInvite(mine)
            const toast = useNotificationsStore()
            toast.pushToast({ title: '邀请已接受', text: `和 ${mine.contact_name || 'TA'} 开始一起${mine.name || '陪伴'}吧` })
          }
          pendingInvite.value = null
          persistPending()
        }
      }
    } catch (e) { /* ignore */ }
  }

  return {
    ACTIVITIES, DURATIONS,
    active, history, justDone, nowTs, pendingInvite, incoming,
    actMeta, timerText, fmtDur, elapsedSec, remainingSec,
    startSession, togglePause, complete,
    invite, cancelInvite, respond, onSSE, init, startSessionFromInvite,
    clearHistory, removeHistory
  }
})
