<template>
  <div
    class="we"
    :class="[el.type, frameCls, { editable, selected: selected && editable }]"
    :style="styleObj"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @dblclick.prevent="onDblClick"
  >
    <template v-if="el.type === 'image' || el.type === 'sticker'">
      <img :src="el.content" class="we-media" alt="" draggable="false" />
    </template>
    <template v-else-if="isSticky">
      <div class="we-sticky" :style="{ background: stickyBg }">
        <div class="we-text" :style="textStyle">{{ el.content || '双击编辑文字' }}</div>
      </div>
    </template>
    <div v-else class="we-text" :style="textStyle">{{ el.content || '双击编辑文字' }}</div>

    <!-- 自定义相框：覆盖在内容之上，随元素一起缩放旋转 -->
    <img v-if="customFrameSrc" :src="customFrameSrc" class="we-frame" alt="" draggable="false" />

    <!-- 选中态：左上角手柄=旋转，右下角手柄=缩放+旋转（可拖动） -->
    <span v-if="selected && editable" class="we-corner tl" role="slider" aria-label="旋转" @pointerdown.stop="onHandleDown($event, 'tl')"></span>
    <span v-if="selected && editable" class="we-corner br" role="slider" aria-label="缩放旋转" @pointerdown.stop="onHandleDown($event, 'br')"></span>

    <!-- 选中态：四边中点拉伸箭头，拖动单独调整宽 / 高（对边保持不动） -->
    <template v-if="selected && editable">
      <span class="we-edge t" role="slider" aria-label="上下拉伸" @pointerdown.stop="onEdgeDown($event, 't')"><i>↕</i></span>
      <span class="we-edge b" role="slider" aria-label="上下拉伸" @pointerdown.stop="onEdgeDown($event, 'b')"><i>↕</i></span>
      <span class="we-edge l" role="slider" aria-label="左右拉伸" @pointerdown.stop="onEdgeDown($event, 'l')"><i>↔</i></span>
      <span class="we-edge r" role="slider" aria-label="左右拉伸" @pointerdown.stop="onEdgeDown($event, 'r')"><i>↔</i></span>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { fontCss, STICKY_COLORS, noteBg } from './presets'

const props = defineProps({
  el: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  zoom: { type: Number, default: 1 } // 墙级缩放：屏幕位移换算成长卷坐标时要除以它
})
const emit = defineEmits(['select', 'change', 'edit-text'])
const zf = () => props.zoom || 1

// 基尺寸（未缩放），缩放/旋转由 transform 承担
const BASE = { image: 150, sticker: 96, text: 0 }

/* frame 字段编码：
   ''                  → 无相框（图片原图 / 普通文字）
   'polaroid'          → 拍立得白边（竖版：下边留宽）
   'polaroid-h'        → 拍立得白边（横版：右边留宽）
   'tape'              → 一键电子胶带（贴在图片上方）
   'sticky' / 'sticky:#fff3b0' → 便利贴（可带底色）
   'note:' + 图片地址  → 自定义便签纸（图片作背景，文字写在纸上）
   'custom:' + 图片地址 → 自定义相框（图片盖在元素上方，透明区透出内容） */
const frameCls = computed(() => {
  const f = props.el.frame || ''
  if (f === 'polaroid') return 'polaroid'
  if (f === 'polaroid-h') return 'polaroid polaroid-h'
  if (f === 'tape') return 'tape'
  if (f.startsWith('sticky')) return 'sticky'
  if (f.startsWith('note:')) return 'sticky'
  if (f.startsWith('custom:')) return 'custom-frame'
  return ''
})
const customFrameSrc = computed(() => {
  const f = props.el.frame || ''
  return f.startsWith('custom:') ? f.slice('custom:'.length) : ''
})
const isSticky = computed(() => frameCls.value === 'sticky')
/* 内置便签 key：frame 形如 sticky:<key>，key 为 NOTE_DESIGNS 的键（含旧色值兼容） */
const stickyKey = computed(() => {
  const f = props.el.frame || ''
  const c = f.split(':')[1]
  return c || STICKY_COLORS[0]
})
/* 自定义便签纸：note: 前缀时用上传图作背景（cover 铺满纸面），否则用内置手账纸面 */
const noteSrc = computed(() => {
  const f = props.el.frame || ''
  return f.startsWith('note:') ? f.slice('note:'.length) : ''
})
/* 内置便签：整张手账纸面（横线/方格/胶带/碎花…，共 16 款），随元素任意拉伸铺满 */
const stickyBg = computed(() => (noteSrc.value
  ? `url("${noteSrc.value}") center / cover no-repeat`
  : `url("${noteBg(stickyKey.value)}") center / 100% 100% no-repeat`))

