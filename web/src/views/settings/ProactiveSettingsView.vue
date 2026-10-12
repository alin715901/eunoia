<template>
  <div class="sp-view">
    <AppHeader title="主动消息" back />
    <div class="sp-body">
      <div class="panel sec row-between">
        <div class="row-main">
          <div class="row-title">主动消息</div>
          <p class="hint">开启后对方会时不时主动给你发消息</p>
        </div>
        <ToggleSwitch v-model="enabled" @update:modelValue="queueSave" />
      </div>

      <div class="panel sec row-between">
        <div class="row-main">
          <div class="row-title">对方撤回消息</div>
          <p class="hint">开启后，对方发出的消息有小概率（10%）撤回</p>
        </div>
        <ToggleSwitch v-model="recallEnabled" @update:modelValue="queueSave" />
      </div>

      <template v-if="enabled">
        <div class="panel sec">
          <div class="sec-title">主动消息条数</div>
          <DualRangeInput
            v-model:lo="countLo"
            v-model:hi="countHi"
            :min="1"
            :max="10"
            unit="条"
            @update:lo="queueSave"
            @update:hi="queueSave"
          />
          <p class="hint">每次主动发 {{ countLo }} ~ {{ countHi }} 条，最多10条</p>
        </div>

        <div class="panel sec">
          <div class="sec-title">主动消息间隔</div>
          <DualRangeInput
            v-model:lo="gapLo"
            v-model:hi="gapHi"
            :min="gapBounds.min"
            :max="gapBounds.max"
            :unit="gapUnit"
            @update:lo="queueSave"
            @update:hi="queueSave"
          />
          <div class="chips">
            <button
              v-for="u in GAP_UNITS"
              :key="u"
              class="chip"
              :class="{ on: gapUnit === u }"
              @click="switchGapUnit(u)"
            >{{ u }}</button>
          </div>
          <p class="hint">两次主动消息之间间隔多久（当前 {{ gapMinutes[0] }} ~ {{ gapMinutes[1] }} 分钟）</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import DualRangeInput from '@/components/common/DualRangeInput.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch } = useContactSettingsPage(props.id)

const enabled = ref(false)
const recallEnabled = ref(false)
const countLo = ref(1)
const countHi = ref(3)

/* 间隔：存分钟，界面可选 分钟/小时 */
const GAP_UNITS = ['分钟', '小时']
const gapUnit = ref('分钟')
const gapLo = ref(30)
const gapHi = ref(180)
const gapBounds = computed(() => ({ min: 1, max: gapUnit.value === '分钟' ? 1440 : 168 }))
const gapMinutes = computed(() => {
  const f = gapUnit.value === '小时' ? 60 : 1
  return [Math.round(gapLo.value * f), Math.round(gapHi.value * f)]
})
function switchGapUnit(u) {
  if (u === gapUnit.value) return
  const mins = gapMinutes.value
  gapUnit.value = u
  const f = u === '小时' ? 60 : 1
  gapLo.value = Math.round((mins[0] / f) * 10) / 10
  gapHi.value = Math.round((mins[1] / f) * 10) / 10
  queueSave()
}

async function doSave() {
  try {
    await patch({
      proactive_enabled: enabled.value ? 1 : 0,
      contact_recall_enabled: recallEnabled.value ? 1 : 0,
      proactive_count_min: countLo.value,
      proactive_count_max: countHi.value,
      proactive_interval_min: gapMinutes.value[0],
      proactive_interval_max: gapMinutes.value[1]
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
  enabled.value = !!Number(s.proactive_enabled)
  recallEnabled.value = !!Number(s.contact_recall_enabled)
  countLo.value = Number(s.proactive_count_min ?? s.proactive_count ?? 1)
  countHi.value = Number(s.proactive_count_max ?? s.proactive_count ?? 3)
  const lo = Number(s.proactive_interval_min ?? 30)
  const hi = Number(s.proactive_interval_max ?? 180)
  gapUnit.value = hi >= 60 ? '小时' : '分钟'
  const f = gapUnit.value === '小时' ? 60 : 1
  gapLo.value = Math.round((lo / f) * 10) / 10
  gapHi.value = Math.round((hi / f) * 10) / 10
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
.chips { display: flex; gap: 8px; margin-top: 10px; }
.chip { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 6px 14px; font-size: 12px; color: var(--text); }
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
</style>
