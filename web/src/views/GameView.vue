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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useContactsStore } from '@/stores/contacts'
import { useGameRecords } from '@/composables/useGameRecords'

const GAMES = [
  { kind: 'memory', name: '默契翻牌', emoji: '🃏', desc: '单人休闲计时局，翻完所有配对' },
  { kind: 'ghost', name: '抽鬼牌', emoji: '👻', desc: '轮流抽牌，抽到小王者输' },
  { kind: 'gomoku', name: '五子棋', emoji: '⚫', desc: '五子连珠即获胜' },
  { kind: 'go', name: '围棋', emoji: '⚪', desc: '9 路棋盘，吃子数地' },
  { kind: 'aeroplane', name: '飞行棋', emoji: '✈️', desc: '掷 6 起飞，先到终点' },
  { kind: 'rps', name: '猜拳', emoji: '✊', desc: '三局两胜定输赢' },
  { kind: 'guess', name: '猜数', emoji: '🔢', desc: '1-100 猜数，次数越少越神' }
]

const router = useRouter()
const contactsStore = useContactsStore()
const { items, load } = useGameRecords()

const games = GAMES

function bestText(kind) {
  const row = items.value.find((x) => x.title === `best_${kind}`)
  if (!row) return ''
  const e = row.extra || {}
  if (kind === 'memory') return e.value ? `最佳：${e.value} 步通关` : ''
  if (kind === 'guess') return e.value ? `最佳：${e.value} 次猜中` : ''
  return e.wins ? `累计胜 ${e.wins} 场` : ''
}

function start(kind) {
  router.push(`/game/play/${kind}`)
}

/* 邀请走整页选择器（不再用底部弹窗） */
function invite(g) {
  router.push(`/game/invite/${g.kind}`)
}

async function loadAll() {
  if (!contactsStore.list || !contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) { /* ignore */ }
  }
  try { await load() } catch (e) { /* ignore */ }
}

onMounted(loadAll)
/* /game 被 keep-alive 缓存：从对局页/邀请页返回时 onMounted 不重跑，
   靠 onActivated 重新拉纪录，保证大厅最佳成绩实时刷新 */
onActivated(loadAll)
</script>

<style scoped>
.gl-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.gl-item {
  display: flex; align-items: center; gap: 12px; background: var(--bg-soft);
  border: 1px solid var(--border); border-radius: 16px; padding: 12px;
}
.gl-emoji { font-size: 30px; line-height: 1; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--bg-screen); border-radius: 12px; border: 1px solid var(--border); }
.gl-main { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.gl-name { font-size: 15px; font-weight: 600; color: var(--text); }
.gl-desc { font-size: 11px; color: var(--text-soft); }
.gl-best { font-size: 11px; color: var(--accent); }
.gl-ops { display: flex; flex-direction: column; gap: 6px; }
.gl-btn {
  border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; font-size: 12px;
  background: var(--bg-screen); color: var(--text); white-space: nowrap;
}
.gl-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.gl-btn:active { transform: scale(0.96); }
</style>
