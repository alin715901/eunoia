<template>
  <div class="gn-wrap">
    <div class="gn-bar">
      <span class="gn-side"><AppAvatar :name="opponent.name" :avatar="opponent.avatar" :size="22" />{{ opponent.name }} 想好了一个数</span>
      <span class="gn-range">范围 {{ lo }} ~ {{ hi }}</span>
      <span class="gn-side">我<AppAvatar :name="'我'" :avatar="myAvatar" :size="22" /></span>
    </div>

    <div class="gn-mid">
      <div class="gn-big">{{ guessFace }}</div>
      <p class="gn-status">{{ statusText }}</p>
    </div>

    <div class="gn-input">
      <input v-model="input" type="number" :min="lo" :max="hi" :disabled="over" placeholder="输入 1-100 的整数" @keyup.enter="submit" />
      <button class="md-btn primary" :disabled="over || !input" @click="submit">猜</button>
    </div>

    <div class="gn-history" v-if="history.length">
      <div v-for="(h, i) in history" :key="i" class="gn-row" :class="h.hint">
        <span class="gn-num">{{ h.value }}</span>
        <span class="gn-hint">{{ h.hint === 'up' ? '小了 ↑' : h.hint === 'down' ? '大了 ↓' : '猜中了！' }}</span>
      </div>
    </div>

    <p class="gn-best" v-if="best">你的最佳纪录：{{ best.value }} 次猜中</p>
    <div class="gn-btns">
      <button class="md-btn ghost" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useGameRecords } from '@/composables/useGameRecords'

/* 猜数：对方想好 1-100 的一个数，你来猜，每次反馈大了/小了，次数越少越厉害。 */
const props = defineProps({
  opponent: { type: Object, default: () => ({ name: '对方', avatar: '' }) },
  myAvatar: { type: String, default: '' }
})
const emit = defineEmits(['over'])

const { bestOf, save } = useGameRecords()
const secret = ref(0)
const lo = ref(1)
const hi = ref(100)
const input = ref('')
const attempts = ref(0)
const history = ref([])
const over = ref(false)
const best = ref(null)

const guessFace = computed(() => (over.value ? '🎉' : attempts.value === 0 ? '🤔' : '🧐'))
const statusText = computed(() => {
  if (over.value) return resultText.value
  return `你已经猜了 ${attempts.value} 次`
})
const resultText = ref('')

function restart() {
  secret.value = 1 + Math.floor(Math.random() * 100)
  lo.value = 1
  hi.value = 100
  input.value = ''
  attempts.value = 0
  history.value = []
  over.value = false
  resultText.value = ''
}

async function submit() {
  if (over.value || !input.value) return
  const v = Number(input.value)
  if (!Number.isInteger(v) || v < lo.value || v > hi.value) return
  attempts.value += 1
  input.value = ''
  if (v === secret.value) {
    history.value.unshift({ value: v, hint: 'hit' })
    over.value = true
    const win = attempts.value <= 7
    resultText.value = `猜中了！用了 ${attempts.value} 次${win ? '，神算子！' : ''}`
    const r = await save('guess', { value: attempts.value }, { lowerBetter: true })
    if (r === 'new') {
      await bestOf('guess').then((b) => { best.value = b })
    }
    emit('over', { win, title: win ? '猜中了' : '失利', detail: `${attempts.value} 次` })
    return
  }
  const hint = v < secret.value ? 'up' : 'down'
  if (v < secret.value) lo.value = Math.max(lo.value, v + 1)
  else hi.value = Math.min(hi.value, v - 1)
  history.value.unshift({ value: v, hint })
}

onMounted(async () => {
  best.value = await bestOf('guess')
})
defineExpose({ restart })
restart()
</script>

<style scoped>
.gn-bar { display: flex; align-items: center; justify-content: space-between; }
.gn-side { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-soft); }
.gn-range { font-size: 12px; color: var(--accent); font-weight: 600; }
.gn-mid { text-align: center; padding: 18px 0 6px; }
.gn-big { font-size: 56px; line-height: 1; }
.gn-status { font-size: 14px; color: var(--accent); font-weight: 600; margin-top: 10px; }
.gn-input { display: flex; gap: 10px; margin-top: 14px; }
.gn-input input {
  flex: 1; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-soft);
  padding: 10px 14px; font-size: 15px; color: var(--text); outline: none;
}
.gn-input input:focus { border-color: var(--accent); }
.gn-history { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; max-height: 168px; overflow: auto; }
.gn-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 7px 12px; border-radius: 10px; background: var(--bg-soft); }
.gn-row.up { color: #4caf50; }
.gn-row.down { color: #ff7043; }
.gn-row.hit { color: var(--accent); font-weight: 700; }
.gn-num { min-width: 34px; font-weight: 700; }
.gn-best { text-align: center; font-size: 12px; color: var(--text-soft); margin-top: 12px; }
.gn-btns { display: flex; justify-content: center; margin-top: 10px; }
</style>
