<template>
  <div class="sp-view">
    <AppHeader title="聊天气泡样式" back />
    <div class="sp-body">
      <!-- 实时预览 -->
      <div class="panel sec">
        <div class="sec-title">预览</div>
        <div class="mock">
        <div class="mock-row">
          <span class="mock-ava"></span>
          <span
            class="mock-bubble mock-contact"
            :style="mockContactStyle"
          >在忙什么呀？</span>
        </div>
        <div class="mock-row right">
          <span
            class="mock-bubble mock-me"
            :style="mockMyStyle"
          >在想你怎么还不找我 (¬‿¬)</span>
        </div>
        </div>
      </div>

      <!-- 颜色与圆角 + 大小 -->
      <div class="panel sec">
        <div class="color-row">
          <span class="c-label">我的气泡</span>
          <input class="c-input" type="color" v-model="bs.my" @input="queueSave" />
          <input class="c-hex" type="text" v-model="bs.my" maxlength="7" @change="onHex('my')" />
        </div>
        <div class="color-row">
          <span class="c-label">对方气泡</span>
          <input class="c-input" type="color" v-model="bs.contact" @input="queueSave" />
          <input class="c-hex" type="text" v-model="bs.contact" maxlength="7" @change="onHex('contact')" />
        </div>

        <div class="blur-head">
          <span class="c-label">气泡圆角</span>
          <span class="blur-val">{{ bs.radius }}px</span>
        </div>
        <input class="blur-range" type="range" min="0" max="26" step="1" v-model.number="bs.radius" @input="queueSave" />

        <div class="blur-head">
          <span class="c-label">气泡大小</span>
          <span class="blur-val">{{ bs.size }}%</span>
        </div>
        <input class="blur-range" type="range" min="45" max="90" step="1" v-model.number="bs.size" @input="queueSave" />
      </div>

      <!-- 自定义气泡 CSS（声明式统一生效 / 规则式可分别设置双方） -->
      <div class="panel sec">
        <div class="sec-head">
          <div class="sec-title">自定义气泡 CSS</div>
          <button class="ta-clear" type="button" @click="clearBubbleCss">清空</button>
        </div>
        <p class="css-tip">
          支持两种写法，自动识别（含 {"{ }"} 即按规则式）：<br />
          ① 声明式：一行一条声明，双方气泡统一生效，如
          <code>background:#fde9c8; color:#5a4632; font-size:15px;</code><br />
          ② 规则式：写完整 CSS 规则，可分别设置双方气泡，类名用
          <code>.message</code>（双方通用）/ <code>.message-sent</code>（我的）/ <code>.message-received</code>（对方），
          变量可用 <code>--accent-color</code>、<code>--text-primary</code>。带 !important 的声明会盖过上面的颜色与圆角。
        </p>
        <textarea
          class="css-area"
          v-model="bs.css"
          rows="6"
          placeholder="例：.message-sent { background: transparent; border: 2px solid var(--accent-color); color: var(--accent-color); border-radius: 20px; } .message-received { background: transparent; border: 2px solid #ccc; color: var(--text-primary); border-radius: 20px; }"
          @change="queueSave"
        ></textarea>
        <p class="hint">留空则使用上面选择的颜色；改完自动保存。</p>
      </div>

      <!-- 预设模板：淡雅中国色 -->
      <div class="panel sec">
        <div class="sec-title">预设模板</div>
        <div class="preset-grid">
          <button
            v-for="p in BUBBLE_PRESETS"
            :key="p.name"
            class="preset"
            :class="{ selected: selectedPreset === p.name }"
            @click="applyPreset(p)"
          >
            <span v-if="selectedPreset === p.name" class="p-check">✓</span>
            <span class="p-bubbles">
              <span class="p-me" :style="{ background: p.my }"></span>
              <span class="p-contact" :style="{ background: p.contact }"></span>
            </span>
            <span class="p-name">{{ p.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { BUBBLE_PRESETS, parseBubbleStyle, bubblePresetName, cssTextToStyle, isRuleCss } from '@/utils/bubbleStyle'
import { applyPreviewBubbleRuleCss } from '@/utils/bubbleRuleCss'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch } = useContactSettingsPage(props.id)

const bs = reactive({ my: '#d9e7c8', contact: '#d9e7c8', radius: 8, size: 68, css: '' })

/* 气泡大小：整体缩放（字号 / 内边距 / 宽度随比例），与聊天内一致 */
function scaleOf(size) {
  const n = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 68
  return n / 68
}
/* 自定义 CSS 的 px 尺寸声明也乘缩放系数（与 MessageBubble 的 scaledCustomCss 对应）：
   否则预览里内联 font-size/padding 固定值会盖掉缩放，滑条看起来「无效」 */
function scaledByK(custom, k) {
  const out = { ...custom }
  const isPx = (v) => /^-?\d+(?:\.\d+)?px$/.test(String(v).trim())
  if (isPx(out.fontSize)) out.fontSize = (parseFloat(out.fontSize) * k).toFixed(1) + 'px'
  if (out.padding) {
    const parts = String(out.padding).trim().split(/\s+/)
    if (parts.length && parts.every(isPx)) {
      out.padding = parts.map((p) => (parseFloat(p) * k).toFixed(1) + 'px').join(' ')
    }
  }
  return out
}
function bubblePreviewStyle(hex) {
  const k = scaleOf(bs.size)
  return {
    background: hex,
    color: fgOf(hex),
    borderRadius: bs.radius + 'px',
    fontSize: (15 * k).toFixed(1) + 'px',
    padding: `${(10 * k).toFixed(1)}px ${(14 * k).toFixed(1)}px`,
    maxWidth: Math.min(92, 68 * k).toFixed(0) + '%',
    // 规则式 CSS 不走内联（改注入预览 <style>），否则解析出的垃圾声明会污染内联
    ...(isRuleCss(bs.css) ? {} : scaledByK(cssTextToStyle(bs.css), k))
  }
}
/* 对方气泡预览 */
const mockContactStyle = computed(() => bubblePreviewStyle(bs.contact))
/* 我的气泡预览：颜色 + 大小 + 自定义 CSS 一起生效 */
const mockMyStyle = computed(() => bubblePreviewStyle(bs.my))

/* 颜色深浅自动配字色 */
function fgOf(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim())
  if (!m) return '#333'
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b < 150 ? '#fff' : '#3a3a3a'
}

