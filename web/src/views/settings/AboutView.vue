<template>
  <div class="sp-view">
    <AppHeader title="关于" back />
    <div class="sp-body">
      <!-- 版本卡片：应用名 + 版本 + 检查更新 -->
      <div class="panel sec about-hero">
        <div class="logo-row">
          <span class="logo-badge"><AppIcon name="cards" :size="26" color="var(--accent)" /></span>
          <div class="logo-main">
            <span class="app-name">Eunoia字卡</span>
            <span class="app-ver">v0.1.0</span>
          </div>
        </div>
        <button class="check-btn" type="button" :disabled="checking" @click="onCheck">
          {{ checking ? '检查中…' : (checkMsg || '检查更新') }}
        </button>
      </div>

      <!-- 更新日志 -->
      <div class="panel sec">
        <h3 class="sec-title">更新日志</h3>
        <div class="changelog">
          <div class="cl-ver">v0.1.0</div>
          <ul class="cl-list">
            <li>首次发布：字卡、聊天、朋友圈、信件、纪念、陪伴、占卜、感知、心迹、音乐、影院、游戏、心情、备忘录、经期、相册、统计等模块上线。</li>
            <li>支持云端同步（阿里云 OSS）与本地备份导出 / 导入。</li>
            <li>接入 MiniMax 语音，文字字卡可按概率转为语音消息。</li>
          </ul>
        </div>
      </div>

      <!-- 致谢寄语 -->
      <p class="bless">感谢你来到这里，愿你的每一份心意都有处安放。</p>

      <!-- 意见反馈 -->
      <div class="panel sec">
        <h3 class="sec-title">意见反馈</h3>
        <div class="fb-item">
          <span class="fb-label">联系方式</span>
          <span class="fb-val">（预留位置，待补充）</span>
        </div>
      </div>
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
  else if (r === 'error') checkMsg.value = '检查失败，请稍后再试'
}
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.about-hero { display: flex; flex-direction: column; gap: 14px; }
.logo-row { display: flex; align-items: center; gap: 12px; }
.logo-badge {
  width: 52px; height: 52px; border-radius: 14px;
  background: var(--bg-soft); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.logo-main { display: flex; flex-direction: column; gap: 2px; }
.app-name { font-size: 18px; font-weight: 700; color: var(--text); }
.app-ver { font-size: 12px; color: var(--text-soft); }
.check-btn {
  align-self: flex-start;
  border: 1px solid var(--accent);
  background: transparent; color: var(--accent);
  border-radius: 999px; padding: 7px 18px; font-size: 13px; font-weight: 600;
  cursor: pointer;
}
.check-btn:disabled { opacity: .6; cursor: default; }
.sec-title { margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--text); }
.changelog { display: flex; flex-direction: column; gap: 6px; }
.cl-ver { font-size: 13px; font-weight: 700; color: var(--accent); }
.cl-list { margin: 0; padding-left: 18px; }
.cl-list li { margin-bottom: 6px; font-size: 13px; line-height: 1.7; color: var(--text-soft); }
.cl-list li:last-child { margin-bottom: 0; }
.bless {
  margin: 0; text-align: center; font-size: 14px; line-height: 1.9;
  color: var(--text-soft); font-weight: 500; letter-spacing: .3px;
}
.fb-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.fb-label { font-size: 14px; color: var(--text); }
.fb-val { font-size: 13px; color: var(--text-soft); }
</style>
