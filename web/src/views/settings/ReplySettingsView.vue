<template>
  <div class="sp-view">
    <AppHeader title="回复设置" back />
    <div class="sp-body">
      <!-- 回复时长 -->
      <div class="panel sec">
        <div class="sec-title">对方回复时长</div>
        <DualRangeInput
          v-model:lo="delayLo"
          v-model:hi="delayHi"
          :min="delayBounds.min"
          :max="delayBounds.max"
          :step="0.5"
          :unit="delayUnit"
          @update:lo="queueSave"
          @update:hi="queueSave"
        />
        <div class="chips">
          <button
            v-for="u in DELAY_UNITS"
            :key="u"
            class="chip"
            :class="{ on: delayUnit === u }"
            @click="switchDelayUnit(u)"
          >{{ u }}</button>
        </div>
      </div>

      <!-- 回复条数：滑块 + 数字框（参考大类概率分配样式） -->
      <div class="panel sec">
        <div class="sec-title">回复条数</div>
        <div class="prob-row">
          <span class="p-label">最短</span>
          <input class="p-range" type="range" min="1" max="7" step="1"
            v-model.number="countLo" @input="clampCount(); queueSave" />
          <input class="p-num" type="number" min="1" max="7"
            v-model.number="countLo" @change="clampCount(); queueSave()" />
        </div>
        <div class="prob-row">
          <span class="p-label">最长</span>
          <input class="p-range" type="range" min="1" max="7" step="1"
            v-model.number="countHi" @input="clampCount(); queueSave" />
          <input class="p-num" type="number" min="1" max="7"
            v-model.number="countHi" @change="clampCount(); queueSave()" />
        </div>
        <p class="hint">每次回复的条数范围（{{ countLo }} ~ {{ countHi }} 条）</p>
      </div>

      <!-- 拼字卡：把多张字卡拼成一条消息发 -->
      <div class="panel sec row-between">
        <div class="row-main">
          <div class="row-title">拼字卡</div>
          <p class="hint">开启后，对方会抽多张字卡，拼成一条消息回复</p>
        </div>
        <ToggleSwitch v-model="mergeOn" @update:modelValue="queueSave" />
      </div>

      <div v-if="mergeOn" class="panel sec">
        <div class="sec-title">拼字卡数量</div>
        <div class="prob-row">
          <span class="p-label">最短</span>
          <input class="p-range" type="range" min="1" max="20" step="1"
            v-model.number="mergeLo" @input="clampMerge(); queueSave" />
          <input class="p-num" type="number" min="1" max="20"
            v-model.number="mergeLo" @change="clampMerge(); queueSave()" />
        </div>
        <div class="prob-row">
          <span class="p-label">最长</span>
          <input class="p-range" type="range" min="1" max="20" step="1"
            v-model.number="mergeHi" @input="clampMerge(); queueSave" />
          <input class="p-num" type="number" min="1" max="20"
            v-model.number="mergeHi" @change="clampMerge(); queueSave()" />
        </div>
        <p class="hint">每次回复抽 {{ mergeLo }} ~ {{ mergeHi }} 张字卡，拼成一条消息</p>
      </div>

      <!-- 回答问题时长：对方回答「提问」时的回复速度（与「回复时长」区分） -->
      <div class="panel sec">
        <div class="sec-title">回答问题时长</div>
        <DualRangeInput
          v-model:lo="ansDelayLo"
          v-model:hi="ansDelayHi"
          :min="ansDelayBounds.min"
          :max="ansDelayBounds.max"
          :step="0.5"
          :unit="ansDelayUnit"
          @update:lo="queueSave"
          @update:hi="queueSave"
        />
        <div class="chips">
          <button
            v-for="u in DELAY_UNITS"
            :key="u"
            class="chip"
            :class="{ on: ansDelayUnit === u }"
            @click="switchAnsDelayUnit(u)"
          >{{ u }}</button>
        </div>
        <p class="hint">对方回答你「提问」时的思考时长</p>
      </div>

      <!-- 大类概率分配 -->
      <div class="panel sec">
        <div class="sec-title row-between">
          <span>大类概率分配</span>
          <span class="sum" :class="{ warn: sum !== 100 }">合计 {{ sum }}%</span>
        </div>
        <div v-for="c in CATS" :key="c.k" class="prob-row">
          <span class="p-label">{{ c.n }}</span>
          <input
            class="p-range"
            type="range"
            min="0"
            max="100"
            step="5"
            v-model.number="weights[c.k]"
            @input="queueSave"
          />
          <input
            class="p-num"
            type="number"
            min="0"
            max="100"
            v-model.number="weights[c.k]"
            @change="queueSave"
          />
        </div>
        <div class="prob-actions">
          <span class="hint warn-text" v-if="sum > 100">合计已超过 100%</span>
          <span v-else></span>
          <button class="mini-btn" @click="evenly">平均分配</button>
        </div>
      </div>

      <!-- 通用字卡库占比：抽卡时「通用库」相对「专属库」的权重 -->
      <div class="panel sec">
        <div class="sec-title row-between">
          <span>通用字卡库占比</span>
          <span class="sum">{{ genRatio }}%</span>
        </div>
        <div class="prob-row">
          <span class="p-label">通用库</span>
          <input
            class="p-range"
            type="range"
            min="0"
            max="100"
            step="5"
            v-model.number="genRatio"
            @input="queueSave"
          />
          <input
            class="p-num"
            type="number"
            min="0"
            max="100"
            v-model.number="genRatio"
            @change="queueSave"
          />
        </div>
        <p class="hint">100% = 只用通用库，0% = 只用专属库</p>
      </div>

      <!-- 已读标识：开关 + 样式选择（已读文字 / 对勾） -->
      <div class="panel sec">
        <div class="row-between">
          <div class="row-main">
            <div class="row-title">已读标识</div>
          </div>
          <ToggleSwitch v-model="showRead" @update:modelValue="queueSave" />
        </div>
        <template v-if="showRead">
          <div class="chips" style="margin-top: 12px">
            <button class="chip" :class="{ on: readStyle === 'text' }" @click="pickStyle('text')">文字</button>
            <button class="chip" :class="{ on: readStyle === 'check' }" @click="pickStyle('check')">对勾</button>
          </div>
        </template>
      </div>

      <!-- 已读不回（按概率） -->
      <div class="panel sec row-between">
        <div class="row-main">
          <div class="row-title">已读不回</div>
          <p class="hint">开启后，对方有20%的概率已读不回</p>
        </div>
        <ToggleSwitch v-model="readNoReply" @update:modelValue="queueSave" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import DualRangeInput from '@/components/common/DualRangeInput.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch } = useContactSettingsPage(props.id)

