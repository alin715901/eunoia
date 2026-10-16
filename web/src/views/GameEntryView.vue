<template>
  <div class="ge-page">
    <AppHeader :title="meta.name" back />
    <div class="ge-body">
      <div class="ge-hero">
        <span class="ge-emoji">{{ meta.emoji }}</span>
        <span class="ge-name">{{ meta.name }}</span>
        <span class="ge-desc">{{ meta.desc }}</span>
        <span v-if="bestText" class="ge-best">{{ bestText }}</span>
      </div>

      <div class="ge-modes">
        <button class="ge-mode primary" @click="solo">
          <span class="ge-mode-ic">🎮</span>
          <span class="ge-mode-main">
            <span class="ge-mode-title">自己玩</span>
            <span class="ge-mode-sub">一个人开一局，随时开始</span>
          </span>
        </button>
        <button class="ge-mode ghost" @click="together">
          <span class="ge-mode-ic">💬</span>
          <span class="ge-mode-main">
            <span class="ge-mode-title">{{ isMemory ? '一起玩' : '邀请联系人一起玩' }}</span>
            <span class="ge-mode-sub">邀请会发到对方聊天里，等 TA 接受即可开始</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import { getGameMeta, getGameName } from '@/api/games'
import { useGameRecords } from '@/composables/useGameRecords'

const route = useRoute()
const router = useRouter()
const kind = computed(() => String(route.params.kind || 'memory'))
const isMemory = computed(() => kind.value === 'memory')
const meta = computed(() => getGameMeta(kind.value) || { name: getGameName(kind.value), emoji: '🎮', desc: '' })

const { items, load } = useGameRecords()
const bestText = computed(() => {
  const row = items.value.find((x) => x.title === `best_${kind.value}`)
  if (!row) return ''
  const e = row.extra || {}
  if (kind.value === 'memory') return e.value ? `最佳：${e.value} 步通关` : ''
  if (kind.value === 'guess') return e.value ? `最佳：${e.value} 次猜中` : ''
  return e.wins ? `累计胜 ${e.wins} 场` : ''
})

onMounted(() => {
  try { load() } catch (e) { /* ignore */ }
})

function solo() {
  router.push(`/game/play/${kind.value}`)
}

function together() {
  router.push(`/game/invite/${kind.value}`)
}
</script>

<style scoped>
.ge-body { padding: 20px 16px 30px; }
.ge-hero {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 20px;
  padding: 28px 20px 22px; text-align: center;
}
.ge-emoji { font-size: 56px; line-height: 1; }
.ge-name { font-size: 20px; font-weight: 700; color: var(--text); }
.ge-desc { font-size: 13px; color: var(--text-soft); }
.ge-best { font-size: 12px; color: var(--accent); font-weight: 600; }
.ge-modes { display: flex; flex-direction: column; gap: 12px; margin-top: 22px; }
.ge-mode {
  display: flex; align-items: center; gap: 14px; text-align: left;
  border: 1px solid var(--border); border-radius: 18px; padding: 16px;
  background: var(--bg-soft);
}
.ge-mode.primary { background: var(--accent); border-color: var(--accent); }
.ge-mode.primary .ge-mode-title { color: #fff; }
.ge-mode.primary .ge-mode-sub { color: rgba(255, 255, 255, 0.75); }
.ge-mode:active { transform: scale(0.98); }
.ge-mode-ic { font-size: 26px; line-height: 1; flex: none; }
.ge-mode-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ge-mode-title { font-size: 16px; font-weight: 700; color: var(--text); }
.ge-mode-sub { font-size: 11px; color: var(--text-soft); line-height: 1.5; }
</style>
