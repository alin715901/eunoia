<template>
  <div class="theme-view">
    <AppHeader title="主题" back />
    <div class="tv-body">
      <!-- ── 主题色 ── -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="image" :size="18" /></span>
          <span class="ri-label">主题色<span class="scope-tag global">全局</span></span>
        </div>
        <div class="swatches">
          <button
            v-for="a in accents"
            :key="a.c"
            class="swatch"
            :style="{ background: a.c }"
            :class="{ on: currentAccent === a.c }"
            :title="a.n"
            @click="pickAccent(a.c)"
          ></button>
        </div>
        <div class="custom-row">
          <span class="cr-label">自定义</span>
          <input class="cr-color" type="color" :value="currentAccent" @input="onCustomColor" />
          <input
            class="cr-hex-input"
            type="text"
            :value="hexDraft"
            maxlength="7"
            placeholder="#c5a47e"
            @change="onHexInput"
            @keyup.enter="onHexInput"
          />
        </div>
        <p class="sub">当前：{{ currentAccentName }} {{ currentAccent }} · 取色器或直接填 #RRGGBB</p>
      </div>

      <!-- ── 字体 ── -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="diary" :size="18" /></span>
          <span class="ri-label">字体<span class="scope-tag global">全局</span></span>
        </div>
        <div class="chips">
          <button
            v-for="f in fonts"
            :key="f.k"
            class="chip"
            :class="{ on: theme.font === f.k }"
            :style="{ fontFamily: f.css }"
            @click="pickFont(f.k)"
          >{{ f.n }}</button>
        </div>
        <div class="css-box">
          <span class="cr-label">自定义字体 CSS</span>
          <textarea
            class="css-area"
            v-model="fontCss"
            rows="4"
            placeholder="例如：body { letter-spacing: .5px; }"
          ></textarea>
          <div class="css-actions">
            <span class="css-tip">留空则只用上面的预设字体</span>
            <button class="mini-btn" :disabled="saving" @click="clearFontCss">清空</button>
            <button class="mini-btn primary" :disabled="saving" @click="saveFontCss">应用</button>
          </div>
        </div>
      </div>

      <!-- ── 主页背景图 ── -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="image" :size="18" /></span>
          <span class="ri-label">主页背景图<span class="scope-tag global">全局</span></span>
          <span class="spacer"></span>
          <button class="mini-btn" @click="pickHomeBg">{{ theme.homeBg ? '更换' : '上传' }}</button>
        </div>
        <div class="bg-row" v-if="theme.homeBg">
          <img class="bg-prev" :src="theme.homeBg" alt="主页背景" />
          <div class="bg-side">
            <div class="op-head">
              <span class="cr-label">背景图透明度</span>
              <span class="cr-hex">{{ theme.homeBgOpacity }}%</span>
            </div>
            <input
              class="op-range"
              type="range"
              min="0"
              max="100"
              step="5"
              :value="theme.homeBgOpacity"
              @input="onHomeBgOpacity"
            />
            <p class="bg-note">数值越高，背景图越清晰（与下方「卡片透明度」互不影响）</p>
            <button class="mini-btn danger" @click="clearHomeBg">移除背景</button>
          </div>
        </div>
        <p class="sub" v-else>还没有背景图，上传后整个主页桌面都会铺上这张图。</p>
      </div>

      <!-- ── 卡片透明度 ── -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="cards" :size="18" /></span>
          <span class="ri-label">卡片透明度<span class="scope-tag global">全局</span></span>
          <span class="spacer"></span>
          <span class="ri-value">{{ theme.cardOpacity }}%</span>
        </div>
        <div class="op-box">
          <input
            class="op-range"
            type="range"
            min="0"
            max="100"
            step="5"
            :value="theme.cardOpacity"
            @input="onCardOpacity"
          />
          <div class="op-tips">
            <span>卡片越透，主页背景图越清晰</span>
            <span>100% = 原样不透明</span>
          </div>
        </div>
      </div>

      <!-- ── 图标背景：每个图案单独上传 ── -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="grid" :size="18" /></span>
          <span class="ri-label">图标<span class="scope-tag global">全局</span></span>
        </div>
        <p class="sub ic-tip">点击任一图标上传图片：可拖动移动、缩放裁剪；有图片时不显示原图案，删掉图片即恢复。</p>
        <div class="ic-grid">
          <div class="ic-item" v-for="ic in iconList" :key="ic.k">
            <button class="ic-thumb" :class="{ 'has-img': !!theme.icons[ic.k] }" :style="thumbStyle(ic.k)" @click="pickIcon(ic.k)">
              <span v-if="!theme.icons[ic.k]" class="ic-ico"><AppIcon :name="ic.k" :size="26" color="var(--accent)" /></span>
              <span v-if="theme.icons[ic.k]" class="ic-clear" @click.stop="clearIcon(ic.k)">×</span>
              <span v-if="busyKey === ic.k" class="ic-busy">…</span>
            </button>
            <span class="ic-name">{{ ic.n }}</span>
          </div>
        </div>
      </div>

      <!-- ── 主题套装：把当前主题存成一套，可命名、可切换 ── -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="sticker" :size="18" /></span>
          <span class="ri-label">我的主题<span class="scope-tag global">全局</span></span>
        </div>
        <div class="ps-new">
          <input class="ps-input" v-model="presetName" placeholder="给这套主题起个名字" maxlength="16" />
          <button class="mini-btn primary" :disabled="saving" @click="savePreset">保存当前</button>
        </div>
        <ul class="ps-list" v-if="presets.length">
          <li v-for="p in presets" :key="p.id">
            <button class="ps-item" @click="usePreset(p)">
              <span class="ps-dot" :style="{ background: p.theme?.accent || '#c5a47e' }"></span>
              <span class="ps-main">
                <span class="ps-name">{{ p.name }}</span>
                <span class="ps-desc">{{ presetDesc(p) }}</span>
              </span>
              <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
              <span class="ps-del" @click.stop="delPreset(p)">删除</span>
            </button>
          </li>
        </ul>
        <p class="sub" v-else>还没有保存的主题，调好上面的设置后点「保存当前」即可存成一套。</p>
      </div>

      <p v-if="uploadErr" class="err">{{ uploadErr }}</p>
      <div class="tv-pad"></div>
    </div>

    <input ref="fileInput" class="hidden-file" type="file" accept="image/*" @change="onFile" />
    <!-- 上传前先裁剪：拖动移动 + 缩放 -->
    <ImageCropper
      v-if="cropSrc"
      :src="cropSrc"
      :title="cropTitle"
      :ratio="cropRatio"
      @cancel="cropSrc = ''"
      @done="onCropped"
      @error="onCropError"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { useSettingsStore, FONTS } from '@/stores/settings'
