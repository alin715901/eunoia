<template>
  <div class="sp-view">
    <AppHeader title="聊天背景" back />
    <div class="sp-body">
      <!-- 预览：模拟聊天界面 -->
      <div class="panel sec">
        <div class="sec-title">预览</div>
        <div class="chat-mock">
          <div v-if="isImageBg" class="mock-bg" :style="mockBgStyle"></div>
          <div class="mock-body" :style="mockColorStyle">
            <div class="mock-row">
              <span class="mock-ava"></span>
              <span class="mock-bubble left" :style="leftBubble">嗨～</span>
            </div>
            <div class="mock-row right">
              <span class="mock-bubble" :style="rightBubble">晚上一起吃饭吗？</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 颜色快选 -->
      <div class="panel sec">
        <div class="sec-title">纯色背景</div>
        <div class="swatches">
          <button
            v-for="c in COLOR_OPTIONS"
            :key="c.v"
            class="swatch"
            :style="{ background: c.v || '#fff', outline: chatBg === c.v ? '3px solid var(--accent)' : 'none' }"
            :title="c.n"
            @click="pickColor(c.v)"
          ></button>
        </div>
      </div>

      <!-- 图片背景 -->
      <div class="panel sec">
        <div class="sec-title row-between">
          <span>图片背景</span>
          <button class="mini-btn primary" @click="pickImage">{{ chatBg && isImageBg ? '更换' : '上传' }}</button>
        </div>
        <p class="hint" style="margin-top: 0">上传后按 9:16 裁剪，铺满整个聊天区</p>
        <template v-if="isImageBg">
          <div class="blur-head">
            <span class="blur-label">模糊度</span>
            <span class="blur-val">{{ blur }}px</span>
          </div>
          <input class="blur-range" type="range" min="0" max="20" step="1" v-model.number="blur" @change="doSave" />
          <button class="mini-btn danger clear-btn" @click="clearBg">恢复默认</button>
        </template>
      </div>

      <p v-if="uploadErr" class="err">{{ uploadErr }}</p>
    </div>

    <input ref="fileInput" class="hidden-file" type="file" accept="image/*" @change="onFile" />
    <ImageCropper
      v-if="cropSrc"
      :src="cropSrc"
      title="裁剪聊天背景"
      :ratio="9 / 16"
      @cancel="cropSrc = ''"
      @done="onCropped"
      @error="onCropError"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { uploadFile } from '@/api/settings'
import { compressImage } from '@/utils/image'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch, queueSave } = useContactSettingsPage(props.id)

const COLOR_OPTIONS = [
  { n: '默认', v: '' },
  { n: '浅灰', v: '#f4f4f6' },
  { n: '淡紫', v: '#efeafc' },
  { n: '淡蓝', v: '#eaf2fc' },
  { n: '淡绿', v: '#ecf7f0' },
  { n: '淡粉', v: '#fdeef2' }
]

const chatBg = ref('')
const blur = ref(0)
const isImageBg = computed(() => !!chatBg.value && !chatBg.value.startsWith('#'))

const mockBgStyle = computed(() => ({
  backgroundImage: `url(${chatBg.value})`,
  filter: `blur(${blur.value}px)`,
  transform: `scale(${1 + blur.value / 40})`
}))
const mockColorStyle = computed(() => (isImageBg.value ? {} : { background: chatBg.value || 'var(--bg-soft)' }))
const rightBubble = computed(() => ({ background: 'var(--accent, #c5a47e)', color: '#fff' }))
const leftBubble = computed(() => ({ background: 'rgba(255,255,255,0.92)', color: '#333' }))

function pickColor(v) {
  chatBg.value = v
  doSave()
}
function clearBg() {
  chatBg.value = ''
  blur.value = 0
  doSave()
}

/* ── 上传 ── */
const fileInput = ref(null)
const cropSrc = ref('')
const uploadErr = ref('')
function pickImage() {
  fileInput.value?.click()
}
function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!file.type?.startsWith('image/')) {
    uploadErr.value = '请选择图片文件'
    return
  }
  uploadErr.value = ''
  cropSrc.value = URL.createObjectURL(file)
}
function onCropError(msg) {
  cropSrc.value = ''
  uploadErr.value = msg || '图片无法读取，请换一张 JPG / PNG 图片'
}
async function onCropped(blob) {
  cropSrc.value = ''
  if (!blob) {
    uploadErr.value = '裁剪失败，请重试'
    return
  }
  try {
    const file = new File([blob], `chatbg-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const small = await compressImage(file)
    const res = await uploadFile(small)
    if (!res?.path) throw new Error('上传返回为空')
    chatBg.value = res.path
    await doSave()
    notify('聊天背景已更新')
  } catch (err) {
    uploadErr.value = err?.message || '上传失败，请重试'
  }
}

async function doSave() {
  try {
    await patch({ chat_bg: chatBg.value, chat_bg_blur: Number(blur.value) || 0 })
  } catch (e) {
    notify('保存失败：' + e.message)
  }
}

onMounted(async () => {
  const s = await load()
  if (!s) return
  chatBg.value = s.chat_bg || ''
  blur.value = Number(s.chat_bg_blur ?? 0)
})
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 8px 0 0; }
.err { color: #c0576b; font-size: 12px; margin: 0 4px; }
.hidden-file { display: none; }

/* 预览 */
.chat-mock {
  position: relative;
  height: 200px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--bg-soft);
}
.mock-bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
.mock-body {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px 12px;
}
.mock-row { display: flex; align-items: center; gap: 8px; }
.mock-row.right { justify-content: flex-end; }
.mock-ava { width: 30px; height: 30px; border-radius: 50%; background: var(--border); flex: 0 0 auto; }
.mock-bubble {
  max-width: 62%;
  padding: 8px 12px;
  border-radius: 16px 16px 16px 5px;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.mock-row.right .mock-bubble { border-radius: 16px 16px 5px 16px; }

/* 色板 */
.swatches { display: flex; gap: 10px; flex-wrap: wrap; }
.swatch { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--border); cursor: pointer; }

/* 模糊度 */
.blur-head { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.blur-label { font-size: 13px; }
.blur-val { font-size: 12px; color: var(--text-soft); font-family: var(--font-serif); }
.blur-range { width: 100%; accent-color: var(--accent); margin-top: 6px; }
.clear-btn { margin-top: 12px; width: 100%; }
.mini-btn { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 7px 16px; font-size: 12px; color: var(--text); }
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.mini-btn.danger { color: #c0576b; }
</style>
