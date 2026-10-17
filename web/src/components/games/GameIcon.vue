<template>
  <svg
    class="game-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="{ color: color || iconColor }"
    v-html="iconPaths"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
  /* 默认用每款图标自带的主题色，也可由外部覆盖（如传 var(--accent)） */
  color: { type: String, default: '' }
})

/* 七款小游戏的身份图标：24 网格线性描边 + 每款一个主题色。
   为什么用 SVG 而不是字体 emoji：彩色 emoji 字体（Apple Color Emoji 尤为明显）
   的字形墨盒在 em 方块内自带光学偏移，且各平台度量不一，
   任何 line-height / flex 居中都只能对齐「行盒」而对不齐「墨盒」；
   SVG 的墨盒就是 viewBox 本身，任何设备上都是像素级居中。 */
const ICONS = {
  /* 默契翻牌：一张牌 + 中央闪光（翻牌瞬间的「配对」高亮） */
  memory: {
    color: '#7c6aef',
    d: '<rect x="6.5" y="3.5" width="11" height="17" rx="2.5"/><path d="M12 8.3c.3 2.1 1.4 3.2 3.5 3.5-2.1.3-3.2 1.4-3.5 3.5-.3-2.1-1.4-3.2-3.5-3.5 2.1-.3 3.2-1.4 3.5-3.5z"/>'
  },
  /* 抽鬼牌：小鬼——圆顶 + 波浪尾巴 + 双眼 */
  ghost: {
    color: '#8e9eb3',
    d: '<path d="M7 11V7a5 5 0 0 1 10 0v4l-1.4 1.15a1.2 1.2 0 0 0-2.4 0l-.7.45a1.2 1.2 0 0 0-2.4 0l-.7-.45a1.2 1.2 0 0 0-2.4 0z"/><path d="M10 9.6h.01M14 9.6h.01"/>'
  },
  /* 五子棋：棋盘 + 一颗落子 */
  gomoku: {
    color: '#52525b',
    d: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8.8 3.5v17M15.2 3.5v17M3.5 8.8h17M3.5 15.2h17"/><circle cx="8.8" cy="8.8" r="2.1" fill="currentColor" stroke="none"/>'
  },
  /* 围棋：棋盘 + 一黑一白两颗子 */
  go: {
    color: '#d97706',
    d: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8.8 3.5v17M15.2 3.5v17M3.5 8.8h17M3.5 15.2h17"/><circle cx="8.8" cy="8.8" r="1.7" fill="currentColor" stroke="none"/><circle cx="15.2" cy="15.2" r="2.3"/>'
  },
  /* 飞行棋：俯视飞机（实心剪影） */
  aeroplane: {
    color: '#0ea5e9',
    d: '<path fill="currentColor" stroke="none" d="M12 2.6c.85 0 1.55 1.5 1.55 3.5v3.3l6.9 3.4v2l-6.9-2v3.7l2.3 1.7v1.6L12 19.2l-3.85 1.1v-1.6l2.3-1.7v-3.7l-6.9 2v-2l6.9-3.4V6.1c0-2 .7-3.5 1.55-3.5z"/>'
  },
  /* 猜拳：剪刀手（✌️）——最具辨识度的猜拳手势 */
  rps: {
    color: '#f43f5e',
    d: '<path d="M9.2 11.8V6.2a1.6 1.6 0 0 1 3.2 0v5.6"/><path d="M13.8 11.8V7.6a1.6 1.6 0 0 1 3.2 0v4.2"/><path d="M9.2 11.8h7.8v4a4.3 4.3 0 0 1-4.3 4.3h-2.2A4.3 4.3 0 0 1 6 15.8v-2.3a2.4 2.4 0 0 1 3.2-1.7z"/>'
  },
  /* 猜数：问号方块（猜 1-100） */
  guess: {
    color: '#10b981',
    d: '<rect x="4.5" y="4.5" width="15" height="15" rx="4.5"/><path d="M9.7 9.6a2.5 2.5 0 1 1 3.5 2.3c-.8.3-1 .9-1 1.6"/><path d="M12.2 16.3h.01"/>'
  }
}

const icon = computed(() => ICONS[props.name] || null)
const iconColor = computed(() => (icon.value ? icon.value.color : 'currentColor'))
const iconPaths = computed(() => (icon.value ? icon.value.d : ''))
</script>

<style scoped>
.game-icon {
  display: block;
}
</style>