/* ── 回复时长：存秒，界面可选 秒/分钟/小时 ── */
const DELAY_UNITS = ['秒', '分钟', '小时']
const FACTOR = { 秒: 1, 分钟: 60, 小时: 3600 }
const delayUnit = ref('秒')
const delayLo = ref(1)
const delayHi = ref(5)
const delayBounds = computed(() => ({
  min: 0,
  max: delayUnit.value === '秒' ? 7200 : delayUnit.value === '分钟' ? 120 : 48
}))
const delaySeconds = computed(() => {
  const f = FACTOR[delayUnit.value]
  return [Math.round(delayLo.value * f), Math.round(delayHi.value * f)]
})
function switchDelayUnit(u) {
  if (u === delayUnit.value) return
  const secs = delaySeconds.value
  delayUnit.value = u
  const f = FACTOR[u]
  delayLo.value = Math.round((secs[0] / f) * 10) / 10
  delayHi.value = Math.round((secs[1] / f) * 10) / 10
  queueSave()
}

/* ── 回答问题时长：存秒，界面可选 秒/分钟/小时（与回复时长同一套单位逻辑） ── */
const ansDelayUnit = ref('秒')
const ansDelayLo = ref(1)
const ansDelayHi = ref(5)
const ansDelayBounds = computed(() => ({
  min: 0,
  max: ansDelayUnit.value === '秒' ? 7200 : ansDelayUnit.value === '分钟' ? 120 : 48
}))
const ansDelaySeconds = computed(() => {
  const f = FACTOR[ansDelayUnit.value]
  return [Math.round(ansDelayLo.value * f), Math.round(ansDelayHi.value * f)]
})
function switchAnsDelayUnit(u) {
  if (u === ansDelayUnit.value) return
  const secs = ansDelaySeconds.value
  ansDelayUnit.value = u
  const f = FACTOR[u]
  ansDelayLo.value = Math.round((secs[0] / f) * 10) / 10
  ansDelayHi.value = Math.round((secs[1] / f) * 10) / 10
  queueSave()
}

/* ── 回复条数 ── */
const countLo = ref(1)
const countHi = ref(3)
function clampCount() {
  countLo.value = Math.min(7, Math.max(1, Math.round(Number(countLo.value) || 1)))
  countHi.value = Math.min(7, Math.max(countLo.value, Math.round(Number(countHi.value) || 1)))
}

/* ── 拼字卡：抽 N 张合成一条 ── */
const mergeOn = ref(false)
const mergeLo = ref(1)
const mergeHi = ref(3)
function clampMerge() {
  mergeLo.value = Math.min(20, Math.max(1, Math.round(Number(mergeLo.value) || 1)))
  mergeHi.value = Math.min(20, Math.max(mergeLo.value, Math.round(Number(mergeHi.value) || 1)))
}

