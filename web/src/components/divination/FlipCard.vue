<template>
  <div class="flip" :class="[size, { flipped }]" @click="onFlip">
    <div class="flip-inner">
      <!-- 牌背：深蓝 + 金色星月徽记 -->
      <div class="face back">
        <svg viewBox="0 0 24 24" class="emblem" aria-hidden="true">
          <path d="M20 14.4A8.2 8.2 0 1 1 9.6 4 8.2 8.2 0 0 0 20 14.4z" fill="none" stroke="currentColor" stroke-width="1.4" />
          <path d="M15.5 4.5l.9 1.9 2.1.3-1.5 1.5.35 2.1-1.85-1-1.85 1 .35-2.1-1.5-1.5 2.1-.3z" fill="currentColor" />
        </svg>
        <span class="back-tip" v-if="!flipped">轻触翻开</span>
      </div>
      <!-- 翻开：牌义 -->
      <div class="face front">
        <div class="f-name">{{ card?.name }}</div>
        <div class="f-orient" v-if="card?.rev !== undefined" :class="card.rev ? 'rev' : 'up'">
          {{ card.rev ? '逆位' : '正位' }}
        </div>
        <div class="f-mean">{{ card?.rev ? card.reversed : card?.upright || card?.meaning }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  card: { type: Object, default: null },
  flipped: { type: Boolean, default: false },
  size: { type: String, default: 'normal' } // 'normal' | 'big'
})
const emit = defineEmits(['flip'])
function onFlip() {
  if (!props.flipped) emit('flip')
}
</script>

<style scoped>
.flip {
  width: 100%;
  height: 150px;
  perspective: 800px;
  cursor: pointer;
}
.flip.big { height: 230px; max-width: 160px; margin: 0 auto; }
.flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.4, 0.1, 0.2, 1);
  transform-style: preserve-3d;
}
.flip.flipped .flip-inner { transform: rotateY(180deg); }
.face {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 顶部对齐：三张牌释义行数不同时，牌名仍保持在同一水平线 */
  justify-content: flex-start;
  padding: 24px 12px 12px;
  box-sizing: border-box;
}
.back {
  background: linear-gradient(155deg, #243b66 0%, #131f3b 60%, #0b1326 100%);
  color: #e9c977;
  border: 1px solid rgba(233, 201, 119, 0.35);
  box-shadow: inset 0 0 0 4px rgba(233, 201, 119, 0.12);
}
.emblem { width: 46px; height: 46px; }
.flip.big .emblem { width: 64px; height: 64px; }
.back-tip { margin-top: 12px; font-size: 11px; color: rgba(233, 201, 119, 0.7); font-family: var(--font-serif); letter-spacing: 2px; }
.front {
  transform: rotateY(180deg);
  background: var(--bg-soft);
  border: 1px solid var(--border);
}
.f-name { font-family: var(--font-serif); font-size: 18px; font-weight: 700; color: var(--text); text-align: center; }
.flip.big .f-name { font-size: 22px; }
.f-orient { font-size: 11px; padding: 2px 9px; border-radius: 999px; margin-top: 6px; }
.f-orient.up { background: var(--bg-screen); color: var(--text-soft); }
.f-orient.rev { background: #f6e0e0; color: #b5656b; }
.f-mean { font-size: 12px; color: var(--text); line-height: 1.55; margin-top: 8px; text-align: center; }
</style>