import { useNotificationsStore } from '@/stores/notifications'
import { uploadFile } from '@/api/settings'
import { compressImage } from '@/utils/image'
import { confirmDialog } from '@/utils/dialog'

const settings = useSettingsStore()
const toast = useNotificationsStore()

const accents = [
  { c: '#c5a47e', n: '驼' },
  { c: '#6a9fb5', n: '天青' },
  { c: '#7f9f7a', n: '竹青' },
  { c: '#b48aa4', n: '藕荷' },
  { c: '#c17a72', n: '胭脂' },
  { c: '#d9b382', n: '缃色' },
  { c: '#5f7a99', n: '黛蓝' },
  { c: '#9aa4ac', n: '银灰' },
  { c: '#1c1c1e', n: '墨色' }
]
const fonts = FONTS
/* 桌面所有图标：第 1 页 8 个 + 第 2 页 8 个，key 与 HomeView 里的 icon 名一致 */
const iconList = [
  { k: 'chat', n: '聊天' },
  { k: 'moments', n: '朋友圈' },
  { k: 'letter', n: '信件' },
  { k: 'diary', n: '感知' },
  { k: 'calendar', n: '纪念' },
  { k: 'archive', n: '陪伴' },
  { k: 'divination', n: '占卜' },
  { k: 'trace', n: '心迹' },
  { k: 'music', n: '音乐' },
  { k: 'film', n: '影院' },
  { k: 'game', n: '游戏' },
  { k: 'mood', n: '心情' },
  { k: 'memo', n: '备忘录' },
  { k: 'drop', n: '经期' },
  { k: 'image', n: '相册' },
  { k: 'chart', n: '统计' }
]

const fileInput = ref(null)
/* 当前上传目标：homeBg 或某个图标 key */
const pickKey = ref('')
const busyKey = ref('')
const saving = ref(false)
const uploadErr = ref('')
const fontCss = ref('')
/* 裁剪：选完文件先进裁剪，确认后才上传 */
const cropSrc = ref('')
const presetName = ref('')
const hexDraft = ref('')

const cropTitle = computed(() => (pickKey.value === 'homeBg' ? '裁剪主页背景' : '裁剪图标背景'))
/* 主页是竖屏，背景按 9:16 裁；图标按 1:1 */
const cropRatio = computed(() => (pickKey.value === 'homeBg' ? 9 / 16 : 1))

