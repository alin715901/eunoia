<template>
  <div class="gi-page">
    <AppHeader title="邀请一起玩" back />
    <div class="gi-body">
      <div class="gi-head">
        <span class="gi-emoji">{{ game?.emoji }}</span>
        <div class="gi-head-main">
          <span class="gi-title">{{ game?.name }}</span>
          <span class="gi-sub">邀请会发到对方的聊天里，等 TA 接受即可开局</span>
        </div>
      </div>

      <div class="gi-list">
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
    </div>

    <div class="gi-foot">
      <button class="md-btn primary gi-send" :disabled="!pickedId" @click="send">发送邀请</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { sendGameInvite, getGameName } from '@/api/games'

const GAMES = [
  { kind: 'memory', name: '默契翻牌', emoji: '🃏' },
  { kind: 'ghost', name: '抽鬼牌', emoji: '👻' },
  { kind: 'gomoku', name: '五子棋', emoji: '⚫' },
  { kind: 'go', name: '围棋', emoji: '⚪' },
  { kind: 'aeroplane', name: '飞行棋', emoji: '✈️' },
  { kind: 'rps', name: '猜拳', emoji: '✊' },
  { kind: 'guess', name: '猜数', emoji: '🔢' }
]

const route = useRoute()
const router = useRouter()
const contactsStore = useContactsStore()
const toast = useNotificationsStore()

const kind = computed(() => String(route.params.kind || 'memory'))
const game = computed(() => GAMES.find((g) => g.kind === kind.value) || { name: getGameName(kind.value), emoji: '🎮' })
const personContacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))
const pickedId = ref(0)

async function send() {
  if (!pickedId.value) return
  try {
    await sendGameInvite(pickedId.value, kind.value)
    toast.pushToast({ title: '邀请已发送到聊天' })
    router.back()
  } catch (e) {
    toast.pushToast({ title: e?.message || '邀请发送失败' })
  }
}

onMounted(async () => {
  if (!contactsStore.list || !contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) { /* ignore */ }
  }
})
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
</style>