/* ── 大类概率分配 ── */
const CATS = [
  { k: 'main', n: '主字卡' },
  { k: 'emoji', n: 'emoji' },
  { k: 'kaomoji', n: '颜文字' },
  { k: 'image', n: '图片' },
  { k: 'sticker', n: '表情包' },
  { k: 'voice', n: '语音字卡' }
]
const weights = reactive({ main: 40, emoji: 30, kaomoji: 30, image: 0, sticker: 0, voice: 0 })
// 通用字卡库占比（抽卡时通用库 vs 专属库的权重，0~100，默认 70）
const genRatio = ref(70)
const sum = computed(() => CATS.reduce((s, c) => s + (Number(weights[c.k]) || 0), 0))
function evenly() {
  // 平均分配：100 / 6 ≈ 16.67 → 取整后再把余数补给前几项
  const base = Math.floor(100 / CATS.length)
  let rest = 100 - base * CATS.length
  for (const c of CATS) {
    weights[c.k] = base + (rest-- > 0 ? 1 : 0)
  }
  queueSave()
}
function parseWeights(raw) {
  let obj = {}
  if (typeof raw === 'string') { try { obj = JSON.parse(raw) } catch (e) { obj = {} } }
  else if (raw && typeof raw === 'object') obj = raw
  for (const c of CATS) weights[c.k] = Math.max(0, Number(obj[c.k] ?? { main: 40, emoji: 30, kaomoji: 30 }[c.k]) || 0)
}

/* ── 已读标识 ── */
const showRead = ref(true)
const readStyle = ref('text')
const readNoReply = ref(false)
function pickStyle(v) {
  readStyle.value = v
  queueSave()
}

/* 实际保存：概率归一化 + 全部字段 */
async function doSave() {
  // 按界面输入原值保存，不再自动归一化（超过 100% 仅提示，仍为有效权重）
  const cat = {}
  for (const c of CATS) cat[c.k] = Math.max(0, Number(weights[c.k]) || 0)
  Object.assign(weights, cat)
    try {
      await patch({
        reply_delay_min: delaySeconds.value[0],
        reply_delay_max: delaySeconds.value[1],
        answer_delay_min: ansDelaySeconds.value[0],
        answer_delay_max: ansDelaySeconds.value[1],
        reply_min: countLo.value,
      reply_max: countHi.value,
      reply_merge_enabled: mergeOn.value ? 1 : 0,
      reply_merge_min: mergeLo.value,
      reply_merge_max: mergeHi.value,
      cat_weights: JSON.stringify(cat),
      gen_ratio: Math.max(0, Math.min(100, Number(genRatio.value) || 0)),
      show_read_receipt: showRead.value ? 1 : 0,
      read_receipt_style: readStyle.value,
      read_no_reply: readNoReply.value ? 1 : 0
    })
  } catch (e) {
    notify('保存失败：' + e.message)
  }
}
/* 防抖保存：控件连续变化时停顿 450ms 再提交 */
function queueSave() {
  clearTimeout(doSave._t)
  doSave._t = setTimeout(doSave, 450)
}

onMounted(async () => {
  const s = await load()
  if (!s) return
  const lo = Number(s.reply_delay_min ?? 1)
  const hi = Number(s.reply_delay_max ?? 5)
  delayUnit.value = hi >= 3600 ? '小时' : hi >= 60 ? '分钟' : '秒'
  const f = FACTOR[delayUnit.value]
  delayLo.value = Math.round((lo / f) * 10) / 10
  delayHi.value = Math.round((hi / f) * 10) / 10
  const aLo = Number(s.answer_delay_min ?? 1)
  const aHi = Number(s.answer_delay_max ?? 5)
  ansDelayUnit.value = aHi >= 3600 ? '小时' : aHi >= 60 ? '分钟' : '秒'
  const af = FACTOR[ansDelayUnit.value]
  ansDelayLo.value = Math.round((aLo / af) * 10) / 10
  ansDelayHi.value = Math.round((aHi / af) * 10) / 10
  countLo.value = Number(s.reply_min ?? 1)
  countHi.value = Number(s.reply_max ?? 3)
  clampCount()
  mergeOn.value = Number(s.reply_merge_enabled ?? 0) === 1
  mergeLo.value = Math.min(20, Math.max(1, Number(s.reply_merge_min ?? 1)))
  mergeHi.value = Math.min(20, Math.max(mergeLo.value, Number(s.reply_merge_max ?? 3)))
  parseWeights(s.cat_weights)
  genRatio.value = Math.max(0, Math.min(100, Number(s.gen_ratio ?? 70)))
  showRead.value = Number(s.show_read_receipt ?? 1) !== 0
  readStyle.value = s.read_receipt_style === 'check' ? 'check' : 'text'
  readNoReply.value = Number(s.read_no_reply ?? 0) !== 0
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
.sum { font-size: 12px; font-weight: 700; color: var(--accent); }
.sum.warn { color: #e5484d; }
  .hint.warn-text { color: #e5484d; font-weight: 600; }
.prob-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.p-label { flex: 0 0 64px; font-size: 13px; }
.p-range { flex: 1 1 auto; min-width: 0; accent-color: var(--accent); }
.p-num {
  flex: 0 0 56px; width: 56px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 8px;
  padding: 5px 6px;
  font-size: 13px;
  text-align: center;
  color: var(--text);
}
.prob-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 4px; }
.prob-actions .hint { margin: 0; }
.mini-btn { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 6px 14px; font-size: 12px; color: var(--text); flex: 0 0 auto; }
</style>