const theme = computed(() => settings.global.theme)
const presets = computed(() => settings.global.themePresets || [])
const currentAccent = computed(() => theme.value.accent || '#c5a47e')
const currentAccentName = computed(() => {
  const f = accents.find((a) => a.c === currentAccent.value)
  return f ? f.n : '自定义'
})

function thumbStyle(k) {
  const url = theme.value.icons?.[k]
  if (!url) return {}
  return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
}

async function persist(msg) {
  saving.value = true
  try {
    await settings.save()
    if (msg) toast.pushToast({ title: msg })
  } catch (e) {
    toast.pushToast({ title: '保存失败', text: e?.message || '' })
  } finally {
    saving.value = false
  }
}

/* ── 主题色 ── */
async function pickAccent(c) {
  settings.setAccent(c)
  await persist(`主题色已切换：${currentAccentName.value}`)
}
function onCustomColor(e) {
  const v = e.target.value
  hexDraft.value = v
  settings.setAccent(v)
  clearTimeout(onCustomColor._t)
  onCustomColor._t = setTimeout(() => persist(), 400)
}
function onHexInput(e) {
  let v = String(e.target.value || '').trim()
  if (!v) return
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[a-f\d]{3}$/i.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  }
  if (!/^#[a-f\d]{6}$/i.test(v)) {
    uploadErr.value = '色值格式不对，应为 #RRGGBB'
    return
  }
  uploadErr.value = ''
  hexDraft.value = v
  settings.setAccent(v)
  persist()
}

/* ── 字体 ── */
async function pickFont(k) {
  settings.setTheme({ font: k })
  await persist('字体已切换')
}
async function saveFontCss() {
  settings.setTheme({ fontCss: fontCss.value })
  await persist('自定义字体已应用')
}
/* 清空：输入框与已生效的自定义 CSS 一起清掉，即时恢复预设字体 */
async function clearFontCss() {
  fontCss.value = ''
  settings.setTheme({ fontCss: '' })
  await persist('自定义字体已清空')
}

/* ── 卡片透明度 ── */
function onCardOpacity(e) {
  const v = Number(e.target.value)
  settings.setTheme({ cardOpacity: v })
  clearTimeout(onCardOpacity._t)
  onCardOpacity._t = setTimeout(() => persist(), 400)
}

/* ── 主页背景图：独立透明度滑块 ── */
function onHomeBgOpacity(e) {
  const v = Number(e.target.value)
  settings.setTheme({ homeBgOpacity: v })
  clearTimeout(onHomeBgOpacity._t)
  onHomeBgOpacity._t = setTimeout(() => persist(), 400)
}
function pickHomeBg() {
  pickKey.value = 'homeBg'
  fileInput.value?.click()
}
async function clearHomeBg() {
  settings.setTheme({ homeBg: '', homeBgOpacity: 100 })
  await persist('已移除主页背景图')
}

/* ── 图标背景 ── */
function pickIcon(k) {
  pickKey.value = k
  fileInput.value?.click()
}
async function clearIcon(k) {
  settings.setIconBg(k, '')
  await persist('已清除该图标背景')
}

/* 选好文件后先进裁剪（可拖动移动、缩放），确认后才上传 */
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
  const key = pickKey.value
  if (!blob) {
    uploadErr.value = '裁剪失败，请重试'
    return
  }
  busyKey.value = key === 'homeBg' ? '' : key
  try {
    const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const small = await compressImage(file)
    const res = await uploadFile(small)
    const path = res?.path
    if (!path) throw new Error('上传返回为空')
    if (key === 'homeBg') {
      settings.setTheme({ homeBg: path })
      await persist('主页背景图已更新')
    } else {
      settings.setIconBg(key, path)
      await persist('图标背景已更新')
    }
  } catch (err) {
    uploadErr.value = err?.message || '上传失败，请重试'
  } finally {
    busyKey.value = ''
  }
}

/* ── 主题套装 ── */
async function savePreset() {
  const p = settings.savePreset(presetName.value)
  presetName.value = ''
  await persist(`已保存主题「${p.name}」`)
}
async function usePreset(p) {
  settings.applyPreset(p.id)
  fontCss.value = theme.value.fontCss || ''
  hexDraft.value = theme.value.accent || ''
  await persist(`已切换到「${p.name}」`)
}
async function delPreset(p) {
  const ok = await confirmDialog({
    title: '删除主题',
    text: `确定删除主题「${p.name}」吗？`,
    okText: '删除',
    danger: true
  })
  if (!ok) return
  settings.removePreset(p.id)
  await persist('已删除该主题')
}
function presetDesc(p) {
  const f = FONTS.find((x) => x.k === (p.theme?.font || 'default')) || FONTS[0]
  const bits = [f.n, `${p.theme?.cardOpacity ?? 100}%`]
  if (p.theme?.homeBg) bits.push('有背景图')
  const n = Object.keys(p.theme?.icons || {}).length
  if (n) bits.push(`${n} 个图标`)
  return bits.join(' · ')
}

