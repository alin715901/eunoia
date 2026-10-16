<template>
  <div class="gi-page">
    <AppHeader :title="phaseTitle" back @back="onBack" />
    <div class="gi-body">
      <div class="gi-head">
        <span class="gi-emoji">{{ game?.emoji }}</span>
        <div class="gi-head-main">
          <span class="gi-title">{{ game?.name }}</span>
          <span class="gi-sub">邀请会发到对方的聊天里，等 TA 接受即可开局</span>
        </div>
      </div>

      <!-- 阶段一：选择联系人 -->
      <div v-if="phase === 'pick'" class="gi-list">
        <button
          v-for="c in personContacts"
          :key="c.id"
          class="gi-pick"
          :class="{ on: pickedId === c.id }"
          @click="pickedId = c.id"
        >
          <AppAvatar :name="c.name" :avatar="c.avatar" :size="38" />
          <span class="gi-pick-name">{{ c.name }}</span>
          <span class="gi-radio" :class="{ on: pickedId === c.id }"></span>
        </button>
        <p v-if="!personContacts.length" class="gi-empty">还没有可邀请的联系人，先去添加一位吧</p>
      </div>

      <!-- 阶段二：等待对方同意 -->
      <div v-else-if="phase === 'waiting'" class="gi-stage">
        <div class="gi-wait-card">
          <span class="gi-wait-av"><AppAvatar :name="pickedName" :avatar="pickedAvatar" :size="56" /></span>
          <p class="gi-wait-title">已邀请 {{ pickedName }} 一起玩</p>
          <p class="gi-wait-sub">等待对方同意…</p>
          <span class="gi-dots"><i></i><i></i><i></i></span>
        </div>
        <button class="md-btn ghost gi-cancel" @click="cancelInvite">取消邀请</button>
      </div>

      <!-- 阶段三：对方已同意 -->
      <div v-else-if="phase === 'accepted'" class="gi-stage">
        <div class="gi-wait-card ok">
          <span class="gi-wait-av"><AppAvatar :name="pickedName" :avatar="pickedAvatar" :size="56" /></span>
          <p class="gi-wait-title">{{ pickedName }} 已同意！</p>
          <p class="gi-wait-sub">点击「开始游戏」进入对局</p>
        </div>
        <button class="md-btn primary gi-start" @click="startGame">开始游戏</button>
      </div>

      <!-- 阶段四：对方拒绝 / 邀请失效 -->
      <div v-else class="gi-stage">
        <div class="gi-wait-card fail">
          <span class="gi-wait-av"><AppAvatar :name="pickedName" :avatar="pickedAvatar" :size="56" /></span>
          <p class="gi-wait-title">{{ phase === 'rejected' ? '对方拒绝了邀请' : '邀请已失效' }}</p>
          <p class="gi-wait-sub">换一位联系人，或稍后再试</p>
        </div>
        <button class="md-btn primary gi-start" @click="backToPick">重新邀请</button>
      </div>
    </div>

    <div v-if="phase === 'pick'" class="gi-foot">
      <button class="md-btn primary gi-send" :disabled="!pickedId" @click="send">发送邀请</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { sendGameInvite, cancelGameInvite, getGameInvites, getGameName, getGameMeta } from '@/api/games'

const route = useRoute()
const router = useRouter()
const contactsStore = useContactsStore()
const toast = useNotificationsStore()

const kind = computed(() => String(route.params.kind || 'memory'))
const game = computed(() => getGameMeta(kind.value) || { name: getGameName(kind.value), emoji: '🎮' })
const personContacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))
const pickedId = ref(0)
const picked = computed(() => personContacts.value.find((c) => c.id === pickedId.value) || null)
const pickedName = computed(() => picked.value?.name || '对方')
const pickedAvatar = computed(() => picked.value?.avatar || '')

/* 流程阶段：pick 选人 → waiting 等待 → accepted 已同意（可开始）→ rejected 被拒 */
const phase = ref('pick')
const phaseTitle = computed(() => {
  if (phase.value === 'waiting') return '等待对方同意'
  if (phase.value === 'accepted') return '对方已同意'
  if (phase.value === 'rejected') return '邀请未成功'
  return '邀请一起玩'
})

