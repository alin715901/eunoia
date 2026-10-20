<template>
  <div
    class="we"
    :class="[el.type, { editable, selected: selected && editable }]"
    :style="styleObj"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @dblclick.prevent="onDblClick"
  >
    <img
      v-if="el.type === 'image' || el.type === 'sticker'"
      :src="el.content"
      class="we-media"
      alt=""
      draggable="false"
    />
    <div v-else class="we-text">{{ el.content || '双击编辑文字' }}</div>

    <!-- 选中态：四角小把手提示可缩放/旋转 -->
    <span v-if="selected && editable" class="we-corner tl"></span>
    <span v-if="selected && editable" class="we-corner br"></span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  el: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false }
})
const emit = defineEmits(['select', 'change', 'edit-text'])

// 基尺寸（未缩放），缩放/旋转由 transform 承担
const BASE = { image: 150, sticker: 96, text: 0 }

const styleObj = computed(() => {
  const t = props.el.type
  const o = {
    transform: `translate(${props.el.x}px, ${props.el.y}px) rotate(${props.el.rotation || 0}deg) scale(${props.el.scale || 1})`,
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

function onMove(e) {
  if (!props.editable || !pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 1 && dragStart) {
    props.el.x = dragStart.elX + (e.clientX - dragStart.x)
    props.el.y = dragStart.elY + (e.clientY - dragStart.y)
  } else if (pointers.size === 2 && pinch) {
    const pts = [...pointers.values()]
    const d = dist(pts[0], pts[1])
    const a = angle(pts[0], pts[1])
    const midX = (pts[0].x + pts[1].x) / 2
    const midY = (pts[0].y + pts[1].y) / 2
    props.el.scale = clamp((pinch.scale * d) / pinch.dist, 0.2, 6)
    props.el.rotation = pinch.rot + (a - pinch.angle)
    props.el.x = pinch.elX + (midX - pinch.midX)
    props.el.y = pinch.elY + (midY - pinch.midY)
  }
}

function onUp(e) {
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
.we-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
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
  filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.12));
}
.we-corner {
  position: absolute;
  width: 9px;
  height: 9px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid #fff;
}
.we-corner.tl { left: -6px; top: -6px; }
.we-corner.br { right: -6px; bottom: -6px; }
</style>
