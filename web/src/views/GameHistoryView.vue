<template>
  <div class="gh-page">
    <AppHeader :title="`${meta.name} · 历史记录`" back @back="onBack">
      <template #right>
        <button v-if="history.length" class="gh-clear" @click="clearHist">清空</button>
      </template>
    </AppHeader>
    <div class="gh-body">
      <div v-if="history.length" class="gh-list">
        <div v-for="h in history" :key="h.id" class="gh-item">
          <span class="gh-tag" :class="tagClass(h)">{{ tagText(h) }}</span>
          <span class="gh-main">
            <span class="gh-detail">{{ histDetail(h) }}</span>
            <span class="gh-time">{{ fmtTime(h.at) }}</span>
          </span>
        </div>
      </div>
      <div v-else class="gh-empty">
        <span class="gh-empty-ic"><GameIcon :name="kind" :size="40" /></span>
        <p>还没有对局记录</p>
        <p class="gh-empty-sub">去玩一局，成绩会记在这里</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onActivated, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import GameIcon from '@/components/games/GameIcon.vue'
import { getGameMeta, getGameName } from '@/api/games'
import { useGameRecords } from '@/composables/useGameRecords'
import { confirmDialog } from '@/utils/dialog'

const route = useRoute()
const router = useRouter()
const kind = computed(() => String(route.params.kind || 'memory'))
const isMemory = computed(() => kind.value === 'memory')
const meta = computed(() => getGameMeta(kind.value) || { name: getGameName(kind.value), emoji: '🎮', desc: '' })

const { historyOf, clearHistory } = useGameRecords()

/* ── 历史记录：每局一条，新的在前，全量留存（放不下由列表滚动展示） ── */
const history = ref([])
async function loadHistory() {
  try { history.value = await historyOf(kind.value) } catch (e) { history.value = [] }
}

function fmtDur(s) {
  const n = Math.max(0, Math.round(Number(s) || 0))
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
function fmtTime(at) {
  const d = new Date(at || Date.now())
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}
function tagText(h) {
  if (isMemory.value) return '用时'
  if (h.tie) return '平局'
  return h.win ? '胜利' : '失利'
}
function tagClass(h) {
  if (isMemory.value) return 'time'
  if (h.tie) return 'tie'
  return h.win ? 'win' : 'lose'
}
function histDetail(h) {
  if (isMemory.value) {
    /* 默契翻牌只记用时；一起玩时标明和谁（h.opponent 由对局页记录） */
    const base = `${fmtDur(h.seconds)} · ${h.mode === 'together' ? '一起玩' : '单人'}`
    return h.opponent ? `${base} · vs ${h.opponent}` : base
  }
  const parts = []
  /* 旧版抽鬼牌结算写过「对方留下了小王 / 小王落在了你手里」，
     新版只报胜负；历史记录里含「小王」的旧文案一律不再展示 */
  let d = h.detail && h.detail.indexOf('小王') < 0 ? h.detail : ''
  /* 猜数旧记录「简单 · 你 6 次 : 对方 6 次」统一显示为「简单 · 6 : 6」 */
  const m = d.match(/^(.*)你 (\d+) 次 : 对方 (\d+) 次$/)
  if (m) d = `${m[1]}${m[2]} : ${m[3]}`
  if (d) parts.push(d)
  if (h.opponent) parts.push(`vs ${h.opponent}`)
  return parts.join(' · ')
}

async function clearHist() {
  const ok = await confirmDialog({
    title: '清空历史记录？',
    text: `将删除「${meta.value.name}」的全部对局记录，不可恢复`,
    okText: '清空',
    cancelText: '取消'
  })
  if (!ok) return
  try { await clearHistory(kind.value) } catch (e) { /* ignore */ }
  await loadHistory()
}

onMounted(loadHistory)
/* 历史页被 keep-alive 缓存：再次进入时刷新列表 */
onActivated(loadHistory)

/* 返回：显式回游戏入口页（与入口页返回大厅一致，避免 pop 到残留子页） */
function onBack(payload) {
  if (payload && typeof payload.prevent === 'function') payload.prevent()
  router.replace(`/game/entry/${kind.value}`)
}
</script>

<style scoped>
.gh-body { padding: 14px 16px 30px; }
/* 全量留存：超出高度后在列表内部滚动，不把页面撑长 */
.gh-list {
  display: flex; flex-direction: column; gap: 8px;
  max-height: calc(100vh - 120px); overflow-y: auto; -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.gh-item {
  display: flex; align-items: center; gap: 10px; background: var(--bg-soft);
  border: 1px solid var(--border); border-radius: 12px; padding: 9px 12px; flex: none;
}
.gh-tag {
  flex: none; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 9px;
  color: var(--text-soft); background: var(--bg-screen); border: 1px solid var(--border);
}
.gh-tag.win { color: var(--accent); border-color: var(--accent); }
.gh-tag.lose { color: #e5484d; border-color: #e5484d; }
.gh-tag.tie { color: #f5a623; border-color: #f5a623; }
.gh-main { flex: 1; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
.gh-detail { font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gh-time { font-size: 11px; color: var(--text-soft); flex: none; }
.gh-clear {
  font-size: 12px; color: var(--text-soft); background: none; border: none;
  padding: 6px 8px; cursor: pointer;
}
.gh-clear:active { color: var(--accent); }
.gh-empty { text-align: center; padding: 60px 0; color: var(--text-soft); }
.gh-empty-ic { opacity: 0.5; display: inline-flex; }
.gh-empty p { font-size: 13px; margin: 10px 0 0; }
.gh-empty-sub { font-size: 11px; margin-top: 4px !important; opacity: 0.8; }
</style>
