<template>
  <header class="app-header">
    <button v-if="back" class="ah-back" @click="goBack">‹</button>
    <h1 class="ah-title">{{ title }}</h1>
    <div class="ah-right">
      <slot name="right" />
    </div>
  </header>
</template>

<script setup>
import { useRouter } from 'vue-router'

const emit = defineEmits(['back'])
const props = defineProps({
  title: { type: String, default: '' },
  back: { type: Boolean, default: false },
  // 指定返回目标路径；不传则回退到上一页
  backTo: { type: String, default: '' }
})
const router = useRouter()

function goBack() {
  // 父组件可监听 @back 并调用 payload.prevent() 自行接管返回行为
  // （例如返回视图内部的枢纽态而不是离开路由）
  let handled = false
  emit('back', { prevent: () => { handled = true } })
  if (handled) return
  if (props.backTo) {
    router.push(props.backTo)
    return
  }
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<style scoped>
.app-header {
  position: relative;
  flex: 0 0 auto;
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
}
.ah-back {
  position: relative;
  z-index: 1;
  border: none;
  background: transparent;
  font-size: 28px;
  line-height: 1;
  color: var(--text);
  width: 32px;
}
.ah-title {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  font-family: var(--font-serif);
  letter-spacing: 0.5px;
  pointer-events: none;
}
.ah-right {
  position: relative;
  z-index: 1;
  margin-left: auto;
  min-width: 40px;
  display: flex;
  justify-content: flex-end;
}
.ah-right :deep(button) { white-space: nowrap; }
</style>
