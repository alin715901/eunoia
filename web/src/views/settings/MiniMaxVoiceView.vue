<template>
  <div class="sp-view">
    <AppHeader title="MiniMax 语音" back />
    <div class="sp-body">
      <!-- 总开关 -->
      <div class="panel sec">
        <div class="switch-row">
          <div class="row-main">
            <div class="row-title">启用 MiniMax 语音</div>
            <p class="hint">开启后，语音消息的转写文字旁会出现「朗读」按钮，用 MiniMax 生成真实语音播放</p>
          </div>
          <ToggleSwitch v-model="enabled" @update:modelValue="saveEnabled" />
        </div>
      </div>

      <!-- 接口配置 -->
      <div class="panel sec">
        <div class="sec-title">接口配置</div>
        <label class="field-label">MiniMax API Key</label>
        <input v-model="form.key" class="field" type="password" placeholder="在 MiniMax 开放平台获取" autocomplete="off" />
        <label class="field-label">Group ID</label>
        <input v-model="form.group" class="field" placeholder="账号对应的 Group ID" autocomplete="off" />
        <label class="field-label">模型</label>
        <select v-model="form.model" class="field">
          <option v-for="m in MM_MODELS" :key="m.k" :value="m.k">{{ m.n }}</option>
        </select>
        <label class="field-label">Voice ID</label>
        <input v-model="form.voice" class="field" placeholder="音色 ID，如 male-qn-qingse" autocomplete="off" />
        <p class="hint">Voice ID 可在 MiniMax 控制台「音色列表」查看；不同模型可用音色不同。</p>
      </div>

      <!-- 声音设置 -->
      <div class="panel sec">
        <div class="sec-title">声音设置</div>
        <label class="field-label">语音语言</label>
        <div class="chip-row">
          <button v-for="l in MM_LANGS" :key="l.k" class="chip" :class="{ on: form.lang === l.k }" type="button" @click="form.lang = l.k">{{ l.n }}</button>
        </div>
        <p class="hint">中文消息选「原文」即可；选其他语言时会先翻译再以该语言读出（中文字幕不变）。</p>
        <label class="field-label">语速 <span class="field-val">{{ form.speed.toFixed(1) }}×</span></label>
        <input v-model.number="form.speed" class="range" type="range" min="0.5" max="2" step="0.1" />
        <label class="field-label">角色性别</label>
        <div class="chip-row">
          <button v-for="g in MM_GENDERS" :key="g.k" class="chip" :class="{ on: form.gender === g.k }" type="button" @click="form.gender = g.k">{{ g.n }}</button>
        </div>
        <label class="field-label">说话风格（选填，50 字以内）</label>
        <input v-model="form.style" class="field" maxlength="50" placeholder="如：温柔体贴" />
      </div>

      <!-- 操作 -->
      <div class="panel sec btn-row">
        <button class="mini-btn" type="button" :disabled="testing" @click="doTest">{{ testing ? '生成中…' : '试听一句' }}</button>
        <button class="mini-btn primary" type="button" :disabled="saving" @click="doSave">{{ saving ? '保存中…' : '保存配置' }}</button>
      </div>
      <p v-if="msg" class="msg" :class="{ err: isErr }">{{ msg }}</p>
      <p v-if="ttsUrl" class="tts-tip">
        试听播放中…
        <button class="link-btn" type="button" @click="stopTts">停止</button>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { MM_LANGS, MM_MODELS, MM_GENDERS, readCfg, minimaxTts } from '@/utils/minimax'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch } = useContactSettingsPage(props.id)

const enabled = ref(false)
const form = reactive({
  key: '', group: '', model: 'speech-02-turbo', voice: '',
  lang: 'auto', speed: 1, gender: 'female', style: ''
})
const saving = ref(false)
const testing = ref(false)
const msg = ref('')
const isErr = ref(false)
const ttsUrl = ref('')
let ttsEl = null

function fill(s) {
  if (!s) return
  const c = readCfg(s)
  enabled.value = c.enabled
  Object.assign(form, {
    key: c.key, group: c.group, model: c.model, voice: c.voice,
    lang: c.lang, speed: c.speed, gender: c.gender, style: c.style
  })
}

async function saveEnabled() {
  try {
    await patch({ minimax_enabled: enabled.value ? 1 : 0 })
  } catch (e) { notify('保存失败：' + e.message) }
}

async function doSave() {
  saving.value = true
  isErr.value = false
  try {
    await patch({
      minimax_key: form.key.trim(),
      minimax_group: form.group.trim(),
      minimax_model: form.model,
      minimax_voice: form.voice.trim(),
      minimax_lang: form.lang,
      minimax_speed: Number(form.speed) || 1,
      minimax_gender: form.gender,
      minimax_style: form.style.trim()
    })
    msg.value = '已保存'
  } catch (e) {
    isErr.value = true
    msg.value = '保存失败：' + e.message
  } finally {
    saving.value = false
  }
}

function stopTts() {
  if (ttsEl) { ttsEl.pause(); ttsEl = null }
  if (ttsUrl.value) { URL.revokeObjectURL(ttsUrl.value); ttsUrl.value = '' }
}

/* 试听：用当前表单（未保存也可）生成一句并播放 */
async function doTest() {
  testing.value = true
  isErr.value = false
  msg.value = ''
  stopTts()
  try {
    const url = await minimaxTts({
      key: form.key.trim(), group: form.group.trim(), model: form.model,
      voice: form.voice.trim(), lang: form.lang, speed: Number(form.speed) || 1
    }, '你好，这是 MiniMax 语音的试听。')
    ttsUrl.value = url
    ttsEl = new Audio(url)
    ttsEl.onended = stopTts
    ttsEl.onerror = () => { isErr.value = true; msg.value = '音频播放失败' }
    await ttsEl.play()
    msg.value = '试听播放中'
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '试听失败'
  } finally {
    testing.value = false
  }
}

onBeforeUnmount(stopTts)
load().then(fill)
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.switch-row { display: flex; align-items: center; gap: 12px; }
.row-main { flex: 1; min-width: 0; }
.row-title { font-size: 14px; font-weight: 600; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 8px 0 0; }
.field-label { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-soft); margin: 12px 0 6px; }
.field-label:first-of-type { margin-top: 0; }
.field-val { color: var(--accent); font-weight: 700; }
.field {
  width: 100%; box-sizing: border-box; padding: 9px 12px; font-size: 13px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg-soft); color: var(--text);
}
.field:focus { outline: none; border-color: var(--accent); }
select.field { appearance: none; }
.range { width: 100%; accent-color: var(--accent); margin: 4px 0 2px; }
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--border); background: var(--bg-soft); color: var(--text);
  border-radius: 999px; padding: 6px 14px; font-size: 12px; cursor: pointer;
}
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.btn-row { display: flex; gap: 10px; }
.btn-row .mini-btn { flex: 1; }
.mini-btn { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 9px 16px; font-size: 13px; color: var(--text); cursor: pointer; }
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.mini-btn:disabled { opacity: 0.5; cursor: default; }
.msg { font-size: 12px; color: var(--text-soft); margin: 0 4px; }
.msg.err { color: #c0576b; }
.tts-tip { font-size: 12px; color: var(--accent); margin: 0 4px; }
.link-btn { border: none; background: none; color: var(--accent); font-size: 12px; text-decoration: underline; cursor: pointer; padding: 0 2px; }
</style>
