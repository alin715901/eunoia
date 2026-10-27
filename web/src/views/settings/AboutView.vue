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
        <div class="au-row">
          <div class="au-text">
            <span class="au-label">自动检查更新</span>
            <span class="au-sub">{{ webviewTip || '发现新版本后自动刷新（关闭可避免套壳 APK 频繁重刷）' }}</span>
          </div>
          <ToggleSwitch v-model="autoOn" @update:modelValue="onAutoChange" />
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
import { ref, computed } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { checkForUpdate, isAutoUpdateEnabled, setAutoUpdate } from '@/composables/useAutoUpdate'
import { isWebView } from '@/utils/env'

const checking = ref(false)
const checkMsg = ref('')
const autoOn = ref(isAutoUpdateEnabled())

/* 套壳 WebView 环境默认关闭自动更新，给出针对性提示 */
const webviewTip = computed(() => (isWebView() ? '套壳 APK 建议关闭，可避免白屏卡死与反复重刷' : ''))

function onAutoChange(v) {
  setAutoUpdate(v)
  autoOn.value = v
}

async function onCheck() {
  if (checking.value) return
  checking.value = true
  checkMsg.value = ''
  const r = await checkForUpdate()
  checking.value = false
  if (r === 'latest') checkMsg.value = '已是最新版'
  else if (r === 'pending') checkMsg.value = autoOn.value ? '发现新版本，资源就绪中，稍后再点即可更新' : '发现新版本，开启「自动检查更新」或重开 App 即可生效'
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
.au-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border);
}
.au-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.au-label { font-size: 14px; font-weight: 600; color: var(--text); }
.au-sub { font-size: 12px; line-height: 1.5; color: var(--text-soft); }
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
