<template>
  <div class="boot-brand">
    <span class="boot-brand-text">Eunoia</span>
    <!-- 兔耳朵：改为极细的金色勾边 + 内部极淡的粉色晕染，姿态更修长独立 -->
    <svg class="boot-ears" viewBox="0 0 24 44" aria-hidden="true">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.9" />
          <stop offset="0.5" stop-color="#fff0f5" stop-opacity="0.6" />
          <stop offset="1" stop-color="#ffe4ef" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g class="boot-ears-g" fill="none" stroke="#d4af37" stroke-width="0.8" stroke-linecap="round">
        <!-- 左耳（细长微向左倾） -->
        <path :fill="`url(#${gid})`" d="M 9 42 C 5 25, 6 10, 9 3 C 11 6, 12 15, 11 30 L 9 42 Z" />
        <path d="M 9 42 C 5 25, 6 10, 9 3" />

        <!-- 右耳（细长微向右倾） -->
        <path :fill="`url(#${gid})`" d="M 15 42 C 19 25, 18 10, 15 3 C 13 6, 12 15, 13 30 L 15 42 Z" />
        <path d="M 15 42 C 19 25, 18 10, 15 3" />
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

.boot-brand-text {
  position: relative;
  z-index: 1;
}

.boot-ears {
  position: absolute;
  left: 82%; /* 向右偏移，避免和字母a粘连 */
  bottom: 8px; /* 调整高度，让底部刚好在字母顶部探出 */
  width: 24px;
  height: 44px;
  overflow: visible;
  animation: earSway 4s ease-in-out infinite; /* 摇摆更轻柔、缓慢 */
  transform-origin: 50% 95%;
  pointer-events: none;
}

@keyframes earSway {
  0%, 100% { transform: rotate(-1.5deg); }
  50% { transform: rotate(1.5deg); }
}

@media (prefers-reduced-motion: reduce) {
  .boot-ears { animation: none; }
}
</style>
