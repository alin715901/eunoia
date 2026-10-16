<template>
  <div class="gp-page">
    <AppHeader :title="gameName" back />
    <div class="gp-body">
      <div v-if="showOpponent" class="gp-opponent">
        <AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="38" />
        <div class="gp-op-main">
          <span class="gp-op-name">{{ opponent.name }}</span>
          <span class="gp-op-sub">{{ fromInvite ? '受邀对战中' : '对手' }}</span>
        </div>
        <span class="gp-op-tag">{{ kindTag }}</span>
      </div>
      <component :is="comp" :key="roundKey" :opponent="opponent" :my-avatar="myAvatar" :together="isMemoryTogether" @over="onOver" />
    </div>

    <!-- 结算弹窗 -->
    <div v-if="result" class="gp-mask" @click.self="result = null">
      <div class="gp-result">
        <div class="gp-res-emoji">{{ (result.solo || result.noVs) ? '🎉' : result.tie ? '🤝' : result.win ? '🎉' : '😵' }}</div>
        <h3 class="gp-res-title">{{ resultTitle }}</h3>
        <p v-if="result.detail" class="gp-res-detail">{{ result.detail }}</p>
        <p v-if="!result.solo && !result.noVs" class="gp-res-react">{{ reaction }}</p>
        <div class="gp-res-btns">
          <button class="md-btn primary" @click="again">再来一局</button>
          <button class="md-btn ghost" @click="exitGame">退出游戏</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onBeforeUnmount, defineAsyncComponent, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useContactsStore } from '@/stores/contacts'
import { getDesktop, getContacts } from '@/api/contacts'
import { getGameName, getActiveGame, endGame } from '@/api/games'
import { confirmDialog } from '@/utils/dialog'
import { useGameRecords } from '@/composables/useGameRecords'

const COMPONENTS = {
  memory: defineAsyncComponent(() => import('@/components/games/MemoryGame.vue')),
  ghost: defineAsyncComponent(() => import('@/components/games/GhostCardGame.vue')),
  gomoku: defineAsyncComponent(() => import('@/components/games/GomokuGame.vue')),
  go: defineAsyncComponent(() => import('@/components/games/GoGame.vue')),
  aeroplane: defineAsyncComponent(() => import('@/components/games/AeroplaneGame.vue')),
  rps: defineAsyncComponent(() => import('@/components/games/RpsGame.vue')),
  guess: defineAsyncComponent(() => import('@/components/games/GuessNumberGame.vue'))
}

const route = useRoute()
const router = useRouter()
const contactsStore = useContactsStore()
const { save } = useGameRecords()

const kind = computed(() => String(route.params.kind || 'memory'))
const gameName = computed(() => getGameName(kind.value))
const kindTag = computed(() => {
  const tags = { memory: '记忆翻牌', ghost: '抽牌对决', gomoku: '棋盘对弈', go: '棋盘对弈', aeroplane: '骰子竞速', rps: '手势对决', guess: '数字推理' }
  return tags[kind.value] || '小游戏'
})
const comp = computed(() => COMPONENTS[kind.value] || COMPONENTS.memory)

/* 默契翻牌是单人计时局：不显示对手行、对方不参与；
   受邀一起玩（带 contactId）时进入双人模式：显示对手行，双方轮流每人翻两张 */
const showOpponent = computed(() => kind.value !== 'memory' || isMemoryTogether.value)
const isMemoryTogether = computed(() => kind.value === 'memory' && !!route.query.contactId)

const opponent = ref({ id: 0, name: '对方', avatar: '' })
const myAvatar = ref('')
const fromInvite = ref(false)
const result = ref(null)
const roundKey = ref(0)

/* 退出确认进行中的标记：确认后重定向到入口页时放行守卫，避免二次弹窗 */
let leaving = false

/* 路由变化（换游戏/换对手）时重开一局，避免停留在上一局的终局状态 */
watch(() => route.fullPath, () => {
  result.value = null
  roundKey.value += 1
  loadOpponent()
})

/* 对局页被 keep-alive 缓存：从大厅/聊天再次进入时 onMounted 不重跑，
   靠 onActivated 重新开局 + 重载对手（含邀请对局的 contactId 场景）；
   同时复位退出标记，保证再次进入对局时返回仍会弹确认 */
onActivated(() => {
  leaving = false
  result.value = null
  roundKey.value += 1
  loadOpponent()
})

const resultTitle = computed(() => {
  if (!result.value) return ''
  if (result.value.solo || result.value.noVs) return result.value.title || '完成'
  if (result.value.tie) return '平局'
  return result.value.win ? '你赢了' : '你输了'
})

