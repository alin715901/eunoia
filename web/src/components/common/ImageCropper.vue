<template>
  <!-- 图片裁剪弹窗：支持拖动移动 + 缩放（滚轮/双指/滑块）；circle 为圆形裁剪框 -->
  <div class="crop-mask" @click.self="cancel">
    <div class="crop-modal">
      <h3 class="cm-title">{{ title }}</h3>

      <div class="cm-stage" ref="stage" :style="{ '--crop-ratio': `${ratio} / 1`, '--crop-rw': ratio }">
        <div class="cm-viewport" :class="{ circle: circle }">
          <img
            :src="src"
            class="cm-img"
            :class="{ hide: loading || loadError }"
            :style="imgStyle"
            draggable="false"
            @pointerdown="onDown"
          />
          <div v-if="loading" class="cm-mask">
            <span class="cm-spin"></span>
            <span class="cm-mask-txt">图片读取中…</span>
          </div>
          <div v-else-if="loadError" class="cm-mask err">
            <AppIcon name="warn" :size="22" color="#c0576b" />
            <span class="cm-mask-txt">{{ loadError }}</span>
          </div>
          <template v-else>
            <!-- 圆形裁剪：框外压暗 + 圆形虚线框 -->
            <div v-if="circle" class="cm-shade"></div>
            <div v-if="circle" class="cm-ring"></div>
            <div v-else class="cm-grid"></div>
          </template>
        </div>
      </div>

      <div class="cm-zoom" v-if="!loading && !loadError">
        <span class="zm-label">缩放</span>
        <input
          type="range"
          class="zm-range"
          min="1"
          :max="3"
          step="0.01"
          :value="scale"
          @input="onZoomInput"
        />
      </div>

      <div class="cm-tip">{{ circle ? '拖动调整位置，圆形裁剪' : '拖动图片调整位置，滑块或双指可缩放' }}</div>

      <div class="cm-actions">
        <button class="cm-btn" @click="cancel">取消</button>
        <button class="cm-btn cm-primary" @click="confirm">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  src: { type: String, default: '' },
  title: { type: String, default: '裁剪图片' },
  // 输出宽高比：1 为正方形（头像），16/10 为宽幅（背景）
  ratio: { type: Number, default: 1 },
  // 输出宽度（高度按 ratio 推算）
  outWidth: { type: Number, default: 640 },
  // 圆形裁剪框（裁出来的图用于圆形头像/唱片中心）
  circle: { type: Boolean, default: false }
})
const emit = defineEmits(['cancel', 'done', 'error'])

/* 供模板使用的宽高比（默认 1:1） */
const ratio = computed(() => props.ratio || 1)

const stage = ref(null)
const scale = ref(1)
const minScale = ref(1)
/* 图片在舞台上的位移 */
const offsetX = ref(0)
const offsetY = ref(0)
/* 图片是否还在解码 */
const loading = ref(true)
/* 解码失败提示 */
const loadError = ref('')

let imgEl = null
let naturalW = 0
let naturalH = 0
let viewportW = 0
let viewportH = 0

/* 图片渲染尺寸：原图尺寸 × 缩放率（minScale 保证刚好铺满视口，scale 为用户缩放） */
const displayW = computed(() => naturalW * minScale.value * scale.value)
const displayH = computed(() => naturalH * minScale.value * scale.value)

const imgStyle = computed(() => ({
  width: `${displayW.value}px`,
  height: `${displayH.value}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px)`
}))

onMounted(async () => {
  await nextFrame()
  const vp = stage.value?.querySelector('.cm-viewport')
  if (vp) {
    viewportW = vp.clientWidth
    viewportH = vp.clientHeight
  }
  imgEl = new Image()
  imgEl.onload = () => {
    if (!imgEl.naturalWidth) {
      loadFail()
      return
    }
    naturalW = imgEl.naturalWidth
    naturalH = imgEl.naturalHeight
    // 让图片刚好铺满视口（cover）
    minScale.value = Math.max(viewportW / naturalW, viewportH / naturalH)
    scale.value = 1
    centerImage()
    loading.value = false
  }
  // 图片无法解码时不要静默消失，给出明确提示（常见于 iPhone 的 HEIC 等格式）
  imgEl.onerror = () => loadFail()
  imgEl.src = props.src
})

function loadFail() {
  loading.value = false
  loadError.value = '图片无法读取，请换一张 JPG / PNG 图片'
  emit('error', loadError.value)
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

function centerImage() {
  offsetX.value = 0
  offsetY.value = 0
}

/* 限制位移，保证图片始终覆盖视口（不露白） */
function clamp() {
  const maxX = (displayW.value - viewportW) / 2
  const maxY = (displayH.value - viewportH) / 2
  offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value))
  offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value))
}

function onZoomInput(e) {
  scale.value = Number(e.target.value)
  clamp()
}

/* ── 鼠标 / 单指拖动 ── */
let dragging = false
let startX = 0
let startY = 0
let startOffX = 0
let startOffY = 0

function onDown(e) {
  dragging = true
  startX = e.clientX
  startY = e.clientY
  startOffX = offsetX.value
  startOffY = offsetY.value
  e.target.setPointerCapture?.(e.pointerId)
}
function onMove(e) {
  if (!dragging) return
  offsetX.value = startOffX + (e.clientX - startX)
  offsetY.value = startOffY + (e.clientY - startY)
  clamp()
}
function onUp() {
  dragging = false
}

/* ── 双指捏合缩放 ── */
let pinchDist = 0
let pinchStartScale = 1
let pinchAnchor = { x: 0, y: 0 }

