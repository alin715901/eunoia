<template>
  <div class="boot-brand">
    <span class="boot-brand-text">Eunoia</span>
    <!-- 兔耳朵：透明底 PNG 切图，绝对定位于「a」上方探出，带轻柔摇摆 -->
    <img src="/boot-ears.png" class="boot-ears-img" alt="" aria-hidden="true" />
  </div>
</template>

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

.boot-ears-img {
  position: absolute;
  right: -5px; /* 水平对准字母 a 上方略偏右 */
  top: -16px; /* 与字母 a 顶部保持一定间距，不贴脸 */
  width: 28px;
  height: auto;
  pointer-events: none;
  animation: earSway 4s ease-in-out infinite;
  transform-origin: bottom center;
}

@keyframes earSway {
  0%, 100% { transform: rotate(-1.5deg); }
  50% { transform: rotate(1.5deg); }
}

@media (prefers-reduced-motion: reduce) {
  .boot-ears-img { animation: none; }
}
</style>
