<template>
  <div class="sp-view">
    <AppHeader title="关于" back />
    <div class="sp-body">
      <!-- 版本卡片：应用名 + 版本 + 检查更新（右侧） -->
      <div class="panel sec about-hero">
        <div class="logo-row">
          <span class="logo-badge"><AppIcon name="cards" :size="26" color="var(--accent)" /></span>
          <div class="logo-main">
            <span class="app-name">Eunoia字卡</span>
            <span class="app-ver">v0.1.0</span>
          </div>
          <button class="check-btn" type="button" :disabled="checking" @click="onCheck">
            {{ checking ? '检查中…' : (checkMsg || '检查更新') }}
          </button>
        </div>
      </div>

      <!-- 致谢 -->
      <div class="panel sec">
        <h3 class="sec-title">致谢</h3>
        <p class="th-line">心迹和字卡相关的灵感参考感谢：</p>
        <p class="th-line">① Orveal老师</p>
        <p class="th-line">② 小红书：Milk（2777299956）、言序（1842523578）、CCC的S（63090251079）</p>
      </div>

      <!-- 意见反馈 -->
      <div class="panel sec">
        <h3 class="sec-title">意见反馈</h3>
        <div class="fb-item">
          <span class="fb-label">联系方式</span>
          <span class="fb-val">小红书：小狸（8933638733）</span>
        </div>
      </div>

      <!-- 寄语 -->
      <p class="bless">感谢你来到这里，愿你的每一份心意都有处安放。</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { checkForUpdate } from '@/composables/useAutoUpdate'

const checking = ref(false)
const checkMsg = ref('')

async function onCheck() {
  if (checking.value) return
  checking.value = true
  checkMsg.value = ''
  const r = await checkForUpdate()
  checking.value = false
  if (r === 'latest') checkMsg.value = '已是最新版'
  else if (r === 'pending') checkMsg.value = '发现新版本，资源就绪中，稍后再点即可更新'
  else if (r === 'error') checkMsg.value = '检查失败'
}
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.about-hero { display: block; }
.logo-row { display: flex; align-items: center; gap: 12px; }
.logo-badge {
  width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
  background: var(--bg-soft); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.logo-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.app-name { font-size: 18px; font-weight: 700; color: var(--text); }
.app-ver { font-size: 12px; color: var(--text-soft); }
.check-btn {
  flex-shrink: 0;
  border: 1px solid var(--accent);
  background: transparent; color: var(--accent);
  border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
}
.check-btn:disabled { opacity: .6; cursor: default; }
.sec-title { margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--text); }
.th-line { margin: 0 0 6px; font-size: 13px; line-height: 1.8; color: var(--text-soft); }
.th-line:last-child { margin-bottom: 0; }
.bless {
  margin: 0; text-align: center; font-size: 14px; line-height: 1.9;
  color: var(--text-soft); font-weight: 500; letter-spacing: .3px;
}
.fb-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.fb-label { font-size: 14px; color: var(--text); }
.fb-val { font-size: 13px; color: var(--text-soft); text-align: right; }
</style>
