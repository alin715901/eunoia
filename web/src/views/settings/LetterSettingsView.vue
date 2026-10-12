<template>
  <div class="sp-view">
    <AppHeader title="信件设置" back />
    <div class="sp-body">
      <div class="panel sec row-between">
        <div class="row-main">
          <div class="row-title">主动寄信</div>
        </div>
        <ToggleSwitch v-model="letterEnabled" @update:modelValue="queueSave" />
      </div>

      <div v-if="letterEnabled" class="panel sec">
        <div class="sec-title">寄信频率</div>
        <DualRangeInput
          v-model:lo="weekLo"
          v-model:hi="weekHi"
          :min="0"
          :max="14"
          unit="封/周"
          @update:lo="queueSave"
          @update:hi="queueSave"
        />
        <p class="hint">每周寄 {{ weekLo }} ~ {{ weekHi }} 封，最多14封</p>
      </div>

      <div class="panel sec">
        <div class="sec-title">信件句数</div>
        <DualRangeInput
          v-model:lo="sentLo"
          v-model:hi="sentHi"
          :min="1"
          :max="50"
          unit="句"
          @update:lo="queueSave"
          @update:hi="queueSave"
        />
        <p class="hint">每封 {{ sentLo }} ~ {{ sentHi }} 句，最多50句</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import DualRangeInput from '@/components/common/DualRangeInput.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch } = useContactSettingsPage(props.id)

const letterEnabled = ref(false)
const weekLo = ref(0)
const weekHi = ref(1)
const sentLo = ref(3)
const sentHi = ref(8)

async function doSave() {
  try {
    await patch({
      letter_enabled: letterEnabled.value ? 1 : 0,
      letter_week_min: weekLo.value,
      letter_week_max: weekHi.value,
      letter_sentences_min: sentLo.value,
      letter_sentences_max: sentHi.value
    })
  } catch (e) {
    notify('保存失败：' + e.message)
  }
}
function queueSave() {
  clearTimeout(doSave._t)
  doSave._t = setTimeout(doSave, 450)
}

onMounted(async () => {
  const s = await load()
  if (!s) return
  letterEnabled.value = !!Number(s.letter_enabled)
  weekLo.value = Number(s.letter_week_min ?? 0)
  weekHi.value = Number(s.letter_week_max ?? 1)
  sentLo.value = Number(s.letter_sentences_min ?? 3)
  sentHi.value = Number(s.letter_sentences_max ?? 8)
})
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.row-main { flex: 1 1 auto; min-width: 0; }
.row-title { font-size: 14px; font-weight: 600; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 8px 0 0; }
</style>