const inviteId = ref(0)
let pollTimer = null

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

/* 轮询邀请状态：accepted → 显示开始游戏；rejected/expired → 失败态 */
async function poll() {
  if (!inviteId.value) return
  try {
    const list = await getGameInvites(50)
    const inv = (list || []).find((x) => x.id === inviteId.value)
    if (!inv) return
    if (inv.status === 'accepted') { phase.value = 'accepted'; stopPoll() }
    else if (inv.status === 'rejected') { phase.value = 'rejected'; stopPoll() }
    else if (inv.status === 'expired' || inv.status === 'cancelled') {
      phase.value = 'rejected'
      stopPoll()
      toast.pushToast({ title: '邀请已失效，请重新邀请' })
    }
  } catch (e) { /* 轮询失败静默，下个周期再试 */ }
}

async function send() {
  if (!pickedId.value) return
  try {
    const r = await sendGameInvite(pickedId.value, kind.value)
    inviteId.value = Number(r?.id) || 0
    phase.value = 'waiting'
    stopPoll()
    pollTimer = setInterval(poll, 1200)
  } catch (e) {
    toast.pushToast({ title: e?.message || '邀请发送失败' })
  }
}

async function cancelInvite() {
  stopPoll()
  if (inviteId.value) {
    try { await cancelGameInvite(inviteId.value) } catch (e) { /* ignore */ }
  }
  phase.value = 'pick'
}

function backToPick() {
  phase.value = 'pick'
}

function startGame() {
  router.push(`/game/play/${kind.value}?contactId=${pickedId.value}`)
}

/* 返回：等待中先取消邀请并留在选人态，其他阶段直接退回上一页 */
function onBack(payload) {
  if (phase.value === 'waiting') {
    if (payload && typeof payload.prevent === 'function') payload.prevent()
    cancelInvite()
    return
  }
  router.back()
}

onMounted(async () => {
  if (!contactsStore.list || !contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) { /* ignore */ }
  }
})

onBeforeUnmount(stopPoll)
</script>

<style scoped>
.gi-body { padding: 14px 16px 20px; }
.gi-head { display: flex; align-items: center; gap: 12px; background: var(--bg-soft); border: 1px solid var(--border); border-radius: 16px; padding: 14px 12px; }
.gi-emoji { font-size: 30px; line-height: 1; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--bg-screen); border-radius: 12px; border: 1px solid var(--border); }
.gi-head-main { display: flex; flex-direction: column; gap: 4px; }
.gi-title { font-size: 16px; font-weight: 700; color: var(--text); }
.gi-sub { font-size: 11px; color: var(--text-soft); line-height: 1.5; }
.gi-list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.gi-pick {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px;
  border: 1px solid var(--border); background: var(--bg-soft); text-align: left;
}
.gi-pick.on { border-color: var(--accent); background: var(--bg-screen); }
.gi-pick-name { flex: 1; font-size: 15px; color: var(--text); }
.gi-radio {
  width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border);
  display: flex; align-items: center; justify-content: center; flex: none;
}
.gi-radio.on { border-color: var(--accent); }
.gi-radio.on::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
.gi-empty { text-align: center; font-size: 13px; color: var(--text-soft); padding: 30px 0; }
.gi-foot { padding: 12px 16px 24px; }
.gi-send { width: 100%; }

/* 等待 / 同意 / 失败 三态卡片 */
.gi-stage { display: flex; flex-direction: column; gap: 16px; margin-top: 20px; }
.gi-wait-card {
  display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 20px; padding: 30px 20px 24px;
}
.gi-wait-card.ok { border-color: var(--accent); }
.gi-wait-card.fail { opacity: 0.92; }
.gi-wait-av { line-height: 1; }
.gi-wait-title { font-size: 16px; font-weight: 700; color: var(--text); }
.gi-wait-sub { font-size: 12px; color: var(--text-soft); }
.gi-dots { display: inline-flex; gap: 5px; margin-top: 4px; }
.gi-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: gi-blink 1.2s infinite; }
.gi-dots i:nth-child(2) { animation-delay: 0.2s; }
.gi-dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes gi-blink { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
.gi-cancel { width: 100%; }
.gi-start { width: 100%; }
</style>