const REACT_WIN = ['对方愿赌服输：这把算你的！', '对方笑着摆手：再来再来', '对方不服气地哼哼：下一局找回场子', '对方鼓掌：厉害，我心服口服']
const REACT_LOSE = ['对方得意起来：还得再练练', '对方安慰你：这只是运气问题', '对方叉腰：要不要再来一局？', '对方笑嘻嘻地说：承让承让']
const REACT_TIE = ['对方摊手：势均力敌', '对方点头：这局算打平']
const reaction = ref('')

onMounted(loadOpponent)

/* 对手：优先 URL 指定的联系人；否则取第一个非群聊联系人 */
async function loadOpponent() {
  const cid = Number(route.query.contactId) || 0
  let target = null
  if (cid) {
    fromInvite.value = true
    target = contactsStore.getById(cid) || null
  }
  if (!target) {
    if (!contactsStore.list || !contactsStore.list.length) {
      try { await getContacts() } catch (e) { /* ignore */ }
    }
    target = (contactsStore.list || []).find((c) => c.kind !== 'group') || null
  }
  if (target) {
    opponent.value = { id: target.id, name: target.name || '对方', avatar: target.avatar || '' }
    try {
      const desk = await getDesktop(target.id)
      myAvatar.value = desk?.my_avatar || ''
    } catch (e) { /* ignore */ }
  }
}

onBeforeUnmount(() => {
  /* 组件真正销毁时兜底：把已接受的对局邀请标记为已结束（聊天卡片显示「已结束」） */
  endInviteIfAny()
})

async function onOver(r) {
  result.value = r || { win: false }
  /* 单人休闲局 / 双人无输赢局（默契翻牌）：没有对手反应语，不记胜场 */
  if (r?.solo || r?.noVs) {
    reaction.value = ''
    return
  }
  const pool = r?.tie ? REACT_TIE : r?.win ? REACT_WIN : REACT_LOSE
  reaction.value = pool[Math.floor(Math.random() * pool.length)]
  /* 纪录：除默契翻牌（组件内已按步数记录）外，胜局累计胜场 */
  try {
    if (r?.win) {
      await save(kind.value, {}, { countKey: 'wins' })
    }
  } catch (e) { /* 纪录失败不影响对局 */ }
}

function again() {
  result.value = null
  roundKey.value += 1
}

/* 结束当前邀请对局（聊天卡片同步「已结束」），再选一起玩需重新邀请 */
async function endInviteIfAny() {
  if (!fromInvite.value || !opponent.value.id) return
  try {
    const inv = await getActiveGame(opponent.value.id)
    if (inv) await endGame(inv.id)
  } catch (e) { /* ignore */ }
}

/* 退出游戏：结束邀请对局 → 回到游戏入口页（自己玩 / 一起玩） */
async function exitGame() {
  leaving = true
  await endInviteIfAny()
  router.replace(`/game/entry/${kind.value}`)
}

/* 对局中返回（返回键 / 系统返回）：弹确认，退出回入口页，继续留在对局 */
onBeforeRouteLeave(async (to, from, next) => {
  if (leaving) return next()
  const ok = await confirmDialog({
    title: '退出游戏？',
    text: '退出后回到游戏选择页，邀请的对局需要重新邀请',
    okText: '退出',
    cancelText: '继续'
  })
  if (!ok) return next(false)
  leaving = true
  await endInviteIfAny()
  /* 先取消当前导航，下一个 tick 再 replace 到入口页：
     守卫内直接 next(路径) 会与外部导航竞争导致 URL 错乱 */
  next(false)
  setTimeout(() => {
    router.replace(`/game/entry/${kind.value}`)
  }, 0)
})
</script>

<style scoped>
.gp-body { padding: 14px 16px 30px; }
.gp-opponent { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.gp-op-main { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.gp-op-name { font-size: 15px; font-weight: 600; color: var(--text); }
.gp-op-sub { font-size: 11px; color: var(--text-soft); }
.gp-op-tag { font-size: 11px; color: var(--accent); background: var(--bg-soft); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; }
.gp-mask {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 200;
  display: flex; align-items: center; justify-content: center; padding: 30px;
}
.gp-result {
  width: 100%; max-width: 300px; background: var(--bg-screen); border-radius: 18px; padding: 26px 20px 20px;
  text-align: center; border: 1px solid var(--border);
}
.gp-res-emoji { font-size: 46px; line-height: 1; }
.gp-res-title { font-size: 18px; color: var(--text); margin: 12px 0 6px; }
.gp-res-detail { font-size: 14px; color: var(--accent); font-weight: 600; }
.gp-res-react { font-size: 12px; color: var(--text-soft); margin: 10px 0 18px; line-height: 1.5; }
.gp-res-btns { display: flex; gap: 10px; }
.gp-res-btns .md-btn { flex: 1; }
</style>
