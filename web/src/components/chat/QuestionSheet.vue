<template>
  <!-- 提问面板：单选 / 多选 / 问答（自由输入），确认后发送提问卡片 -->
  <Teleport to="body">
    <div v-if="show" class="qs-mask" @click="$emit('close')">
      <div class="qs-sheet" @click.stop>
        <div class="qs-head">
          <span class="qs-title">提问</span>
          <button class="qs-close" @click="$emit('close')">✕</button>
        </div>

        <!-- 提问形式切换 -->
        <div class="qs-tabs">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="qs-tab"
            :class="{ active: type === t.key }"
            @click="type = t.key"
          >
            {{ t.label }}
          </button>
        </div>

        <textarea
          v-model="question"
          class="qs-question"
          rows="2"
          placeholder="输入你的问题…"
          maxlength="200"
        ></textarea>

        <!-- 单选/多选：预设选项（对方随机抽字卡回应） -->
        <div v-if="type !== 'qa'" class="qs-options">
          <div v-for="(o, i) in options" :key="i" class="qs-opt-row">
            <span class="qs-opt-letter">{{ letters[i] }}</span>
            <input v-model="options[i]" class="qs-opt-input" placeholder="选项内容" maxlength="50" />
            <button v-if="options.length > 2" class="qs-opt-del" @click="options.splice(i, 1)">✕</button>
          </div>
          <button v-if="options.length < 6" class="qs-add" @click="options.push('')">＋ 添加选项</button>
        </div>
        <p v-else class="qs-hint">对方将随机抽字卡回应你的问题</p>

        <p v-if="err" class="qs-err">{{ err }}</p>

        <button class="qs-confirm" :disabled="!valid" @click="confirm">发送提问</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'send'])

const tabs = [
  { key: 'single', label: '单选' },
  { key: 'multi', label: '多选' },
  { key: 'qa', label: '问答' }
]
const letters = ['A', 'B', 'C', 'D', 'E', 'F']

const type = ref('single')
const question = ref('')
const options = ref(['', ''])
const err = ref('')

watch(
  () => props.show,
  (v) => {
    if (v) {
      type.value = 'single'
      question.value = ''
      options.value = ['', '']
      err.value = ''
    }
  }
)

const valid = computed(() => {
  if (!question.value.trim()) return false
  if (type.value === 'qa') return true
  return options.value.filter((o) => o.trim()).length >= 2
})

function confirm() {
  if (!valid.value) return
  err.value = ''
  emit('send', {
    type: type.value,
    question: question.value.trim(),
    options: type.value === 'qa' ? [] : options.value.map((o) => o.trim()).filter(Boolean)
  })
}
</script>

<style scoped>
.qs-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(0, 0, 0, 0.4);
  animation: qs-fade 0.2s ease;
}
.qs-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-screen);
  border-radius: 20px 20px 0 0;
  padding: 18px 20px calc(24px + env(safe-area-inset-bottom));
  animation: qs-up 0.25s ease;
}
@keyframes qs-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes qs-up { from { transform: translateY(40%); } to { transform: translateY(0); } }

.qs-head {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}
.qs-title { font-size: 17px; font-weight: 700; color: var(--text); }
.qs-close {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 16px;
  width: 28px;
  height: 28px;
}

.qs-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.qs-tab {
  flex: 1;
  padding: 9px 0;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  background: var(--bg-soft);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-soft);
}
.qs-tab.active {
  border-color: #f2bd76;
  background: #fdf6ea;
  color: #d99a3d;
}

.qs-question {
  width: 100%;
  box-sizing: border-box;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
  padding: 10px 12px;
  font-size: 15px;
  color: var(--text);
  resize: none;
  outline: none;
}
.qs-question:focus { border-color: #f2bd76; }

.qs-options { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.qs-opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  padding: 0 10px;
  background: var(--bg-soft);
}
.qs-opt-row:focus-within { border-color: #f2bd76; }
.qs-opt-letter { font-size: 13px; font-weight: 700; color: #d99a3d; }
.qs-opt-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 10px 0;
  font-size: 14px;
  color: var(--text);
}
.qs-opt-del {
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 13px;
  width: 24px;
  height: 24px;
}
.qs-add {
  align-self: flex-start;
  border: none;
  background: transparent;
  color: #d99a3d;
  font-size: 13px;
  font-weight: 600;
  padding: 4px 2px;
}
.qs-hint { margin-top: 12px; font-size: 12px; color: var(--text-soft); text-align: center; }
.qs-err { margin: 8px 2px 0; font-size: 12px; color: #e56a87; }

.qs-confirm {
  width: 100%;
  margin-top: 16px;
  border: none;
  border-radius: 999px;
  padding: 14px 0;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #f8d9a8, #f2bd76);
  color: #7a5a22;
}
.qs-confirm:disabled { opacity: 0.45; }
</style>
