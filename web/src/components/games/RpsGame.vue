<template>
  <div class="rp-wrap">
    <div class="rp-bar">
      <span class="rp-side" :class="{ on: !over }"><AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="20" />{{ opponent.name }} <b>{{ aiScore }}</b></span>
      <span class="rp-round">第 {{ round }} 局</span>
      <span class="rp-side" :class="{ on: !over }"><b>{{ myScore }}</b> 我<AppAvatar :name="'我'" :avatar="myAvatar" :size="20" /></span>
    </div>

    <!-- 手势区与比分条同向：对方在左、我在右 -->
    <div class="rp-stage">
      <div class="rp-hand" :class="{ shake: revealing }">{{ aiFace }}</div>
      <span class="rp-vs">VS</span>
      <div class="rp-hand" :class="{ shake: revealing }">{{ myFace }}</div>
    </div>
    <p class="rp-status">{{ statusText }}</p>

    <div class="rp-opts">
      <button v-for="(f, i) in faces" :key="i" class="rp-opt" :disabled="over || revealing" @click="choose(i)">
        <span class="rp-emoji">{{ f.emoji }}</span>
        <span class="rp-name">{{ f.name }}</span>
      </button>
    </div>
    <p class="rp-log">{{ logText }}</p>
    <div class="rp-btns">
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'

/* 猜拳：三局两胜。出拳后有短暂摇拳动画再亮拳，对方随机出拳。 */
const FACES = [
  { emoji: '✊', name: '石头' },
  { emoji: '✋', name: '布' },
  { emoji: '✌️', name: '剪刀' }
]
/* 我出 i 对 对方出 j：0 我胜，1 平，2 我负 */
const BEATS = { '0-2': 0, '2-0': 2, '1-0': 0, '0-1': 2, '2-1': 0, '1-2': 2 }

const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' }
})
const emit = defineEmits(['over'])

const myChoice = ref(-1)
const aiChoice = ref(-1)
const myScore = ref(0)
const aiScore = ref(0)
const round = ref(1)
const revealing = ref(false)
const over = ref(false)
const logText = ref('出拳吧！')

const myFace = computed(() => (revealing.value || myChoice.value < 0 ? '✊' : FACES[myChoice.value].emoji))
const aiFace = computed(() => (revealing.value || aiChoice.value < 0 ? '✊' : FACES[aiChoice.value].emoji))
const statusText = computed(() => {
  if (over.value) return resultText.value
  if (revealing.value) return '亮拳中…'
  return `第 ${round.value} 局 · ${myScore.value} : ${aiScore.value}`
})
const resultText = ref('')
const faces = FACES

function restart() {
  myChoice.value = -1
  aiChoice.value = -1
  myScore.value = 0
  aiScore.value = 0
  round.value = 1
  revealing.value = false
  over.value = false
  logText.value = '出拳吧！'
}

function choose(i) {
  if (over.value || revealing.value) return
  myChoice.value = i
  revealing.value = true
  setTimeout(() => {
    const j = Math.floor(Math.random() * 3)
    aiChoice.value = j
    revealing.value = false
    if (i === j) {
      logText.value = `都出了${FACES[i].name}，平局，再猜一次`
      return
    }
    const res = BEATS[`${i}-${j}`]
    if (res === 0) {
      myScore.value += 1
      logText.value = `你的${FACES[i].name}赢了对方的${FACES[j].name}！`
    } else {
      aiScore.value += 1
      logText.value = `对方的${FACES[j].name}赢了你的${FACES[i].name}`
    }
    if (myScore.value === 2 || aiScore.value === 2) {
      over.value = true
      const win = myScore.value === 2
      resultText.value = win ? '三局两胜，你赢了！' : '三局两胜，对方赢了'
      emit('over', { win, title: win ? '胜利' : '失利', detail: `${myScore.value} : ${aiScore.value}` })
      return
    }
    round.value += 1
  }, 550)
}

defineExpose({ restart })
restart()
</script>

<style scoped>
.rp-bar { display: flex; align-items: center; justify-content: space-between; }
.rp-side { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-soft); }
.rp-side b { font-size: 16px; color: var(--text); }
.rp-round { font-size: 12px; color: var(--text-soft); }
.rp-stage { display: flex; align-items: center; justify-content: center; gap: 26px; padding: 26px 0 8px; }
.rp-hand { font-size: 52px; line-height: 1; }
.rp-hand.shake { animation: rp-shake 0.16s infinite; }
@keyframes rp-shake {
  0%, 100% { transform: translateY(0) rotate(-6deg); }
  50% { transform: translateY(-8px) rotate(6deg); }
}
.rp-vs { font-size: 13px; color: var(--text-soft); font-weight: 700; }
.rp-status { text-align: center; font-size: 14px; color: var(--accent); font-weight: 600; margin: 8px 0 14px; }
.rp-opts { display: flex; justify-content: center; gap: 12px; }
.rp-opt {
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 16px;
  border: 1px solid var(--border); border-radius: 14px; background: var(--bg-soft);
}
.rp-opt:not(:disabled):active { transform: scale(0.95); }
.rp-opt:disabled { opacity: 0.6; }
.rp-emoji { font-size: 28px; }
.rp-name { font-size: 12px; color: var(--text-soft); }
.rp-log { text-align: center; font-size: 12px; color: var(--text-soft); margin: 14px 0 10px; min-height: 16px; }
.rp-btns { display: flex; justify-content: center; }
</style>
