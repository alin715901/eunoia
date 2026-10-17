<template>
  <div class="ge-page">
    <AppHeader :title="meta.name" back @back="onBack">
      <template #right>
        <button class="ge-hist-entry" @click="openHistory">
          历史<span v-if="history.length" class="ge-hist-badge">{{ history.length }}</span>
        </button>
      </template>
    </AppHeader>
    <div class="ge-body">
      <div class="ge-hero">
        <span class="ge-emoji"><GameIcon :name="kind" :size="56" /></span>
        <span class="ge-name">{{ meta.name }}</span>
        <span class="ge-desc">{{ meta.desc }}</span>
        <span v-if="bestText" class="ge-best">{{ bestText }}</span>
      </div>

      <div class="ge-modes">
        <!-- 只有默契翻牌有单人休闲局；其余游戏均为双人对战，只提供一起玩 -->
        <button v-if="isMemory" class="ge-mode primary" @click="solo">
          <span class="ge-mode-ic"><AppIcon name="game" :size="26" /></span>
          <span class="ge-mode-main">
            <span class="ge-mode-title">自己玩</span>
            <span class="ge-mode-sub">一个人开一局，随时开始</span>
          </span>
        </button>
        <button class="ge-mode" :class="isMemory ? 'ghost' : 'primary'" @click="together">
          <span class="ge-mode-ic"><AppIcon name="users" :size="26" /></span>
          <span class="ge-mode-main">
            <span class="ge-mode-title">{{ isMemory ? '一起玩' : '邀请联系人一起玩' }}</span>
            <span class="ge-mode-sub">邀请会发到对方聊天里，等 TA 接受即可开始</span>
          </span>
        </button>
      </div>

      <!-- 游戏规则：玩法与规则说明（历史记录已移到右上角「历史」） -->
      <div class="ge-rules">
        <div class="ge-rules-head">
          <span class="ge-rules-title">游戏规则</span>
        </div>
        <ol v-if="meta.rules && meta.rules.length" class="ge-rules-list">
          <li v-for="(r, i) in meta.rules" :key="i">{{ r }}</li>
        </ol>
        <p v-else class="ge-rules-empty">暂无规则说明</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onActivated, ref } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import GameIcon from '@/components/games/GameIcon.vue'
import { getGameMeta, getGameName } from '@/api/games'
import { useGameRecords } from '@/composables/useGameRecords'

const route = useRoute()
const router = useRouter()
const kind = computed(() => String(route.params.kind || 'memory'))
const isMemory = computed(() => kind.value === 'memory')
const meta = computed(() => getGameMeta(kind.value) || { name: getGameName(kind.value), emoji: '🎮', desc: '' })

const { items, load, historyOf } = useGameRecords()
const bestText = computed(() => {
  const row = items.value.find((x) => x.title === `best_${kind.value}`)
  if (!row) return ''
  const e = row.extra || {}
  if (kind.value === 'memory') return e.value ? `最佳：${e.value} 步通关` : ''
  if (kind.value === 'guess') return e.value ? `最佳：${e.value} 次猜中` : ''
  return e.wins ? `累计胜 ${e.wins} 场` : ''
})

/* 历史记录数量（入口页只显示角标，完整列表在独立历史页） */
const history = ref([])
async function loadHistory() {
  try { history.value = await historyOf(kind.value) } catch (e) { history.value = [] }
}

onMounted(() => {
  try { load() } catch (e) { /* ignore */ }
  loadHistory()
})
/* 入口页被 keep-alive 缓存：再次进入时刷新最佳纪录与历史记录 */
onActivated(() => {
  try { load() } catch (e) { /* ignore */ }
  loadHistory()
})

/* 返回：显式回游戏大厅。不用 history.back()——
   邀请/对局流程在历史栈里会残留中间页，pop 可能落到邀请页 */
function onBack(payload) {
  if (payload && typeof payload.prevent === 'function') payload.prevent()
  navGo('/game', true)
}

/* 系统返回键：pop 目标是大厅/主页等正常上一页时放行；
   只有 pop 到残留的游戏子页（对局退出 replace 留下的邀请/对局记录）时，
   才重定向回大厅。用 next(路径) 而不是 next(false)+replace：
   后者会多压一层路由记录，导致后续 pop 目标变成相同路由被去重 */
onBeforeRouteLeave((to, from, next) => {
  if (selfNav) {
    selfNav = false
    return next()
  }
  if (to.path.startsWith('/game/')) {
    selfNav = true
    return next('/game')
  }
  next()
})

/* 内部主动导航（自己玩/一起玩/返回大厅）时跳过守卫接管，
   否则正常的前进导航会被守卫 next(false) 取消并重定向回大厅，形成死循环 */
let selfNav = false
function navGo(path, replace = false) {
  selfNav = true
  if (replace) router.replace(path)
  else router.push(path)
  /* 兜底复位：守卫同步消费标志；若导航异常未触发守卫，下个宏任务清掉 */
  setTimeout(() => { selfNav = false }, 0)
}

/* 进入邀请页/对局页用 push：保留历史栈深度，
   系统返回键才能逐级回退；退出/返回一律用显式 replace 清理 */
function solo() {
  navGo(`/game/play/${kind.value}`)
}

function together() {
  navGo(`/game/invite/${kind.value}`)
}

/* 右上角「历史」→ 独立历史页（带对局数量角标） */
function openHistory() {
  navGo(`/game/history/${kind.value}`)
}
</script>

<style scoped>
.ge-body { padding: 20px 16px 30px; }
.ge-hero {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 20px;
  padding: 28px 20px 22px; text-align: center;
}
.ge-emoji { font-size: 56px; line-height: 1.5; }
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
/* 模式图标：默认主题色，主按钮（彩色底）上用白 */
.ge-mode-ic { color: var(--accent); display: flex; flex: none; }
.ge-mode.primary .ge-mode-ic { color: #fff; }
.ge-mode:active { transform: scale(0.98); }
.ge-mode-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ge-mode-title { font-size: 16px; font-weight: 700; color: var(--text); }
.ge-mode-sub { font-size: 11px; color: var(--text-soft); line-height: 1.5; }
/* 右上角「历史」入口：标题栏按钮 + 对局数量角标 */
.ge-hist-entry {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 600; color: var(--accent);
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: 999px; padding: 5px 12px; cursor: pointer;
}
.ge-hist-entry:active { transform: scale(0.96); }
.ge-hist-badge {
  font-size: 10px; font-weight: 700; color: #fff; background: var(--accent);
  border-radius: 999px; padding: 1px 6px; line-height: 1.4;
}
/* 游戏规则卡（原历史记录位置） */
.ge-rules {
  margin-top: 22px; background: var(--bg-soft);
  border: 1px solid var(--border); border-radius: 16px; padding: 16px;
}
.ge-rules-head { display: flex; align-items: center; margin-bottom: 10px; }
.ge-rules-title { font-size: 14px; font-weight: 700; color: var(--text); }
.ge-rules-list {
  margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px;
}
.ge-rules-list li {
  font-size: 12px; color: var(--text-soft); line-height: 1.7;
}
.ge-rules-list li::marker { color: var(--accent); font-weight: 700; }
.ge-rules-empty { font-size: 12px; color: var(--text-soft); margin: 0; }
</style>
