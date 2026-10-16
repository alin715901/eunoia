<template>
  <div class="md-page">
    <AppHeader title="小游戏" back />
    <div class="md-body">
      <div class="md-summary">
        <span class="md-sum-ic"><AppIcon name="game" :size="26" color="var(--accent)" /></span>
        <span class="md-sum-main">
          <span class="md-sum-title">7 款小游戏</span>
          <span class="md-sum-sub">自己开一局，或邀请一位联系人来聊天里应战</span>
        </span>
      </div>

      <div class="gl-list">
        <div v-for="g in games" :key="g.kind" class="gl-item">
          <span class="gl-emoji">{{ g.emoji }}</span>
          <div class="gl-main">
            <span class="gl-name">{{ g.name }}</span>
            <span class="gl-desc">{{ g.desc }}</span>
            <span v-if="bestText(g.kind)" class="gl-best">{{ bestText(g.kind) }}</span>
          </div>
          <div class="gl-ops">
            <button class="gl-btn primary" @click="start(g.kind)">开始游戏</button>
            <button class="gl-btn ghost" @click="invite(g)">邀请</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 邀请单人联系人参加游戏 -->
    <div v-if="pickerShow" class="gl-mask" @click.self="pickerShow = false">
      <div class="gl-sheet">
        <h3 class="gl-sheet-title">邀请谁一起玩{{ pickingGame?.name }}</h3>
        <p class="gl-sheet-sub">邀请会发到对方的聊天里</p>
        <div class="gl-pick-list">
          <button
            v-for="c in personContacts"
            :key="c.id"
            class="gl-pick"
            :class="{ on: pickedId === c.id }"
            @click="pickedId = c.id"
          >
            <AppAvatar :name="c.name" :avatar="c.avatar" :size="30" />
            <span class="gl-pick-name">{{ c.name }}</span>
            <AppIcon v-if="pickedId === c.id" name="check" :size="16" color="var(--accent)" />
          </button>
          <p v-if="!personContacts.length" class="gl-empty">还没有可邀请的联系人</p>
        </div>
        <div class="gl-sheet-btns">
          <button class="md-btn ghost" @click="pickerShow = false">取消</button>
          <button class="md-btn primary" :disabled="!pickedId" @click="sendInvite">发送邀请</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { useGameRecords } from '@/composables/useGameRecords'
import { sendGameInvite } from '@/api/games'

const GAMES = [
  { kind: 'memory', name: '默契翻牌', emoji: '🃏', desc: '轮流翻牌配对，配对多者胜' },
  { kind: 'ghost', name: '抽鬼牌', emoji: '👻', desc: '轮流抽牌，抽到小王者输' },
  { kind: 'gomoku', name: '五子棋', emoji: '⚫', desc: '五子连珠即获胜' },
  { kind: 'go', name: '围棋', emoji: '⚪', desc: '9 路棋盘，吃子数地' },
  { kind: 'aeroplane', name: '飞行棋', emoji: '✈️', desc: '掷 6 起飞，先到终点' },
  { kind: 'rps', name: '猜拳', emoji: '✊', desc: '三局两胜定输赢' },
  { kind: 'guess', name: '猜数', emoji: '🔢', desc: '1-100 猜数，次数越少越神' }
]

const router = useRouter()
const contactsStore = useContactsStore()
const toast = useNotificationsStore()
const { items, load } = useGameRecords()

const games = GAMES
const pickerShow = ref(false)
const pickingGame = ref(null)
const pickedId = ref(0)

const personContacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))

function bestText(kind) {
  const row = items.value.find((x) => x.title === `best_${kind}`)
  if (!row) return ''
  const e = row.extra || {}
  if (kind === 'memory') return e.value ? `最佳：${e.value} 回合通关` : ''
  if (kind === 'guess') return e.value ? `最佳：${e.value} 次猜中` : ''
  return e.wins ? `累计胜 ${e.wins} 场` : ''
}

function start(kind) {
  router.push(`/game/play/${kind}`)
}

function invite(g) {
  pickingGame.value = g
  pickedId.value = 0
  pickerShow.value = true
}

async function sendInvite() {
  if (!pickedId.value || !pickingGame.value) return
  try {
    await sendGameInvite(pickedId.value, pickingGame.value.kind)
    toast.pushToast({ title: '邀请已发送到聊天' })
  } catch (e) {
    toast.pushToast({ title: e?.message || '邀请发送失败' })
  }
  pickerShow.value = false
}

onMounted(async () => {
  if (!contactsStore.list || !contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) { /* ignore */ }
  }
  try { await load() } catch (e) { /* ignore */ }
})
</script>

<style scoped>
.gl-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.gl-item {
  display: flex; align-items: center; gap: 12px; background: var(--bg-soft);
  border: 1px solid var(--border); border-radius: 16px; padding: 12px;
}
.gl-emoji { font-size: 30px; line-height: 1; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--bg); border-radius: 12px; border: 1px solid var(--border); }
.gl-main { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.gl-name { font-size: 15px; font-weight: 600; color: var(--text); }
.gl-desc { font-size: 11px; color: var(--text-soft); }
.gl-best { font-size: 11px; color: var(--accent); }
.gl-ops { display: flex; flex-direction: column; gap: 6px; }
.gl-btn {
  border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; font-size: 12px;
  background: var(--bg); color: var(--text); white-space: nowrap;
}
.gl-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.gl-btn:active { transform: scale(0.96); }
.gl-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
.gl-sheet {
  width: 100%; max-width: 480px; background: var(--bg); border-radius: 18px 18px 0 0; padding: 18px 16px 22px;
  max-height: 76vh; display: flex; flex-direction: column;
}
.gl-sheet-title { font-size: 16px; color: var(--text); text-align: center; }
.gl-sheet-sub { font-size: 12px; color: var(--text-soft); text-align: center; margin: 6px 0 12px; }
.gl-pick-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.gl-pick {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px;
  border: 1px solid transparent; background: var(--bg-soft); text-align: left;
}
.gl-pick.on { border-color: var(--accent); }
.gl-pick-name { flex: 1; font-size: 14px; color: var(--text); }
.gl-empty { text-align: center; font-size: 13px; color: var(--text-soft); padding: 24px 0; }
.gl-sheet-btns { display: flex; gap: 10px; margin-top: 14px; }
.gl-sheet-btns .md-btn { flex: 1; }
</style>