const textStyle = computed(() => ({
  fontFamily: fontCss(props.el.font),
  // 手账深色墨水：浅色底纸上可读，便利贴内同样清晰
  color: '#4a4036'
}))

const styleObj = computed(() => {
  const t = props.el.type
  // 四边拉伸：sx/sy 为横/纵拉伸系数（默认 1），与整体 scale 相乘后分别作用于两轴
  const sx = (props.el.scale || 1) * (props.el.sx || 1)
  const sy = (props.el.scale || 1) * (props.el.sy || 1)
  const o = {
    transform: `translate(${props.el.x}px, ${props.el.y}px) rotate(${props.el.rotation || 0}deg) scale(${sx}, ${sy})`,
    transformOrigin: 'center center',
    zIndex: props.el.z || 1
  }
  if (t === 'image') o.width = BASE.image + 'px'
  else if (t === 'sticker') o.width = BASE.sticker + 'px'
  else o.fontSize = '18px'
  return o
})

/* ── 指针手势：单指拖拽；双指缩放 + 旋转 + 平移 ── */
const pointers = new Map()
let dragStart = null
let pinch = null
let handle = null // 角点手柄：tl=旋转；br=缩放+旋转二合一

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function angle(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function onDown(e) {
  if (!props.editable) return
  e.stopPropagation()
  try { e.target.setPointerCapture(e.pointerId) } catch (_) {}
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  emit('select')
  if (pointers.size === 1) {
    dragStart = { x: e.clientX, y: e.clientY, elX: props.el.x, elY: props.el.y }
    pinch = null
  } else if (pointers.size === 2) {
    const pts = [...pointers.values()]
    pinch = {
      dist: dist(pts[0], pts[1]),
      angle: angle(pts[0], pts[1]),
      scale: props.el.scale || 1,
      rot: props.el.rotation || 0,
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
      elX: props.el.x,
      elY: props.el.y
    }
    dragStart = null
  }
}

/* ── 角点手柄：左下/右上角拖动做变换 ──
   tl：绕元素中心旋转（角度=指针相对中心的角度差）
   br：二合一——沿径向拖动缩放，沿切向拖动旋转 */
function onHandleDown(e, which) {
  if (!props.editable) return
  try { e.target.setPointerCapture(e.pointerId) } catch (_) {}
  emit('select')
  const box = e.currentTarget.closest('.we')
  const r = box.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const dx = e.clientX - cx
  const dy = e.clientY - cy
  const d = Math.hypot(dx, dy) || 1
  handle = { pid: e.pointerId, which, cx, cy }
  if (which === 'tl') {
    handle.mode = 'rotate'
    handle.startAngle = Math.atan2(dy, dx)
    handle.startRot = props.el.rotation || 0
  } else {
    handle.mode = 'sr'
    handle.ux = dx / d // 径向单位向量（沿角点外指）
    handle.uy = dy / d
    handle.vx = -dy / d // 切向单位向量
    handle.vy = dx / d
    handle.p0x = e.clientX
    handle.p0y = e.clientY
    handle.startDist = d
    handle.startScale = props.el.scale || 1
    handle.startRot = props.el.rotation || 0
  }
}

function applyHandle(e) {
  const el = props.el
  if (handle.mode === 'rotate') {
    const a = Math.atan2(e.clientY - handle.cy, e.clientX - handle.cx)
    el.rotation = handle.startRot + ((a - handle.startAngle) * 180) / Math.PI
  } else {
    const dpx = e.clientX - handle.p0x
    const dpy = e.clientY - handle.p0y
    const radial = dpx * handle.ux + dpy * handle.uy // 径向位移 → 缩放
    const tangent = dpx * handle.vx + dpy * handle.vy // 切向位移 → 旋转
    const ratio = 1 + radial / Math.max(40, handle.startDist * 1.2)
    el.scale = clamp(handle.startScale * ratio, 0.2, 6)
    el.rotation = handle.startRot + (tangent * 0.6) / zf()
  }
}

/* ── 四边拉伸手柄：拖动边中点箭头单独改宽/高（sx/sy），对边保持不动 ── */
let edge = null
function onEdgeDown(e, which) {
  if (!props.editable) return
  try { e.target.setPointerCapture(e.pointerId) } catch (_) {}
  emit('select')
  const box = e.currentTarget.closest('.we')
  // offsetWidth/Height 是未变换的布局尺寸；屏幕位移 ÷ zoom 换算回墙坐标，再 ÷ (布局尺寸×scale) 得到拉伸系数增量
  edge = {
    pid: e.pointerId,
    which,
    x0: e.clientX,
    y0: e.clientY,
    sx0: props.el.sx || 1,
    sy0: props.el.sy || 1,
    ux: Math.max(30, box.offsetWidth * (props.el.scale || 1)), // sx 每加 1 对应的墙坐标宽度
    uy: Math.max(30, box.offsetHeight * (props.el.scale || 1)),
    ex0: props.el.x,
    ey0: props.el.y
  }
}

function applyEdge(e) {
  const el = props.el
  const dx = (e.clientX - edge.x0) / zf()
  const dy = (e.clientY - edge.y0) / zf()
  const r = ((el.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  if (edge.which === 'l' || edge.which === 'r') {
    const dw = edge.which === 'r' ? dx : -dx // 本侧边引起的宽度变化（墙坐标）
    el.sx = clamp(edge.sx0 + dw / edge.ux, 0.3, 6)
    // 对边钉住：中心沿元素本地 x 轴移动 dw/2
    el.x = edge.ex0 + (dw / 2) * cos
    el.y = edge.ey0 + (dw / 2) * sin
  } else {
    const dh = edge.which === 'b' ? dy : -dy
    el.sy = clamp(edge.sy0 + dh / edge.uy, 0.3, 6)
    // 对边钉住：中心沿元素本地 y 轴移动 dh/2（本地 y 轴方向 = (-sin, cos)）
    if (edge.which === 'b') {
      el.x = edge.ex0 - (dh / 2) * sin
      el.y = edge.ey0 + (dh / 2) * cos
    } else {
      el.x = edge.ex0 + (dh / 2) * sin
      el.y = edge.ey0 - (dh / 2) * cos
    }
  }
}

function onMove(e) {
  if (!props.editable) return
  if (handle && handle.pid === e.pointerId) {
    applyHandle(e)
    return
  }
  if (edge && edge.pid === e.pointerId) {
    applyEdge(e)
    return
  }
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 1 && dragStart) {
    const z = zf()
    props.el.x = dragStart.elX + (e.clientX - dragStart.x) / z
    props.el.y = dragStart.elY + (e.clientY - dragStart.y) / z
  } else if (pointers.size === 2 && pinch) {
    const pts = [...pointers.values()]
    const d = dist(pts[0], pts[1])
    const a = angle(pts[0], pts[1])
    const midX = (pts[0].x + pts[1].x) / 2
    const midY = (pts[0].y + pts[1].y) / 2
    const z = zf()
    props.el.scale = clamp((pinch.scale * d) / pinch.dist, 0.2, 6)
    props.el.rotation = pinch.rot + (a - pinch.angle)
    props.el.x = pinch.elX + (midX - pinch.midX) / z
    props.el.y = pinch.elY + (midY - pinch.midY) / z
  }
}

function onUp(e) {
  if (handle && handle.pid === e.pointerId) {
    try { e.target.releasePointerCapture(e.pointerId) } catch (_) {}
    handle = null
    emit('change')
    return
  }
  if (edge && edge.pid === e.pointerId) {
    try { e.target.releasePointerCapture(e.pointerId) } catch (_) {}
    edge = null
    emit('change')
    return
  }
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  try { e.target.releasePointerCapture(e.pointerId) } catch (_) {}
  if (pointers.size === 1) {
    // 抬起一根手指后，用剩下那根继续拖拽，避免位置跳变
    const p = [...pointers.values()][0]
    dragStart = { x: p.x, y: p.y, elX: props.el.x, elY: props.el.y }
    pinch = null
  } else if (pointers.size === 0) {
    dragStart = null
    pinch = null
    emit('change')
  }
}

function onDblClick() {
  if (!props.editable) return
  // 只有文字元素可双击编辑；图片/贴纸双击容易误触改写内容
  if (props.el.type !== 'text') return
  emit('edit-text', props.el)
}
</script>

<style scoped>
.we {
  position: absolute;
  left: 0;
  top: 0;
  user-select: none;
  -webkit-user-select: none;
  box-sizing: border-box;
}
.we.editable { touch-action: none; cursor: grab; }
.we.editable:active { cursor: grabbing; }
.we-media {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 6px;
  pointer-events: none;
}
.we.sticker .we-media { border-radius: 0; }

/* ── 自定义相框：拉伸铺满元素框，盖在照片上方（透明区透出照片） ── */
.we-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}
.we-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  padding: 2px 4px;
  pointer-events: none;
  min-width: 24px;
}
.we.selected {
  outline: 1.5px dashed var(--accent);
  outline-offset: 3px;
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.18));
}
.we.editable:not(.selected) {
  filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.14));
}

