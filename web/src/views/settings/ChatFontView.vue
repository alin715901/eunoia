<template>
  <div class="sp-view">
    <AppHeader title="聊天字体" back />
    <div class="sp-body">
      <div class="panel sec">
        <div class="sec-title">预览</div>
        <p class="font-preview" :style="previewStyle">
          今天也想和你分享日常呀 (´▽`)
        </p>
      </div>

      <div class="panel sec">
        <div class="sec-title">选择字体</div>
        <div class="chips">
          <button
            v-for="f in options"
            :key="f.k"
            class="chip"
            :class="{ on: chatFont === f.k && !fontCssDraft }"
            :style="{ fontFamily: f.css }"
            @click="pick(f.k)"
          >{{ f.n }}</button>
        </div>
        <p class="hint">只对这个联系人的聊天生效；选「跟随全局」则沿用全站字体，不跟随全局时仅该聊天内生效</p>
      </div>

      <div class="panel sec">
        <div class="sec-head">
          <div class="sec-title">自定义字体 CSS</div>
          <button class="ta-clear" type="button" @click="clearFontCss">清空</button>
        </div>
        <textarea
          class="ta mono"
          v-model="fontCssDraft"
          rows="6"
          placeholder="填写 font-family 等 font- 开头的样式，如：&#10;font-family: 'LXGW WenKai', 'Noto Serif SC', serif;"
          @change="queueSave"
        ></textarea>
        <p class="hint">填写后优先于上方预设字体，只对该聊天的气泡文字生效；清空则回到上方选择。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { FONTS } from '@/stores/settings'
import { fontCssToStyle } from '@/utils/fontCss'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch } = useContactSettingsPage(props.id)

const options = [{ k: '', n: '跟随全局', css: '' }, ...FONTS]
const chatFont = ref('')
const fontCssDraft = ref('')

/* 预览：自定义 CSS 优先，否则用预设 */
const previewStyle = computed(() => {
  if (fontCssDraft.value.trim()) return fontCssToStyle(fontCssDraft.value)
  const css = options.find((f) => f.k === chatFont.value)?.css
  return css ? { fontFamily: css } : {}
})

async function pick(k) {
  chatFont.value = k
  doSave()
}

async function doSave() {
  try {
    await patch({ chat_font: chatFont.value, chat_font_css: fontCssDraft.value })
  } catch (e) {
    notify('保存失败：' + e.message)
  }
}
function queueSave() {
  clearTimeout(doSave._t)
  doSave._t = setTimeout(doSave, 450)
}

function clearFontCss() {
  fontCssDraft.value = ''
  doSave()
}

onMounted(async () => {
  const s = await load()
  if (!s) return
  chatFont.value = s.chat_font || ''
  fontCssDraft.value = s.chat_font_css || ''
})
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 10px 0 0; }
.font-preview { margin: 0; font-size: 16px; line-height: 1.7; color: var(--text); }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 8px 16px; font-size: 13px; color: var(--text); }
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.ta {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 13px;
  color: var(--text);
  resize: none;
}
.ta.mono { font-family: ui-monospace, Menlo, Consolas, monospace; line-height: 1.6; }
.ta:focus { border-color: var(--accent); outline: none; }

/* 标题行：标题居左，「清空」贴卡片右上角 */
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.sec-head .sec-title { margin-bottom: 0; }
.ta-clear {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 11px;
  color: var(--text-soft);
  cursor: pointer;
}
.ta-clear:active { opacity: 0.7; }
</style>
