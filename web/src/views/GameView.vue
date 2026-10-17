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
        <button
          v-for="g in games"
          :key="g.kind"
          class="gl-item"
          @click="open(g.kind)"
        >
          <span class="gl-emoji">{{ g.emoji }}</span>
          <div class="gl-main">
            <span class="gl-name">{{ g.name }}</span>
            <span class="gl-desc">{{ g.desc }}</span>
            <span v-if="bestText(g.kind)" class="gl-best">{{ bestText(g.kind) }}</span>
          </div>
          <span class="gl-arrow">›</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onActivated } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useContactsStore } from '@/stores/contacts'
import { getGameMetaList } from '@/api/games'
import { useGameRecords } from '@/composables/useGameRecords'

const router = useRouter()
const contactsStore = useContactsStore()
const { items, load } = useGameRecords()

const games = computed(() => getGameMetaList())

function bestText(kind) {
  const row = items.value.find((x) => x.title === `best_${kind}`)
  if (!row) return ''
  const e = row.extra || {}
  if (kind === 'memory') return e.value ? `最佳：${e.value} 步通关` : ''
  if (kind === 'guess') return e.value ? `最佳：${e.value} 次猜中` : ''
  return e.wins ? `累计胜 ${e.wins} 场` : ''
}

/* 点卡片进入游戏入口页（自己玩 / 一起玩） */
function open(kind) {
  navGo(`/game/entry/${kind}`)
}

/* 内部主动导航时跳过守卫：否则点卡片进入入口页会被当成
   「pop 到残留子页」拦截，大厅再也进不了游戏 */
let selfNav = false
function navGo(path, replace = false) {
  selfNav = true
  if (replace) router.replace(path)
  else router.push(path)
  setTimeout(() => { selfNav = false }, 0)
}

/* 系统返回键：退出对局/入口页的 replace 会在栈里留下旧的游戏子页面记录，
   pop 到这些残留页时停在大厅，不让用户看到中间的邀请/对局页 */
onBeforeRouteLeave((to, from, next) => {
  if (selfNav) {
    selfNav = false
    return next()
  }
  if (to.path.startsWith('/game/')) return next(false)
  next()
})

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
  text-align: left; width: 100%;
}
.gl-item:active { transform: scale(0.98); }
.gl-emoji { font-size: 30px; line-height: 1.5; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--bg-screen); border-radius: 12px; border: 1px solid var(--border); flex: none; }
.gl-main { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.gl-name { font-size: 15px; font-weight: 600; color: var(--text); }
.gl-desc { font-size: 11px; color: var(--text-soft); }
.gl-best { font-size: 11px; color: var(--accent); }
.gl-arrow { font-size: 20px; color: var(--text-soft); flex: none; }
</style>
