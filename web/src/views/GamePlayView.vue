<template>
  <div class="gp-page">
    <AppHeader :title="gameName" back />
    <div class="gp-body">
      <div class="gp-opponent">
        <AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="38" />
        <div class="gp-op-main">
          <span class="gp-op-name">{{ opponent.name }}</span>
          <span class="gp-op-sub">{{ fromInvite ? '受邀对战中' : '对手' }}</span>
        </div>
        <span class="gp-op-tag">{{ kindTag }}</span>
      </div>

      <component :is="comp" :key="roundKey" :opponent="opponent" :my-avatar="myAvatar" @over="onOver" />
    </div>

    <!-- 结算弹窗 -->
    <div v-if="result" class="gp-mask" @click.self="result = null">
      <div class="gp-result">
        <div class="gp-res-emoji">{{ result.win ? '🎉' : result.tie ? '🤝' : '😵' }}</div>
        <h3 class="gp-res-title">{{ resultTitle }}</h3>
        <p v-if="result.detail" class="gp-res-detail">{{ result.detail }}</p>
        <p class="gp-res-react">{{ reaction }}</p>
        <div class="gp-res-btns">
          <button class="md-btn primary" @click="again">再来一局</button>
          <button class="md-btn ghost" @click="back">返回大厅</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, defineAsyncComponent, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useContactsStore } from '@/stores/contacts'
import { getDesktop, getContacts } from '@/api/contacts'
import { getGameName, getActiveGame, endGame } from '@/api/games'
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

const opponent = ref({ id: 0, name: '对方', avatar: '' })
const myAvatar = ref('')
const fromInvite = ref(false)
const result = ref(null)
const roundKey = ref(0)

/* 路由变化（换游戏/换对手）时重开一局，避免停留在上一局的终局状态 */
watch(() => route.fullPath, () => {
  result.value = null
  roundKey.value += 1
  loadOpponent()
})

const resultTitle = computed(() => {
  if (!result.value) return ''
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
  /* 离开对局页时把已接受的对局邀请标记为已结束（聊天卡片显示「已结束」） */
  if (fromInvite.value && opponent.value.id) {
    getActiveGame(opponent.value.id)
      .then((inv) => { if (inv) return endGame(inv.id).catch(() => {}) })
      .catch(() => {})
  }
})

async function onOver(r) {
  result.value = r || { win: false }
  const pool = r?.tie ? REACT_TIE : r?.win ? REACT_WIN : REACT_LOSE
  reaction.value = pool[Math.floor(Math.random() * pool.length)]
  /* 纪录：翻牌记最少回合；其余记累计胜场（猜数的纪录在组件内处理） */
  try {
    if (kind.value === 'memory' && r?.rounds) {
      await save('memory', { value: r.rounds }, { lowerBetter: true })
    } else if (r?.win) {
      await save(kind.value, {}, { countKey: 'wins' })
    }
  } catch (e) { /* 纪录失败不影响对局 */ }
}

function again() {
  result.value = null
  roundKey.value += 1
}

function back() {
  router.push('/game')
}
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
  width: 100%; max-width: 300px; background: var(--bg); border-radius: 18px; padding: 26px 20px 20px;
  text-align: center; border: 1px solid var(--border);
}
.gp-res-emoji { font-size: 46px; line-height: 1; }
.gp-res-title { font-size: 18px; color: var(--text); margin: 12px 0 6px; }
.gp-res-detail { font-size: 14px; color: var(--accent); font-weight: 600; }
.gp-res-react { font-size: 12px; color: var(--text-soft); margin: 10px 0 18px; line-height: 1.5; }
.gp-res-btns { display: flex; gap: 10px; }
.gp-res-btns .md-btn { flex: 1; }
</style>