/* ── 拍立得白边：下边留宽一些，像真实拍立得 ── */
.we.polaroid {
  padding: 7px 7px 26px;
  background: #fff;
  border-radius: 3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.we.polaroid .we-media { border-radius: 1px; }
/* 拍立得·横版：右边留宽（横放的拍立得） */
.we.polaroid-h { padding: 7px 26px 7px 7px; }

/* ── 一键电子胶带：斜贴一条半透明胶带在元素上方 ── */
.we.tape::before {
  content: '';
  position: absolute;
  top: -11px;
  left: 50%;
  width: 46%;
  height: 22px;
  transform: translateX(-50%) rotate(-5deg);
  background: rgba(197, 164, 126, 0.5);
  border-left: 1px dashed rgba(150, 120, 80, 0.35);
  border-right: 1px dashed rgba(150, 120, 80, 0.35);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  pointer-events: none;
}

/* ── 便利贴：底色 + 右下折角 ── */
.we.sticky .we-sticky {
  padding: 14px 13px 16px;
  min-width: 96px;
  max-width: 230px;
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.14);
  position: relative;
}
.we.sticky .we-sticky::after {
  /* 右下角折角 */
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  border-style: solid;
  border-width: 0 0 16px 16px;
  border-color: transparent transparent rgba(0, 0, 0, 0.1) transparent;
  filter: drop-shadow(-1px -1px 1px rgba(0, 0, 0, 0.06));
}

.we-corner {
  position: absolute;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  z-index: 5;
}
.we-corner::before {
  content: '';
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
}
.we-corner.tl { left: -16px; top: -16px; cursor: grab; }
.we-corner.tl:active { cursor: grabbing; }
.we-corner.br { right: -16px; bottom: -16px; cursor: nwse-resize; }

/* ── 四边拉伸手柄：边中点小圆钮 + 拉伸箭头 ── */
.we-edge {
  position: absolute;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  z-index: 5;
  cursor: ns-resize;
}
.we-edge i {
  font-style: normal;
  font-size: 11px;
  line-height: 1;
  color: var(--accent);
  background: #fff;
  border: 1.5px solid var(--accent);
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
.we-edge.t { left: 50%; top: -12px; transform: translate(-50%, 0); }
.we-edge.b { left: 50%; bottom: -12px; transform: translate(-50%, 0); }
.we-edge.l { left: -12px; top: 50%; transform: translate(0, -50%); cursor: ew-resize; }
.we-edge.r { right: -12px; top: 50%; transform: translate(0, -50%); cursor: ew-resize; }
</style>
