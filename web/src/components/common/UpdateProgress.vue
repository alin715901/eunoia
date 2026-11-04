<template>
  <transition name="up-fade">
    <div v-if="visible" class="up-mask">
      <div class="up-card">
        <button v-if="status !== 'downloading'" class="up-x" type="button" @click="onClose">×</button>
        <h3 class="up-h">应用更新</h3>

        <template v-if="status === 'downloading'">
          <p class="up-sub">正在下载更新包，请保持应用在前台…</p>
          <div class="up-track">
            <div class="up-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <div class="up-meta">
            <span>{{ progress }}%</span>
            <span v-if="total > 0">{{ fmt(downloaded) }} / {{ fmt(total) }}</span>
            <span v-else>下载中…</span>
          </div>
        </template>

        <template v-else-if="status === 'installing'">
          <div class="up-spin" />
          <p class="up-sub">下载完成，请在弹出的系统安装界面点击「安装」。</p>
          <p class="up-tip">若系统提示「允许安装未知应用」，请先开启本应用的权限，再返回重试。</p>
          <button class="up-btn up-ghost" type="button" @click="onClose">稍后</button>
        </template>

        <template v-else-if="status === 'error'">
          <p class="up-sub up-err">{{ errorMsg || '更新失败' }}</p>
          <div class="up-row">
            <button class="up-btn up-ghost" type="button" @click="onClose">关闭</button>
            <button class="up-btn up-primary" type="button" @click="onRetry">重试</button>
          </div>
        </template>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useUpdater, closeUpdateOverlay, retryUpdate } from '@/composables/useUpdater'

const { visible, progress, status, errorMsg, downloaded, total } = useUpdater()

function onClose() {
  closeUpdateOverlay()
}
function onRetry() {
  retryUpdate()
}
function fmt(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i]
}
</script>

<style scoped>
.up-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 18, 16, 0.42);
  backdrop-filter: blur(2px);
}
.up-card {
  position: relative;
  width: min(320px, 86vw);
  background: var(--bg-screen, #fff);
  border: 1px solid var(--border, #eee);
  border-radius: 18px;
  padding: 22px 20px 20px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  text-align: center;
}
.up-x {
  position: absolute;
  top: 8px;
  right: 12px;
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: var(--text-soft, #999);
  cursor: pointer;
}
.up-h {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #222);
}
.up-sub {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text, #333);
}
.up-tip {
  margin: -6px 0 14px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-soft, #999);
}
.up-err {
  color: #d9483b;
}
.up-track {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--accent, #c5a47e) 16%, transparent);
  overflow: hidden;
}
.up-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in oklab, var(--accent, #c5a47e) 70%, transparent), var(--accent, #c5a47e));
  transition: width 0.25s ease;
}
.up-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-soft, #999);
}
.up-row {
  display: flex;
  gap: 10px;
}
.up-btn {
  flex: 1;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}
.up-primary {
  background: var(--accent, #c5a47e);
  color: #fff;
}
.up-ghost {
  background: transparent;
  border-color: var(--border, #ddd);
  color: var(--text, #333);
}
.up-spin {
  width: 30px;
  height: 30px;
  margin: 4px auto 14px;
  border: 3px solid color-mix(in oklab, var(--accent, #c5a47e) 22%, transparent);
  border-top-color: var(--accent, #c5a47e);
  border-radius: 50%;
  animation: up-spin 0.8s linear infinite;
}
@keyframes up-spin {
  to { transform: rotate(360deg); }
}
.up-fade-enter-active, .up-fade-leave-active { transition: opacity 0.2s ease; }
.up-fade-enter-from, .up-fade-leave-to { opacity: 0; }
</style>