function dist(t1, t2) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.hypot(dx, dy)
}

function onTouchStart(e) {
  if (e.touches.length === 1) {
    dragging = true
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    startOffX = offsetX.value
    startOffY = offsetY.value
  } else if (e.touches.length === 2) {
    dragging = false
    pinchDist = dist(e.touches[0], e.touches[1])
    pinchStartScale = scale.value
    // 记录双指中心相对图片中心的位置，用于以该点为锚缩放
    pinchAnchor = { ...getImagePoint(e.touches[0], e.touches[1]) }
  }
}
function onTouchMove(e) {
  if (e.touches.length === 1 && dragging) {
    offsetX.value = startOffX + (e.touches[0].clientX - startX)
    offsetY.value = startOffY + (e.touches[0].clientY - startY)
    clamp()
  } else if (e.touches.length === 2 && pinchDist > 0) {
    e.preventDefault()
    const d = dist(e.touches[0], e.touches[1])
    scale.value = Math.min(3, Math.max(1, pinchStartScale * (d / pinchDist)))
    // 缩放后把锚点保持回原图片位置
    const ratio = scale.value / pinchStartScale
    const cur = getImagePoint(e.touches[0], e.touches[1])
    offsetX.value -= (cur.x - pinchAnchor.x) * ratio
    offsetY.value -= (cur.y - pinchAnchor.y) * ratio
    pinchAnchor = cur
    clamp()
  }
}
function onTouchEnd(e) {
  if (e.touches.length === 0) {
    dragging = false
    pinchDist = 0
  }
}

/* 双指中点（视口坐标，原点为视口中心） */
function getImagePoint(t1, t2) {
  const vpRect = stage.value?.querySelector('.cm-viewport')?.getBoundingClientRect()
  if (!vpRect) return { x: 0, y: 0 }
  const cx = vpRect.left + vpRect.width / 2
  const cy = vpRect.top + vpRect.height / 2
  const mx = (t1.clientX + t2.clientX) / 2
  const my = (t1.clientY + t2.clientY) / 2
  return { x: mx - cx, y: my - cy }
}

async function confirm() {
  const outH = Math.round(props.outWidth / props.ratio)
  const canvas = document.createElement('canvas')
  canvas.width = props.outWidth
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  /* 视口对应的原图源区域（保持与视口相同宽高比） */
  const srcW = (viewportW / displayW.value) * naturalW
  const srcH = (viewportH / displayH.value) * naturalH
  /* 视口中心在原图中的位置 */
  const centerX = naturalW / 2 - (offsetX.value / displayW.value) * naturalW
  const centerY = naturalH / 2 - (offsetY.value / displayH.value) * naturalH
  const sx = clampRange(centerX - srcW / 2, 0, Math.max(0, naturalW - srcW))
  const sy = clampRange(centerY - srcH / 2, 0, Math.max(0, naturalH - srcH))

  ctx.drawImage(imgEl, sx, sy, srcW, srcH, 0, 0, canvas.width, canvas.height)
  const blob = await canvasToBlob(canvas)
  emit('done', blob)
}

function clampRange(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
  })
}

function cancel() {
  emit('cancel')
}

onMounted(() => {
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
})
onUnmounted(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
})
</script>

<style scoped>
.crop-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.crop-modal {
  width: 100%;
  max-width: 340px;
  background: var(--bg-screen);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}
.cm-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-serif);
  text-align: center;
}
.cm-stage {
  position: relative;
  width: 100%;
  touch-action: none;
}
.cm-viewport {
  position: relative;
  /* 视口随裁剪比例缩放，但最高 300px：竖图（9:16）不会撑满全屏，保持弹窗小巧 */
  width: min(100%, calc(300px * var(--crop-rw, 1)));
  aspect-ratio: var(--crop-ratio, 1 / 1);
  margin: 0 auto;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #2a2a2e;
}
/* 圆形裁剪：视口成正圆，框外压暗，加一圈虚线圆 */
.cm-viewport.circle { border-radius: 50%; }
.cm-shade {
  position: absolute; inset: 0; pointer-events: none;
  background: rgba(0, 0, 0, 0.55);
  -webkit-mask-image: radial-gradient(circle closest-side, transparent 0 99.2%, #000 99.6%);
  mask-image: radial-gradient(circle closest-side, transparent 0 99.2%, #000 99.6%);
}
.cm-ring {
  position: absolute; inset: 0; pointer-events: none;
  border-radius: 50%;
  border: 1.5px dashed rgba(255, 255, 255, 0.8);
}
.cm-img {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  transform-origin: center;
  user-select: none;
  -webkit-user-drag: none;
}
.cm-img.hide { opacity: 0; }
/* 解码中 / 解码失败的遮罩 */
.cm-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(42, 42, 46, 0.92);
  color: #fff;
}
.cm-mask-txt {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  padding: 0 16px;
  line-height: 1.5;
}
.cm-spin {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  animation: cm-rot 0.7s linear infinite;
}
@keyframes cm-rot { to { transform: rotate(360deg); } }
/* 九宫格参考线 */
.cm-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px);
  background-size: 33.33% 33.33%;
  background-position: 33.33% 0;
}
.cm-zoom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.zm-label { font-size: 12px; color: var(--text-soft); flex: 0 0 auto; }
.zm-range { flex: 1; accent-color: var(--accent); }
.cm-tip {
  font-size: 11px;
  color: var(--text-soft);
  text-align: center;
  margin-top: 8px;
}
.cm-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.cm-btn {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 10px 0;
  font-size: 14px;
  color: var(--text);
}
.cm-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
</style>