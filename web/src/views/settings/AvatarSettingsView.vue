<template>
  <div class="sp-view">
    <AppHeader title="头像形状" back />
    <div class="sp-body">
      <!-- 预览：模拟聊天里的样子（头像 + 气泡） -->
      <div class="panel sec">
        <div class="sec-title">预览</div>
        <div class="chat-mock">
          <div class="mk-row" :style="{ alignItems: alignOf(pos) }">
            <span class="mk-ava" :style="mockAvaStyle(themName, themAvatar)"></span>
            <span class="mk-bubble contact">在忙什么呀？今天有想分享的事吗～</span>
          </div>
          <div class="mk-row me" :style="{ alignItems: alignOf(pos) }">
            <span class="mk-ava" :style="mockAvaStyle(myName, myAvatar)"></span>
            <span class="mk-bubble me">刚下班，正在想吃什么呢 (´▽`)</span>
          </div>
        </div>
      </div>

      <!-- 形状 -->
      <div class="panel sec">
        <div class="sec-title">头像形状</div>
        <div class="seg">
          <button :class="{ on: shape === 'circle' }" @click="setShape('circle')">圆形</button>
          <button :class="{ on: shape === 'square' }" @click="setShape('square')">方形</button>
        </div>
        <div v-if="shape === 'square'" class="slider-row">
          <label>圆角大小 {{ radius }}px</label>
          <input type="range" min="0" max="24" v-model.number="radius" @input="queueSave" class="slider" />
        </div>
      </div>

      <!-- 尺寸 -->
      <div class="panel sec">
        <div class="sec-title">头像尺寸</div>
        <div class="slider-row">
          <label>尺寸 {{ size }}px</label>
          <input type="range" min="28" max="56" step="2" v-model.number="size" @input="queueSave" class="slider" />
        </div>
      </div>

      <!-- 位置 -->
      <div class="panel sec">
        <div class="sec-title">头像位置</div>
        <div class="seg">
          <button :class="{ on: pos === 'bottom' }" @click="setPos('bottom')">底部</button>
          <button :class="{ on: pos === 'center' }" @click="setPos('center')">居中</button>
          <button :class="{ on: pos === 'top' }" @click="setPos('top')">顶部</button>
        </div>
        <p class="hint">头像相对气泡的对齐方式：底部对齐、垂直居中或顶部对齐</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { contact, settings, load, patch } = useContactSettingsPage(props.id)

const shape = ref('circle')
const radius = ref(12)
const size = ref(36)
const pos = ref('bottom')

const themName = computed(() => contact.value?.name || settings.value?.name || '对方')
const themAvatar = computed(() => contact.value?.avatar || settings.value?.avatar || '')
const myName = computed(() => settings.value?.my_name || '我')
const myAvatar = computed(() => settings.value?.my_avatar || '')

const alignOf = (p) => (p === 'center' ? 'center' : p === 'top' ? 'flex-start' : 'flex-end')

/* 预览头像：用背景图（若有）或纯色占位，套用形状与圆角/尺寸 */
function mockAvaStyle(name, avatar) {
  const s = {
    width: size.value + 'px',
    height: size.value + 'px',
    borderRadius: shape.value === 'circle' ? '50%' : radius.value + 'px'
  }
  if (avatar) {
    s.backgroundImage = `url(${avatar})`
    s.backgroundSize = 'cover'
    s.backgroundPosition = 'center'
  } else {
    s.background = 'linear-gradient(135deg,#cfd8e3,#aab6c8)'
    s.display = 'flex'
    s.alignItems = 'center'
    s.justifyContent = 'center'
    s.color = '#fff'
    s.fontSize = Math.max(11, size.value * 0.34) + 'px'
    s.fontWeight = '700'
  }
  return s
}

function setShape(v) { shape.value = v; queueSave() }
function setPos(v) { pos.value = v; queueSave() }
function queueSave() {
  clearTimeout(queueSave._t)
  queueSave._t = setTimeout(doSave, 350)
}
async function doSave() {
  try {
    await patch({
      avatar_shape: shape.value,
      avatar_radius: radius.value,
      avatar_size: size.value,
      avatar_pos: pos.value
    })
  } catch (e) { /* ignore */ }
}

onMounted(async () => {
  const s = await load()
  if (!s) return
  shape.value = s.avatar_shape || 'circle'
  radius.value = s.avatar_radius ?? 12
  size.value = s.avatar_size ?? 36
  pos.value = s.avatar_pos || 'bottom'
})
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 10px 0 0; }
.hint.center { text-align: center; }
.sec-title:first-child { margin-top: 12px; }

/* 聊天预览 */
.chat-mock {
  background: linear-gradient(180deg, var(--bg-soft) 0%, var(--bg-screen) 100%);
  border-radius: 12px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mk-row { display: flex; gap: 8px; }
.mk-row.me { flex-direction: row-reverse; }
.mk-ava { flex: 0 0 auto; }
.mk-bubble {
  max-width: 70%;
  padding: 9px 13px;
  font-size: 14px;
  line-height: 1.45;
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.mk-bubble.contact { background: #f0f0f2; color: var(--text); border-bottom-left-radius: 4px; }
.mk-bubble.me { background: #3a3a3a; color: #fff; border-bottom-right-radius: 4px; }

.seg { display: flex; gap: 8px; }
.seg button { flex: 1; border: 1px solid var(--border); background: var(--bg-soft); border-radius: 12px; padding: 8px; font-weight: 600; color: var(--text-soft); }
.seg button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.slider-row { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.slider-row label { font-size: 13px; color: var(--text-soft); white-space: nowrap; }
.slider { width: 100%; accent-color: var(--accent); }
</style>
