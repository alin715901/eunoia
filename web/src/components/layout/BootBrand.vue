<template>
  <div class="boot-brand">
    <span class="boot-brand-text">Eunoia</span>
    <!-- 兔耳朵：从「o」后面探出来，粉白渐变 + 轻微摇摆 -->
    <svg class="boot-ears" viewBox="0 0 56 58" aria-hidden="true">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.5" stop-color="#fff5f9" />
          <stop offset="1" stop-color="#ffc7dd" />
        </linearGradient>
      </defs>
      <g class="boot-ears-g">
        <!-- 左耳 -->
        <ellipse
          cx="19" cy="30" rx="7.6" ry="25"
          :fill="`url(#${gid})`"
          stroke="rgba(206,120,152,0.4)"
          stroke-width="1.1"
          transform="rotate(8 19 30)"
        />
        <!-- 右耳 -->
        <ellipse
          cx="39" cy="30" rx="7.6" ry="25"
          :fill="`url(#${gid})`"
          stroke="rgba(206,120,152,0.4)"
          stroke-width="1.1"
          transform="rotate(15 39 30)"
        />
        <!-- 内耳（粉） -->
        <ellipse cx="19" cy="32" rx="3.6" ry="17" fill="#ff9dc4" opacity="0.5" transform="rotate(8 19 32)" />
        <ellipse cx="39" cy="32" rx="3.6" ry="17" fill="#ff9dc4" opacity="0.5" transform="rotate(15 39 32)" />
      </g>
    </svg>
  </div>
</template>

<script setup>
/* 渐变 id 带实例后缀，避免同页多实例（如加载态/错误态切换）时 id 冲突 */
const gid = 'bootEarGrad-' + Math.random().toString(36).slice(2, 8)
</script>

<style scoped>
.boot-brand {
  position: relative;
  font-family: var(--font-serif);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--accent);
  line-height: 1;
}
.boot-brand-text { position: relative; z-index: 1; }
.boot-ears {
  position: absolute;
  left: 39%;
  bottom: 68%;
  width: 64px;
  height: 66px;
  overflow: visible;
  animation: earSway 3.4s ease-in-out infinite;
  transform-origin: 50% 92%;
  pointer-events: none;
}
@keyframes earSway {
  0%, 100% { transform: rotate(-2.6deg); }
  50% { transform: rotate(2.6deg); }
}
@media (prefers-reduced-motion: reduce) {
  .boot-ears { animation: none; }
}
</style>
