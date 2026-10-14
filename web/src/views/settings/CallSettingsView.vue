<template>
  <div class="cs-view">
    <AppHeader title="通话设置" back />
    <div class="cs-body">
      <!-- 主动来电开关 -->
      <div class="panel sec">
        <div class="switch-row">
          <div class="row-main">
            <div class="row-title">对方主动来电</div>
            <p class="hint">开启后，对方每小时按下方概率主动打电话给你</p>
          </div>
          <ToggleSwitch v-model="callEnabled" @update:modelValue="saveEnabled" />
        </div>
      </div>

      <!-- 概率设置 -->
      <div class="panel nav-panel">
        <div class="prob-row" v-for="p in probs" :key="p.key">
          <div class="prob-head">
            <span class="prob-label">{{ p.label }}</span>
            <span class="prob-val">{{ model[p.key] }}%</span>
          </div>
          <input
            class="prob-range"
            type="range"
            min="0"
            max="100"
            step="1"
            v-model.number="model[p.key]"
            @change="onProbChange(p.key)"
          />
        </div>
      </div>

      <p class="tip">
        提示：接听概率与拒听概率合计 100%（调一个另一个自动补齐）；挂断概率是正在通话时对方挂断的概率，若挂断则时刻在 3 秒 ~ 2 小时之间均匀随机（只接几秒、十几秒就挂，或通话几分钟、几小时后才挂，都有可能且概率均等）；主动来电概率是<b>每小时</b>对方主动来电的概率。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onActivated } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { getContactSettings, updateContactSettings } from '@/api/contacts'
import { notify } from '@/utils/dialog'

const route = useRoute()
const id = route.params.id

const callEnabled = ref(false)
const model = reactive({
  call_incoming_prob: 10,
  call_answer_prob: 85,
  call_reject_prob: 10,
  call_hangup_prob: 10
})

const probs = [
  { key: 'call_incoming_prob', label: '主动来电概率（每小时）' },
  { key: 'call_answer_prob', label: '接听电话概率' },
  { key: 'call_reject_prob', label: '拒绝接听概率' },
  { key: 'call_hangup_prob', label: '挂断电话概率' }
]

async function load() {
  try {
    const s = await getContactSettings(id)
    callEnabled.value = !!Number(s.call_enabled)
    if (s.call_incoming_prob != null) model.call_incoming_prob = Number(s.call_incoming_prob)
    if (s.call_answer_prob != null) model.call_answer_prob = Number(s.call_answer_prob)
    if (s.call_reject_prob != null) model.call_reject_prob = Number(s.call_reject_prob)
    if (s.call_hangup_prob != null) model.call_hangup_prob = Number(s.call_hangup_prob)
  } catch (e) { /* ignore */ }
}

async function saveEnabled() {
  try {
    await updateContactSettings(id, { call_enabled: callEnabled.value ? 1 : 0 })
    notify(callEnabled.value ? '已开启对方主动来电' : '已关闭对方主动来电')
  } catch (e) { notify('保存失败：' + e.message) }
}

/* 概率调整：接听与拒听合计 100%，调一个另一个自动补齐；四个滑杆改动都即时保存 */
function onProbChange(key) {
  if (key === 'call_answer_prob') model.call_reject_prob = 100 - Number(model.call_answer_prob || 0)
  if (key === 'call_reject_prob') model.call_answer_prob = 100 - Number(model.call_reject_prob || 0)
  save(key)
}
async function save(key) {
  try {
    const payload = { [key]: Number(model[key]) }
    // 接听/拒听成对提交，保证服务端两条始终合计 100
    if (key === 'call_answer_prob') payload.call_reject_prob = Number(model.call_reject_prob)
    if (key === 'call_reject_prob') payload.call_answer_prob = Number(model.call_answer_prob)
    await updateContactSettings(id, payload)
  } catch (e) { notify('保存失败：' + e.message) }
}

load()
onActivated(load)
</script>

<style scoped>
.cs-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.cs-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 6px 14px; }
.switch-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
.row-main { flex: 1 1 auto; min-width: 0; }
.row-title { font-size: 15px; font-weight: 600; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 3px 0 0; }

.nav-panel { padding: 10px 14px; display: flex; flex-direction: column; }
.prob-row { padding: 8px 0; }
.prob-row + .prob-row { border-top: 1px solid var(--border); }
.prob-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.prob-label { font-size: 14px; font-weight: 600; color: var(--text); }
.prob-val { font-size: 13px; color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.prob-range { width: 100%; accent-color: var(--accent); }

.tip { font-size: 11px; color: var(--text-soft); line-height: 1.6; padding: 0 4px; }
</style>