function onHex(side) {
  let v = String(bs[side] || '').trim()
  if (!v) return
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[a-f\d]{3}$/i.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  if (!/^#[a-f\d]{6}$/i.test(v)) return
  bs[side] = v
  queueSave()
}

/* 当前选中的预设名（与 my/contact/radius 完全匹配才算，否则为「自定义」） */
const selectedPreset = computed(() => bubblePresetName(bs))

function applyPreset(p) {
  bs.my = p.my
  bs.contact = p.contact
  bs.radius = p.radius
  doSave()
}

async function doSave() {
  try {
    await patch({
      bubble_style: JSON.stringify({
        my: bs.my, contact: bs.contact, radius: bs.radius, size: bs.size, css: bs.css
      })
    })
  } catch (e) {
    notify('保存失败：' + e.message)
  }
}
function queueSave() {
  clearTimeout(doSave._t)
  doSave._t = setTimeout(doSave, 450)
}

function clearBubbleCss() {
  bs.css = ''
  doSave()
}

onMounted(async () => {
  const s = await load()
  if (!s) return
  Object.assign(bs, parseBubbleStyle(s.bubble_style))
})

/* 规则式 CSS：实时注入预览 <style>（只影响本页 mock 气泡），
   聊天内注入由 MessageBubble 负责 */
watch(() => bs.css, (v) => applyPreviewBubbleRuleCss(v), { immediate: true })
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 10px 0 0; }

/* 预览 */
.mock {
  background: linear-gradient(180deg, var(--bg-soft), var(--bg-screen));
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mock-row { display: flex; align-items: flex-end; gap: 8px; }
.mock-row.right { justify-content: flex-end; }
.mock-ava { width: 32px; height: 32px; border-radius: 50%; background: var(--border); flex: 0 0 auto; }
.mock-bubble {
  max-width: 68%;
  padding: 9px 13px;
  font-size: 14px;
  line-height: 1.45;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* 颜色行 */
.color-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.c-label { flex: 0 0 76px; font-size: 13px; }
.c-input { width: 42px; height: 30px; border: 1px solid var(--border); border-radius: 8px; background: transparent; padding: 0; }
.c-hex {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: var(--text);
}
.blur-head { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.blur-val { font-size: 12px; color: var(--text-soft); font-family: var(--font-serif); }
.blur-range { width: 100%; accent-color: var(--accent); margin-top: 6px; }

/* 自定义 CSS */
.css-tip { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 0 0 10px; }
.css-block { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.css-area {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
  resize: none;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.css-area:focus { border-color: var(--accent); outline: none; }

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

/* 预设 */
.preset-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.preset {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 12px;
  padding: 10px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.preset:active { transform: scale(0.95); }
.preset.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-soft));
  box-shadow: 0 0 0 2px var(--accent), 0 2px 8px rgba(0, 0, 0, 0.08);
}
/* 已选角标 */
.p-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
}
.preset { position: relative; }
.p-bubbles { display: flex; gap: 4px; }
.p-me, .p-contact { width: 20px; height: 14px; border-radius: 4px; display: inline-block; }
.p-name { font-size: 11px; color: var(--text); }
</style>