onMounted(async () => {
  await settings.load().catch(() => {})
  fontCss.value = theme.value.fontCss || ''
  hexDraft.value = theme.value.accent || ''
  settings.applyTheme()
})
</script>

<style scoped>
.theme-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.tv-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tv-body::-webkit-scrollbar { display: none; }
.tv-pad { height: 20px; }
.sec { padding: 6px 4px; }
.hidden-file { display: none; }

.row-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 15px;
  color: var(--text);
}
.ri-icon { color: var(--text); display: inline-flex; }
.ri-label { display: flex; align-items: center; gap: 6px; flex: 0 1 auto; }
.scope-tag.global {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-soft);
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 6px;
  padding: 1px 6px;
  white-space: nowrap;
}
.sub { font-size: 12px; color: var(--text-soft); line-height: 1.6; margin: 6px 12px 12px; }
.spacer { flex: 1 1 auto; }
.err { color: #c0576b; font-size: 12px; margin: 0 12px; }

/* 主题色 */
.swatches { display: flex; gap: 10px; flex-wrap: wrap; padding: 12px 12px 4px; }
.swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: var(--shadow);
}
.swatch.on { outline: 3px solid var(--text); outline-offset: 2px; transform: scale(1.08); }
.custom-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px 4px; }
.cr-label { font-size: 12px; color: var(--text-soft); }
.cr-hex { font-size: 12px; color: var(--text); font-family: var(--font-serif); }
.cr-hex-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text);
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.cr-hex-input:focus { border-color: var(--accent); outline: none; }
.cr-color {
  width: 40px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  padding: 0;
}

/* 字体 */
.chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 12px 4px; }
.chip {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  color: var(--text);
}
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.css-box { padding: 10px 12px 12px; }
.css-area {
  width: 100%;
  box-sizing: border-box;
  margin-top: 6px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
  resize: none;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.css-area:focus { border-color: var(--accent); outline: none; }
.css-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.css-tip { font-size: 11px; color: var(--text-soft); }

/* 主页背景图 */
.bg-row { display: flex; gap: 12px; padding: 12px; }
.bg-prev {
  width: 92px;
  height: 92px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid var(--border);
  flex: 0 0 auto;
}
.bg-side { flex: 1 1 auto; display: flex; flex-direction: column; gap: 8px; justify-content: center; }
.op-head { display: flex; align-items: center; justify-content: space-between; }
.bg-note { margin: 0; font-size: 11px; line-height: 1.7; color: var(--text-soft); }
.op-range { width: 100%; }
.op-box { padding: 10px 12px 12px; }
.op-tips {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-soft);
}

/* 主题套装 */
.ps-new { display: flex; gap: 8px; padding: 10px 12px 6px; }
.ps-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
}
.ps-input:focus { border-color: var(--accent); outline: none; }
.ps-list { list-style: none; margin: 6px 0 0; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.ps-item {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.ps-dot { width: 18px; height: 18px; border-radius: 50%; flex: 0 0 auto; border: 1px solid var(--border); }
.ps-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ps-name { font-size: 14px; font-weight: 600; color: var(--text); }
.ps-desc { font-size: 11px; color: var(--text-soft); }
.ps-del { flex: 0 0 auto; font-size: 11px; color: #c0576b; padding: 4px 2px; }

/* 图标背景 */
.ic-tip { margin-bottom: 8px; }
.ic-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 8px;
  justify-items: center;
  padding: 4px 8px 12px;
}
.ic-item { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ic-thumb {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 19px;
  border: 1px solid var(--border);
  background: var(--icon-bg);
  box-shadow: var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ic-thumb:active { transform: scale(0.94); }
/* 有图片背景时给图标垫一层半透明白底，保证图案看得清 */
.ic-thumb.has-img .ic-ico {
  background: rgba(255, 255, 255, 0.62);
  border-radius: 50%;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ic-clear {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #c0576b;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}
.ic-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--text); }
.ic-name { font-size: 11px; color: var(--text); }

.mini-btn {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text);
}
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.mini-btn.danger { color: #c0576b; }
.mini-btn:disabled { opacity: 0.6; }
</style>
